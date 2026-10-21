// Semak supplier (architecture §5): checks run in parallel, the result is a risk level with
// reasons in BM/EN, and any bank-detail change puts the payment on hold with a callback checklist.
import type {
  HoldChecklistInput,
  HoldDecisionInput,
  PageQuery,
  SupplierCheckInput,
  SupplierCheckResult,
  SupplierInput,
} from "@crowdshield/contracts";
import {
  entity,
  invoiceCheck,
  observation,
  paymentHold,
  scamCase,
  source,
  supplier,
} from "@crowdshield/db";
import {
  type DbOrTx,
  linkCaseEntities,
  recomputeWithNeighbours,
  upsertEntity,
} from "@crowdshield/graph";
import { SCAM_TYPE_ACTION, type Text } from "@crowdshield/i18n";
import { identify, normalise, normaliseSsmNo, normaliseTin } from "@crowdshield/normalise";
import { BadRequestException, Controller, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import { AuditService } from "../../common/audit.js";
import { MlClient } from "../../common/ml.js";
import {
  CurrentPrincipal,
  type Principal,
  requireUser,
  type UserPrincipal,
} from "../../common/auth.js";
import { Body, Query, Route, UuidParam } from "../../common/route.js";
import { VerdictService } from "../../common/verdicts.js";
import { Config } from "../../config.js";
import { type Db, InjectDb } from "../../infra.js";
import { campaignList } from "../entities.js";
import { GraphActions } from "../graph-actions.js";
import {
  type AccountNameAdapter,
  bankAccountValue,
  looksLikeCompany,
  mockAccountName,
  mockMyInvois,
  mockSsm,
  type MyInvoisAdapter,
  normaliseCompanyName,
  type SsmAdapter,
} from "./registries.js";

type CheckInput = z.output<typeof SupplierCheckInput>;
type Result = z.output<typeof SupplierCheckResult>;
type Check = Result["checks"][number];
type SupplierRow = typeof supplier.$inferSelect;

const FREE_MAIL = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "proton.me",
  "ymail.com",
]);
const NEW_COMPANY_MONTHS = 6;
const STAGED_PAYMENT_THRESHOLD = 10_000;

const t = (en: string, ms: string): Text => ({ en, ms });

/** Dice coefficient on character bigrams: 1 = identical. */
function similarity(a: string, b: string) {
  const grams = (s: string) => {
    const x = s.toLowerCase();
    const m = new Map<string, number>();
    for (let i = 0; i < x.length - 1; i++)
      m.set(x.slice(i, i + 2), (m.get(x.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let overlap = 0;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  const total = Math.max(a.length - 1, 0) + Math.max(b.length - 1, 0);
  return total ? (2 * overlap) / total : a === b ? 1 : 0;
}

const domainOf = (email: string | undefined) => email?.split("@")[1]?.toLowerCase().trim();

function checklistFor(s: SupplierRow | null) {
  const phone = s?.callbackPhone ?? "a number from your own records";
  return [
    {
      step: "callback",
      label: t(
        `Call ${s?.name ?? "the supplier"} on ${phone} (from your own records), not a number in the email or invoice`,
        `Hubungi ${s?.name ?? "pembekal"} di ${phone} (daripada rekod anda sendiri), bukan nombor dalam e-mel atau invois`,
      ),
      done: false,
      at: null,
      by: null,
    },
    {
      step: "written",
      label: t(
        "Get the change confirmed in writing on letterhead, signed by a director you know",
        "Dapatkan pengesahan bertulis atas kepala surat, ditandatangani oleh pengarah yang anda kenali",
      ),
      done: false,
      at: null,
      by: null,
    },
    {
      step: "account_name",
      label: t(
        "Check the new account is in the company's name, not a person's",
        "Pastikan akaun baharu atas nama syarikat, bukan individu",
      ),
      done: false,
      at: null,
      by: null,
    },
    {
      step: "second_approver",
      label: t(
        "A second person approves before the payment is released",
        "Orang kedua meluluskan sebelum pembayaran dilepaskan",
      ),
      done: false,
      at: null,
      by: null,
    },
  ];
}
type ChecklistItem = ReturnType<typeof checklistFor>[number] & {
  at: string | null;
  by: string | null;
};

@Injectable()
export class SupplierCheckService {
  private readonly ssm: SsmAdapter = mockSsm;
  private readonly myinvois: MyInvoisAdapter = mockMyInvois;
  private readonly accountName: AccountNameAdapter = mockAccountName;

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly config: Config,
    private readonly verdicts: VerdictService,
    private readonly audit: AuditService,
    private readonly ml: MlClient,
  ) {}

  async check(input: CheckInput, p: UserPrincipal): Promise<Result> {
    const inv = input.invoice;
    const known = await this.findSupplier(p.orgId, input.supplierId, inv);
    const accountValue = inv.account ? bankAccountValue(inv.bank, inv.account) : undefined; // throws 400 if malformed
    const accountHash = accountValue
      ? identify("bank_account", accountValue, this.config.pepper).lookupHash
      : undefined;
    const accountMasked = accountValue ? normalise("bank_account", accountValue).masked : undefined;
    const companyName = inv.supplierName ?? known?.name;

    const bankDetailChanged = Boolean(
      inv.bankChangeLanguage ||
      (known?.accountHash && accountHash && !known.accountHash.equals(accountHash)),
    );

    const checks = (
      await Promise.all([
        this.ssmCheck(inv.ssmNo ?? known?.ssmNo ?? undefined, companyName),
        this.tinCheck(inv.tin ?? known?.tin ?? undefined, inv.ssmNo ?? known?.ssmNo ?? undefined),
        this.einvoiceCheck(inv.einvoiceUuid),
        this.accountNameCheck(accountValue, companyName),
        this.graphCheck(accountValue, inv.bank, inv.phone, domainOf(inv.emailFrom)),
        this.historyCheck(known, inv.tin, accountHash, accountMasked, bankDetailChanged),
        this.emailCheck(known, inv.emailFrom, inv.replyTo),
      ])
    ).filter((c): c is Check => c !== null);
    const web = companyName
      ? await this.webChecks(
          companyName,
          known?.emailDomain ?? null,
          inv.phone,
          known?.callbackPhone ?? null,
        )
      : null;
    if (web) checks.push(...web.checks);

    const failed = checks.some((c) => c.status === "fail");
    const warned = checks.some((c) => c.status === "warn");
    const risk = failed ? "high" : warned || bankDetailChanged ? "caution" : "low";

    const actions: Text[] = [];
    if (checks.some((c) => c.key === "graph" && c.status === "fail"))
      actions.push(
        t(
          "Do not pay. This account or contact is linked to scam reports.",
          "Jangan bayar. Akaun atau hubungan ini dikaitkan dengan laporan scam.",
        ),
      );
    if (bankDetailChanged) actions.push(SCAM_TYPE_ACTION.bec_supplier!);
    if (checks.some((c) => c.key === "account_name" && c.status === "fail"))
      actions.push(
        t(
          "Pay only to an account in the company's name.",
          "Bayar hanya ke akaun atas nama syarikat.",
        ),
      );
    if (!known && (inv.amountMyr ?? 0) >= STAGED_PAYMENT_THRESHOLD)
      actions.push(
        t(
          "New supplier: pay in stages, use escrow, or pay on delivery.",
          "Pembekal baharu: bayar secara berperingkat, guna escrow, atau bayar semasa penghantaran.",
        ),
      );
    if (risk === "low")
      actions.push(
        t(
          "No problems found. Keep to your usual approval steps; this is not a guarantee.",
          "Tiada masalah ditemui. Teruskan langkah kelulusan biasa anda; ini bukan jaminan.",
        ),
      );
    if (!actions.length)
      actions.push(
        risk === "high"
          ? t(
              "Do not pay until the supplier resolves the problems below.",
              "Jangan bayar sehingga pembekal menyelesaikan masalah di bawah.",
            )
          : t(
              "Check the warnings below with the supplier before paying.",
              "Semak amaran di bawah dengan pembekal sebelum membayar.",
            ),
      );

    // Keep a graph entity for a suspicious new account so a later rejection can report it
    const suspicious = bankDetailChanged || failed;
    const accountEntityId =
      suspicious && accountValue
        ? (await upsertEntity(this.db, this.config.secrets, "bank_account", accountValue)).id
        : null;
    const phoneEntityId =
      suspicious && inv.phone
        ? (await upsertEntity(this.db, this.config.secrets, "phone", inv.phone)).id
        : null;

    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(invoiceCheck)
        .values({
          orgId: p.orgId,
          supplierId: known?.id,
          submittedBy: p.userId,
          channel: input.channel,
          evidenceUri: input.evidenceUri,
          // stored without raw identifiers: masked account, entity ids, email domains only
          extracted: {
            supplierName: inv.supplierName,
            ssmNo: inv.ssmNo,
            tin: inv.tin,
            invoiceNo: inv.invoiceNo,
            einvoiceUuid: inv.einvoiceUuid,
            accountMasked,
            accountEntityId,
            phoneEntityId,
            accountHolderName: inv.accountHolderName,
            emailDomain: domainOf(inv.emailFrom),
            replyToDomain: domainOf(inv.replyTo),
            bankChangeLanguage: inv.bankChangeLanguage,
            urgencyLanguage: inv.urgencyLanguage,
          },
          risk,
          bankDetailChanged,
          amountMyr: inv.amountMyr?.toFixed(2),
        })
        .returning({ id: invoiceCheck.id });
      const checkId = row!.id;
      let holdId: string | null = null;
      if (bankDetailChanged) {
        const [h] = await tx
          .insert(paymentHold)
          .values({ orgId: p.orgId, invoiceCheckId: checkId, checklist: checklistFor(known) })
          .returning({ id: paymentHold.id });
        holdId = h!.id;
      }
      const result: Result = {
        checkId,
        supplier: known ? { id: known.id, name: known.name } : null,
        risk,
        checks,
        bankDetailChanged,
        holdId,
        actions,
        officialContact: web?.official ?? null,
      };
      await tx.update(invoiceCheck).set({ result }).where(eq(invoiceCheck.id, checkId));
      await this.audit.log(
        p,
        "supplier_check",
        accountEntityId,
        { checkId, risk, bankDetailChanged },
        tx,
      );
      return result;
    });
  }

  /**
   * Tavily via the ML gateway (techstacks_7 §4): the company's official contact from its own website,
   * and web reputation. Leads only; if the gateway is down the checks say "unavailable".
   */
  private async webChecks(
    company: string,
    domain: string | null,
    invoicePhone: string | undefined,
    recordsPhone: string | null,
  ) {
    type Web = {
      officialContact: { phone: string | null; email: string | null; sourceUrl: string } | null;
      reputation: { title: string; url: string; relevant: boolean }[];
    };
    const source = "Web (Tavily)";
    let web: Web;
    try {
      web = await this.ml.post<Web>("/v1/web/supplier", { company, domain }, 25_000);
    } catch {
      const reason = t("Web check unavailable right now.", "Semakan web tidak tersedia sekarang.");
      return {
        official: null,
        checks: [
          { key: "official_contact", status: "unavailable", source, reason },
          { key: "web_reputation", status: "unavailable", source, reason },
        ] as Check[],
      };
    }
    const checks: Check[] = [];
    const oc = web.officialContact;
    const official = oc
      ? { phone: oc.phone ?? undefined, email: oc.email ?? undefined, sourceUrl: oc.sourceUrl }
      : null;
    const samePhone = (a: string | null | undefined, b: string | null | undefined) => {
      if (!a || !b) return false;
      try {
        return normalise("phone", a).value === normalise("phone", b).value;
      } catch {
        return false;
      }
    };
    const links = oc ? [oc.sourceUrl] : undefined;
    if (recordsPhone) {
      // A known supplier: the number in the business's own records is the authority;
      // the website number is only a cross-check.
      const webNote =
        oc?.phone && !samePhone(oc.phone, recordsPhone)
          ? t(
              ` The company's website lists ${oc.phone}; confirm which is current.`,
              ` Laman web syarikat menyenaraikan ${oc.phone}; sahkan yang terkini.`,
            )
          : t("", "");
      if (invoicePhone && !samePhone(invoicePhone, recordsPhone)) {
        checks.push({
          key: "official_contact",
          status: "warn",
          source: "Your supplier records",
          links,
          reason: t(
            `The phone on the invoice (${invoicePhone}) isn't the number in your records (${recordsPhone}). Call ${recordsPhone}.${webNote.en}`,
            `Telefon pada invois (${invoicePhone}) bukan nombor dalam rekod anda (${recordsPhone}). Hubungi ${recordsPhone}.${webNote.ms}`,
          ),
        });
      } else {
        checks.push({
          key: "official_contact",
          status: webNote.en ? "warn" : "pass",
          source: "Your supplier records",
          links,
          reason: t(
            `Contact matches your records (${recordsPhone}).${webNote.en}`,
            `Hubungan sepadan dengan rekod anda (${recordsPhone}).${webNote.ms}`,
          ),
        });
      }
    } else if (!oc?.phone) {
      checks.push({
        key: "official_contact",
        status: "unavailable",
        source,
        reason: t(
          `No official website contact found for ${company}.`,
          `Tiada hubungan laman web rasmi ditemui untuk ${company}.`,
        ),
      });
    } else if (!invoicePhone || samePhone(invoicePhone, oc.phone)) {
      checks.push({
        key: "official_contact",
        status: "pass",
        source,
        links,
        reason: t(
          `Official number from the company's website: ${oc.phone}.`,
          `Nombor rasmi daripada laman web syarikat: ${oc.phone}.`,
        ),
      });
    } else {
      checks.push({
        key: "official_contact",
        status: "warn",
        source,
        links,
        reason: t(
          `The invoice's phone isn't the company's official number (${oc.phone}, from its website). Call that number instead.`,
          `Telefon pada invois bukan nombor rasmi syarikat (${oc.phone}, daripada laman webnya). Hubungi nombor itu.`,
        ),
      });
    }
    const bad = web.reputation.filter((r) => r.relevant);
    checks.push(
      bad.length
        ? {
            key: "web_reputation",
            status: "warn",
            source,
            links: bad.slice(0, 3).map((r) => r.url),
            reason: t(
              `${bad.length} web mention(s) of complaints or scams about ${company}.`,
              `${bad.length} sebutan web tentang aduan atau scam berkaitan ${company}.`,
            ),
          }
        : {
            key: "web_reputation",
            status: "pass",
            source,
            reason: t(
              `No scam complaints found on the web for ${company}.`,
              `Tiada aduan scam ditemui di web untuk ${company}.`,
            ),
          },
    );
    return { official, checks };
  }

  private async findSupplier(
    orgId: string,
    supplierId: string | undefined,
    inv: CheckInput["invoice"],
  ) {
    if (supplierId) {
      const [s] = await this.db
        .select()
        .from(supplier)
        .where(and(eq(supplier.id, supplierId), eq(supplier.orgId, orgId)));
      if (!s) throw new NotFoundException("Supplier not found");
      return s;
    }
    if (inv.ssmNo) {
      const [s] = await this.db
        .select()
        .from(supplier)
        .where(and(eq(supplier.orgId, orgId), eq(supplier.ssmNo, normaliseSsmNo(inv.ssmNo))));
      if (s) return s;
    }
    if (inv.tin) {
      const [s] = await this.db
        .select()
        .from(supplier)
        .where(and(eq(supplier.orgId, orgId), eq(supplier.tin, normaliseTin(inv.tin))));
      if (s) return s;
    }
    if (inv.supplierName) {
      const [s] = await this.db
        .select()
        .from(supplier)
        .where(
          and(
            eq(supplier.orgId, orgId),
            sql`similarity(${supplier.name}, ${inv.supplierName}) > 0.6`,
          ),
        )
        .orderBy(desc(sql`similarity(${supplier.name}, ${inv.supplierName})`))
        .limit(1);
      if (s) return s;
    }
    return null;
  }

  private async ssmCheck(ssmNo: string | undefined, name: string | undefined): Promise<Check> {
    const source = this.ssm.source;
    if (!ssmNo)
      return {
        key: "ssm",
        status: "warn",
        source,
        reason: t(
          "No SSM registration number on the invoice. Ask the supplier for it.",
          "Tiada nombor pendaftaran SSM pada invois. Minta daripada pembekal.",
        ),
      };
    const c = await this.ssm.byRegNo(ssmNo);
    if (!c)
      return {
        key: "ssm",
        status: "fail",
        source,
        reason: t(
          `No company registered under SSM number ${ssmNo}.`,
          `Tiada syarikat berdaftar dengan nombor SSM ${ssmNo}.`,
        ),
      };
    if (c.status !== "active")
      return {
        key: "ssm",
        status: "fail",
        source,
        reason: t(
          `${c.name} is ${c.status.replace("_", " ")} at SSM.`,
          `${c.name} berstatus ${c.status.replace("_", " ")} di SSM.`,
        ),
      };
    const months = (Date.now() - new Date(c.registeredOn).getTime()) / (30.44 * 86_400_000);
    if (name && similarity(normaliseCompanyName(name), normaliseCompanyName(c.name)) < 0.7) {
      return {
        key: "ssm",
        status: "warn",
        source,
        reason: t(
          `SSM number belongs to ${c.name}, not "${name}".`,
          `Nombor SSM milik ${c.name}, bukan "${name}".`,
        ),
      };
    }
    if (months < NEW_COMPANY_MONTHS) {
      return {
        key: "ssm",
        status: "warn",
        source,
        reason: t(
          `${c.name} was registered only ${Math.max(1, Math.round(months))} month(s) ago (${c.registeredOn}).`,
          `${c.name} baru didaftarkan ${Math.max(1, Math.round(months))} bulan lalu (${c.registeredOn}).`,
        ),
      };
    }
    return {
      key: "ssm",
      status: "pass",
      source,
      reason: t(
        `${c.name}: active, registered since ${c.registeredOn.slice(0, 4)}.`,
        `${c.name}: aktif, berdaftar sejak ${c.registeredOn.slice(0, 4)}.`,
      ),
    };
  }

  private async tinCheck(tin: string | undefined, ssmNo: string | undefined): Promise<Check> {
    const source = this.myinvois.source;
    if (!tin || !ssmNo)
      return {
        key: "tin",
        status: "warn",
        source,
        reason: t(
          "TIN or SSM number missing, so the tax ID can't be validated.",
          "TIN atau nombor SSM tiada, jadi ID cukai tidak dapat disahkan.",
        ),
      };
    const ok = await this.myinvois.validateTin(tin, ssmNo);
    return ok
      ? {
          key: "tin",
          status: "pass",
          source,
          reason: t(
            "Tax ID (TIN) is valid and matches the company.",
            "ID cukai (TIN) sah dan sepadan dengan syarikat.",
          ),
        }
      : {
          key: "tin",
          status: "fail",
          source,
          reason: t(
            "Tax ID (TIN) does not match this company at LHDN.",
            "ID cukai (TIN) tidak sepadan dengan syarikat ini di LHDN.",
          ),
        };
  }

  private async einvoiceCheck(uuid: string | undefined): Promise<Check> {
    const source = this.myinvois.source;
    if (!uuid)
      return {
        key: "einvoice",
        status: "unavailable",
        source,
        reason: t(
          "No e-invoice UUID or QR code. Ask for an LHDN-validated e-invoice.",
          "Tiada UUID atau kod QR e-invois. Minta e-invois yang disahkan LHDN.",
        ),
      };
    const status = await this.myinvois.documentStatus(uuid);
    if (status === "Valid")
      return {
        key: "einvoice",
        status: "pass",
        source,
        reason: t("E-invoice was validated by LHDN.", "E-invois telah disahkan oleh LHDN."),
      };
    if (status === "Cancelled")
      return {
        key: "einvoice",
        status: "fail",
        source,
        reason: t(
          "This e-invoice was cancelled at LHDN.",
          "E-invois ini telah dibatalkan di LHDN.",
        ),
      };
    return {
      key: "einvoice",
      status: "fail",
      source,
      reason: t(
        "E-invoice not found at LHDN: it may be fake or altered.",
        "E-invois tidak ditemui di LHDN: mungkin palsu atau diubah.",
      ),
    };
  }

  private async accountNameCheck(
    accountValue: string | undefined,
    companyName: string | undefined,
  ): Promise<Check | null> {
    if (!accountValue) return null;
    const source = this.accountName.source;
    const holder = await this.accountName.holderName(accountValue);
    if (!holder)
      return {
        key: "account_name",
        status: "unavailable",
        source,
        reason: t(
          "Account holder name not available for this bank.",
          "Nama pemegang akaun tidak tersedia untuk bank ini.",
        ),
      };
    if (!looksLikeCompany(holder)) {
      return {
        key: "account_name",
        status: "fail",
        source,
        reason: t(
          "The account belongs to an individual, not a company.",
          "Akaun ini milik individu, bukan syarikat.",
        ),
      };
    }
    if (
      companyName &&
      similarity(normaliseCompanyName(holder), normaliseCompanyName(companyName)) < 0.7
    ) {
      return {
        key: "account_name",
        status: "fail",
        source,
        reason: t(
          `Account is held by ${holder}, not ${companyName}.`,
          `Akaun dipegang oleh ${holder}, bukan ${companyName}.`,
        ),
      };
    }
    return {
      key: "account_name",
      status: "pass",
      source,
      reason: t(`Account holder matches: ${holder}.`, `Pemegang akaun sepadan: ${holder}.`),
    };
  }

  private async graphCheck(
    accountValue: string | undefined,
    bank: string | undefined,
    phone: string | undefined,
    emailDomain: string | undefined,
  ): Promise<Check | null> {
    const lookups = [
      accountValue
        ? this.verdicts.lookup({ type: "bank_account", value: accountValue, bank })
        : null,
      phone ? this.verdicts.lookup({ type: "phone", value: phone }) : null,
      emailDomain && !FREE_MAIL.has(emailDomain)
        ? this.verdicts.lookup({ type: "domain", value: emailDomain })
        : null,
    ].filter(Boolean);
    if (!lookups.length) return null;
    const verdicts = await Promise.all(lookups);
    const worst = verdicts
      .filter((v) => v!.tier !== "protected_official")
      .sort((a, b) => b!.risk - a!.risk)[0];
    const source = "CrowdShield graph";
    if (!worst || worst.tier === "no_known_risk")
      return {
        key: "graph",
        status: "pass",
        source,
        reason: t(
          "No scam reports found for the account, phone or email domain.",
          "Tiada laporan scam ditemui untuk akaun, telefon atau domain e-mel.",
        ),
      };
    const what = `${worst.entity.masked} (${worst.tierLabel.en.toLowerCase()}, risk ${worst.risk})`;
    const whatMs = `${worst.entity.masked} (${worst.tierLabel.ms.toLowerCase()}, risiko ${worst.risk})`;
    const reasonExtra = worst.explanation[0] ? ` ${worst.explanation[0].line.en}.` : "";
    const reasonExtraMs = worst.explanation[0] ? ` ${worst.explanation[0].line.ms}.` : "";
    if (["caution", "high", "confirmed"].includes(worst.tier)) {
      return {
        key: "graph",
        status: "fail",
        source,
        reason: t(
          `Linked to scam reports: ${what}.${reasonExtra}`,
          `Dikaitkan dengan laporan scam: ${whatMs}.${reasonExtraMs}`,
        ),
      };
    }
    return {
      key: "graph",
      status: "warn",
      source,
      reason: t(`Some reports: ${what}.`, `Ada laporan: ${whatMs}.`),
    };
  }

  private historyCheck(
    known: SupplierRow | null,
    tin: string | undefined,
    accountHash: Buffer | undefined,
    accountMasked: string | undefined,
    changed: boolean,
  ): Check {
    const source = "Your supplier records";
    if (!known)
      return {
        key: "history",
        status: "warn",
        source,
        reason: t(
          "New supplier: no payment history to compare with.",
          "Pembekal baharu: tiada sejarah pembayaran untuk dibandingkan.",
        ),
      };
    if (tin && known.tin && normaliseTin(tin) !== known.tin) {
      return {
        key: "history",
        status: "fail",
        source,
        reason: t(
          `TIN differs from earlier invoices from ${known.name}.`,
          `TIN berbeza daripada invois terdahulu daripada ${known.name}.`,
        ),
      };
    }
    if (changed) {
      return {
        key: "history",
        status: "fail",
        source,
        reason: t(
          `Bank account changed: usually ${known.accountMasked ?? "a different account"}, this invoice says ${accountMasked ?? "a new account"}.`,
          `Akaun bank bertukar: biasanya ${known.accountMasked ?? "akaun lain"}, invois ini menyatakan ${accountMasked ?? "akaun baharu"}.`,
        ),
      };
    }
    if (accountHash && known.accountHash?.equals(accountHash)) {
      return {
        key: "history",
        status: "pass",
        source,
        reason: t(
          `Same bank account as earlier invoices from ${known.name}.`,
          `Akaun bank sama seperti invois terdahulu daripada ${known.name}.`,
        ),
      };
    }
    return {
      key: "history",
      status: "pass",
      source,
      reason: t(`Known supplier: ${known.name}.`, `Pembekal dikenali: ${known.name}.`),
    };
  }

  private emailCheck(
    known: SupplierRow | null,
    from: string | undefined,
    replyTo: string | undefined,
  ): Check | null {
    const d = domainOf(from);
    if (!d) return null;
    const source = "Email headers";
    const reply = domainOf(replyTo);
    if (known?.emailDomain && d !== known.emailDomain) {
      const sim = similarity(d, known.emailDomain);
      if (sim >= 0.6)
        return {
          key: "email_domain",
          status: "fail",
          source,
          reason: t(
            `Look-alike email domain: ${d} imitates ${known.emailDomain}.`,
            `Domain e-mel tiruan: ${d} meniru ${known.emailDomain}.`,
          ),
        };
      return {
        key: "email_domain",
        status: "warn",
        source,
        reason: t(
          `Email comes from ${d}, not ${known.emailDomain} as before.`,
          `E-mel datang dari ${d}, bukan ${known.emailDomain} seperti sebelum ini.`,
        ),
      };
    }
    if (reply && reply !== d)
      return {
        key: "email_domain",
        status: "warn",
        source,
        reason: t(
          `Replies go to a different domain (${reply}).`,
          `Balasan dihantar ke domain lain (${reply}).`,
        ),
      };
    if (FREE_MAIL.has(d))
      return {
        key: "email_domain",
        status: "warn",
        source,
        reason: t(
          `Sent from a free email account (${d}), not a company domain.`,
          `Dihantar dari akaun e-mel percuma (${d}), bukan domain syarikat.`,
        ),
      };
    return {
      key: "email_domain",
      status: "pass",
      source,
      reason: t(
        `Email domain ${d} matches the supplier.`,
        `Domain e-mel ${d} sepadan dengan pembekal.`,
      ),
    };
  }
}

@Controller()
export class SmeController {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly config: Config,
    private readonly checks: SupplierCheckService,
    private readonly verdicts: VerdictService,
    private readonly actions: GraphActions,
    private readonly audit: AuditService,
  ) {}

  @Route("listSuppliers")
  async listSuppliers(@CurrentPrincipal() p: Principal) {
    const user = requireUser(p);
    const rows = await this.db
      .select()
      .from(supplier)
      .where(eq(supplier.orgId, user.orgId))
      .orderBy(supplier.name);
    return Promise.all(rows.map((s) => this.toSupplier(s)));
  }

  @Route("createSupplier")
  async createSupplier(
    @Body() input: z.output<typeof SupplierInput>,
    @CurrentPrincipal() p: Principal,
  ) {
    const user = requireUser(p);
    const [s] = await this.db
      .insert(supplier)
      .values({ orgId: user.orgId, ...this.supplierFields(input) })
      .returning();
    await this.audit.log(p, "supplier_created", null, { supplierId: s!.id });
    return this.toSupplier(s!);
  }

  @Route("getSupplier")
  async getSupplier(@UuidParam() id: string, @CurrentPrincipal() p: Principal) {
    return this.toSupplier(await this.ownSupplier(id, requireUser(p)));
  }

  @Route("updateSupplier")
  async updateSupplier(
    @UuidParam() id: string,
    @Body() input: Partial<z.output<typeof SupplierInput>>,
    @CurrentPrincipal() p: Principal,
  ) {
    const user = requireUser(p);
    await this.ownSupplier(id, user);
    const [s] = await this.db
      .update(supplier)
      .set({ ...this.supplierFields(input), updatedAt: new Date() })
      .where(eq(supplier.id, id))
      .returning();
    await this.audit.log(p, "supplier_updated", null, { supplierId: id });
    return this.toSupplier(s!);
  }

  @Route("supplierCheck")
  supplierCheck(@Body() input: CheckInput, @CurrentPrincipal() p: Principal) {
    return this.checks.check(input, requireUser(p));
  }

  @Route("listInvoiceChecks")
  async listChecks(@Query() q: z.output<typeof PageQuery>, @CurrentPrincipal() p: Principal) {
    const user = requireUser(p);
    const [{ total }] = (await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(invoiceCheck)
      .where(eq(invoiceCheck.orgId, user.orgId))) as [{ total: number }];
    const items = await this.checkSummaries(
      eq(invoiceCheck.orgId, user.orgId),
      q.pageSize,
      (q.page - 1) * q.pageSize,
    );
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  @Route("getInvoiceCheck")
  async getCheck(@UuidParam() id: string, @CurrentPrincipal() p: Principal) {
    const user = requireUser(p);
    const [c] = await this.db
      .select({ result: invoiceCheck.result })
      .from(invoiceCheck)
      .where(and(eq(invoiceCheck.id, id), eq(invoiceCheck.orgId, user.orgId)));
    if (!c?.result) throw new NotFoundException("Check not found");
    return c.result;
  }

  @Route("listHolds")
  async listHolds(@CurrentPrincipal() p: Principal) {
    const user = requireUser(p);
    const rows = await this.db
      .select({ id: paymentHold.id })
      .from(paymentHold)
      .where(eq(paymentHold.orgId, user.orgId))
      .orderBy(
        sql`CASE ${paymentHold.status} WHEN 'on_hold' THEN 0 ELSE 1 END`,
        desc(paymentHold.createdAt),
      );
    return Promise.all(rows.map((r) => this.hold(r.id, user)));
  }

  @Route("updateHoldChecklist")
  async updateChecklist(
    @UuidParam() id: string,
    @Body() input: z.output<typeof HoldChecklistInput>,
    @CurrentPrincipal() p: Principal,
  ) {
    const user = requireUser(p);
    const [h] = await this.db
      .select()
      .from(paymentHold)
      .where(and(eq(paymentHold.id, id), eq(paymentHold.orgId, user.orgId)));
    if (!h) throw new NotFoundException("Hold not found");
    if (h.status !== "on_hold") throw new BadRequestException("This hold is already decided");
    const list = h.checklist as ChecklistItem[];
    const item = list.find((i) => i.step === input.step);
    if (!item) throw new BadRequestException(`Unknown checklist step: ${input.step}`);
    Object.assign(item, {
      done: input.done,
      at: input.done ? new Date().toISOString() : null,
      by: input.done ? user.userId : null,
    });
    await this.db.update(paymentHold).set({ checklist: list }).where(eq(paymentHold.id, id));
    return this.hold(id, user);
  }

  @Route("decideHold")
  async decideHold(
    @UuidParam() id: string,
    @Body() input: z.output<typeof HoldDecisionInput>,
    @CurrentPrincipal() p: Principal,
  ) {
    const user = requireUser(p);
    const [row] = await this.db
      .select({ h: paymentHold, c: invoiceCheck })
      .from(paymentHold)
      .innerJoin(invoiceCheck, eq(invoiceCheck.id, paymentHold.invoiceCheckId))
      .where(and(eq(paymentHold.id, id), eq(paymentHold.orgId, user.orgId)));
    if (!row) throw new NotFoundException("Hold not found");
    if (row.h.status !== "on_hold") throw new BadRequestException("This hold is already decided");
    const done = new Set(
      (row.h.checklist as ChecklistItem[]).filter((i) => i.done).map((i) => i.step),
    );
    if (input.decision === "verified" && !(done.has("callback") && done.has("written"))) {
      throw new BadRequestException(
        "Call back on the number from your records and get written confirmation before releasing the payment",
      );
    }
    const ex = (row.c.extracted ?? {}) as {
      accountEntityId?: number | null;
      phoneEntityId?: number | null;
      emailDomain?: string;
    };

    const recomputed = await this.db.transaction(async (tx) => {
      await tx
        .update(paymentHold)
        .set({ status: input.decision, decidedBy: user.userId, decidedAt: new Date() })
        .where(eq(paymentHold.id, id));
      if (input.decision === "verified" && row.c.supplierId && ex.accountEntityId) {
        // Callback confirmed the change: the new account becomes the supplier's usual account
        const [e] = await tx.select().from(entity).where(eq(entity.id, ex.accountEntityId));
        if (e) {
          await tx
            .update(supplier)
            .set({
              accountHash: e.lookupHash,
              accountMasked: e.displayMasked,
              bankCode: (e.attrs as { bank_code?: string }).bank_code,
              updatedAt: new Date(),
            })
            .where(eq(supplier.id, row.c.supplierId));
        }
      }
      let ids: number[] = [];
      if (input.decision === "rejected")
        ids = await this.reportFake(tx, user, row.c.id, ex, input.note);
      await this.audit.log(
        p,
        `hold_${input.decision}`,
        ex.accountEntityId ?? null,
        { holdId: id },
        tx,
      );
      return ids;
    });
    await this.verdicts.invalidate(recomputed);
    return this.hold(id, user);
  }

  /** A rejected bank-detail change is a confirmed fake: it goes into the graph to protect others. */
  private async reportFake(
    tx: DbOrTx,
    user: UserPrincipal,
    checkId: string,
    ex: { accountEntityId?: number | null; phoneEntityId?: number | null; emailDomain?: string },
    note?: string,
  ) {
    const now = new Date();
    const ids: { id: number; role: "payee_account" | "caller" | "link_sent" }[] = [];
    if (ex.accountEntityId) ids.push({ id: ex.accountEntityId, role: "payee_account" });
    if (ex.phoneEntityId) ids.push({ id: ex.phoneEntityId, role: "caller" });
    if (ex.emailDomain && !FREE_MAIL.has(ex.emailDomain)) {
      ids.push({
        id: (await upsertEntity(tx, this.config.secrets, "domain", ex.emailDomain, { seenAt: now }))
          .id,
        role: "link_sent",
      });
    }
    if (!ids.length) return [];
    const [src] = await tx
      .select({ id: source.id })
      .from(source)
      .where(eq(source.kind, "user_report"));
    const reporterId = await this.actions.orgReporter(tx, user, "sme", 0.5);
    const [c] = await tx
      .insert(scamCase)
      .values({
        sourceId: src!.id,
        reporterId,
        orgId: user.orgId,
        scamType: "bec_supplier",
        verification: "confirmed",
        reportedAt: now,
        nearMiss: true,
        narrativeRedacted:
          note ??
          "Business confirmed by callback that a 'new bank account' request from a supplier was fake.",
        externalRef: `invoice-check:${checkId}`,
      })
      .returning({ id: scamCase.id });
    await tx.insert(observation).values(
      ids.map((i) => ({
        caseId: c!.id,
        entityId: i.id,
        role: i.role,
        sourceId: src!.id,
        reporterId,
        observedAt: now,
      })),
    );
    await linkCaseEntities(tx, c!.id, now);
    const out = new Set<number>();
    for (const i of ids)
      for (const r of (await recomputeWithNeighbours(tx, i.id, now)).recomputed) out.add(r);
    return [...out];
  }

  @Route("smeDashboard")
  async dashboard(@CurrentPrincipal() p: Principal) {
    const user = requireUser(p);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [byStatus, [holds], [checks], flagged, campaigns] = await Promise.all([
      this.db
        .select({ k: supplier.status, n: sql<number>`count(*)::int` })
        .from(supplier)
        .where(eq(supplier.orgId, user.orgId))
        .groupBy(supplier.status),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(paymentHold)
        .where(and(eq(paymentHold.orgId, user.orgId), eq(paymentHold.status, "on_hold"))),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(invoiceCheck)
        .where(and(eq(invoiceCheck.orgId, user.orgId), gte(invoiceCheck.createdAt, monthStart))),
      this.checkSummaries(
        and(eq(invoiceCheck.orgId, user.orgId), inArray(invoiceCheck.risk, ["caution", "high"])),
        5,
      ),
      campaignList(this.db, 5),
    ]);
    return {
      suppliersByStatus: Object.fromEntries(byStatus.map((r) => [r.k, r.n])),
      openHolds: holds?.n ?? 0,
      checksThisMonth: checks?.n ?? 0,
      flaggedChecks: flagged,
      campaigns,
    };
  }

  private async checkSummaries(where: ReturnType<typeof and>, limit: number, offset = 0) {
    const rows = await this.db
      .select({
        c: invoiceCheck,
        s: { id: supplier.id, name: supplier.name },
        holdStatus: paymentHold.status,
      })
      .from(invoiceCheck)
      .leftJoin(supplier, eq(supplier.id, invoiceCheck.supplierId))
      .leftJoin(paymentHold, eq(paymentHold.invoiceCheckId, invoiceCheck.id))
      .where(where)
      .orderBy(desc(invoiceCheck.createdAt))
      .limit(limit)
      .offset(offset);
    return rows.map(({ c, s, holdStatus }) => ({
      id: c.id,
      supplier: s?.id ? { id: s.id, name: s.name } : null,
      supplierName:
        ((c.extracted ?? {}) as { supplierName?: string }).supplierName ?? s?.name ?? null,
      risk: c.risk as "low" | "caution" | "high" | null,
      bankDetailChanged: c.bankDetailChanged,
      amountMyr: c.amountMyr === null ? null : Number(c.amountMyr),
      channel: c.channel,
      createdAt: c.createdAt.toISOString(),
      holdStatus,
    }));
  }

  private async hold(id: string, user: UserPrincipal) {
    const [row] = await this.db
      .select({ h: paymentHold, c: invoiceCheck, s: supplier })
      .from(paymentHold)
      .innerJoin(invoiceCheck, eq(invoiceCheck.id, paymentHold.invoiceCheckId))
      .leftJoin(supplier, eq(supplier.id, invoiceCheck.supplierId))
      .where(and(eq(paymentHold.id, id), eq(paymentHold.orgId, user.orgId)));
    if (!row) throw new NotFoundException("Hold not found");
    const ex = (row.c.extracted ?? {}) as { accountMasked?: string };
    return {
      id: row.h.id,
      invoiceCheckId: row.c.id,
      status: row.h.status as "on_hold",
      supplier: row.s
        ? { id: row.s.id, name: row.s.name, callbackPhone: row.s.callbackPhone }
        : null,
      newAccountMasked: ex.accountMasked ?? null,
      amountMyr: row.c.amountMyr === null ? null : Number(row.c.amountMyr),
      checklist: row.h.checklist as ChecklistItem[],
      createdAt: row.h.createdAt.toISOString(),
      decidedAt: row.h.decidedAt?.toISOString() ?? null,
    };
  }

  private async ownSupplier(id: string, user: UserPrincipal) {
    const [s] = await this.db
      .select()
      .from(supplier)
      .where(and(eq(supplier.id, id), eq(supplier.orgId, user.orgId)));
    if (!s) throw new NotFoundException("Supplier not found");
    return s;
  }

  private supplierFields(input: Partial<z.output<typeof SupplierInput>>) {
    const acct = input.account
      ? identify("bank_account", input.account, this.config.pepper, { bank: input.bank })
      : null;
    return {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.ssmNo !== undefined && { ssmNo: normaliseSsmNo(input.ssmNo) }),
      ...(input.tin !== undefined && { tin: normaliseTin(input.tin) }),
      ...(acct && {
        bankCode: acct.attrs.bank_code,
        accountHash: acct.lookupHash,
        accountMasked: acct.masked,
      }),
      ...(input.accountHolderName !== undefined && { accountHolderName: input.accountHolderName }),
      ...(input.callbackPhone !== undefined && {
        callbackPhone: normalise("phone", input.callbackPhone).value,
      }),
      ...(input.emailDomain !== undefined && { emailDomain: input.emailDomain.toLowerCase() }),
    } as Partial<typeof supplier.$inferInsert> & { name: string };
  }

  private async toSupplier(s: SupplierRow) {
    const [last] = await this.db
      .select({ at: invoiceCheck.createdAt })
      .from(invoiceCheck)
      .where(eq(invoiceCheck.supplierId, s.id))
      .orderBy(desc(invoiceCheck.createdAt))
      .limit(1);
    return {
      id: s.id,
      name: s.name,
      ssmNo: s.ssmNo,
      tin: s.tin,
      bankCode: s.bankCode,
      accountMasked: s.accountMasked,
      accountHolderName: s.accountHolderName,
      callbackPhone: s.callbackPhone,
      emailDomain: s.emailDomain,
      status: s.status,
      lastCheckAt: last?.at.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    };
  }
}
