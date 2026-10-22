// The API surface in one place: drives the OpenAPI document and the typed client.
// The API's controllers must match these paths (checked by the e2e tests).
import { z } from "zod";
import * as s from "./schemas.js";

type Method = "get" | "post" | "patch";
export type Auth = "public" | "any" | "service" | readonly z.infer<typeof s.UserRole>[];

export interface RouteDef {
  method: Method;
  path: string;
  summary: string;
  auth: Auth;
  query?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType;
  idempotent?: boolean;
}

const BANK = ["bank_analyst", "bank_supervisor", "admin"] as const;
/** Bank staff, or the bank's own backend with its partner key (the payee check from the banking app). */
const BANK_API = [...BANK, "bank_partner"] as const;
const SUPERVISOR = ["bank_supervisor", "admin"] as const;
const SME = ["sme_owner", "sme_member", "admin"] as const;

const route = <const R extends RouteDef>(r: R) => r;

export const routes = {
  health: route({
    method: "get",
    path: "/v1/health",
    summary: "Liveness and dependency check",
    auth: "public",
    response: z.object({ ok: z.boolean(), db: z.boolean(), redis: z.boolean() }),
  }),
  openapi: route({
    method: "get",
    path: "/v1/openapi.json",
    summary: "This document",
    auth: "public",
    response: z.unknown(),
  }),

  login: route({
    method: "post",
    path: "/v1/auth/login",
    summary: "Email/password login; returns a bearer token",
    auth: "public",
    body: s.LoginInput,
    response: s.LoginResult,
  }),
  me: route({
    method: "get",
    path: "/v1/me",
    summary: "Current user",
    auth: "any",
    response: s.Me,
  }),

  lookup: route({
    method: "get",
    path: "/v1/lookup",
    summary: "Verdict for one identifier (bot, app, any signed-in user)",
    auth: "any",
    query: s.IdentifierInput,
    response: s.Verdict,
  }),
  createReport: route({
    method: "post",
    path: "/v1/reports",
    summary: "Submit a scam report; returns verdicts and the 997 call sheet",
    auth: "service",
    body: s.ReportInput,
    response: s.ReportResult,
    idempotent: true,
  }),
  addNsrcRef: route({
    method: "post",
    path: "/v1/reports/:id/nsrc",
    summary: "Attach the NSRC reference / police report number the victim got",
    auth: "service",
    body: s.NsrcRefInput,
    response: s.CaseSummary,
  }),

  payeeCheck: route({
    method: "post",
    path: "/v1/payee-check",
    summary: "Risk of a payee before a transfer, with the live call signal",
    auth: BANK_API,
    body: s.PayeeCheckInput,
    response: s.PayeeCheckResult,
    idempotent: true,
  }),
  listAlerts: route({
    method: "get",
    path: "/v1/alerts",
    summary: "Alert queue for the caller's bank",
    auth: BANK,
    query: s.AlertListQuery,
    response: s.Page(s.AlertSummary),
  }),
  getAlert: route({
    method: "get",
    path: "/v1/alerts/:id",
    summary: "Alert detail",
    auth: BANK,
    response: s.AlertDetail,
  }),
  alertAction: route({
    method: "post",
    path: "/v1/alerts/:id/actions",
    summary: "Hold, release, freeze, confirm mule, clear…",
    auth: BANK,
    body: s.AlertActionInput,
    response: s.AlertDetail,
  }),

  listCases: route({
    method: "get",
    path: "/v1/cases",
    summary: "Cases in the shared graph",
    auth: BANK,
    query: s.CaseListQuery,
    response: s.Page(s.CaseSummary),
  }),
  getCase: route({
    method: "get",
    path: "/v1/cases/:id",
    summary: "Case detail: timeline, money trail, evidence",
    auth: BANK,
    response: s.CaseDetail,
  }),

  listEntities: route({
    method: "get",
    path: "/v1/entities",
    summary: "Scored entities (watchlist)",
    auth: BANK,
    query: s.EntityListQuery,
    response: s.Page(s.EntitySummary),
  }),
  getEntity: route({
    method: "get",
    path: "/v1/entities/:id",
    summary: "Entity detail with score breakdown",
    auth: BANK,
    response: s.EntityDetail,
  }),
  getNeighbours: route({
    method: "get",
    path: "/v1/entities/:id/neighbours",
    summary: "One-hop graph around an entity",
    auth: BANK,
    response: s.Neighbours,
  }),
  entityAction: route({
    method: "post",
    path: "/v1/entities/:id/actions",
    summary: "Confirm mule, freeze or clear an entity",
    auth: BANK,
    body: s.EntityActionInput,
    response: s.EntityDetail,
  }),
  createAppeal: route({
    method: "post",
    path: "/v1/entities/:id/appeals",
    summary: "Owner appeal against a listing",
    auth: "any",
    body: s.AppealInput,
    response: z.object({ id: z.string(), status: z.string() }),
  }),
  decideAppeal: route({
    method: "post",
    path: "/v1/appeals/:id/decision",
    summary: "Uphold or reject an appeal",
    auth: SUPERVISOR,
    body: s.AppealDecisionInput,
    response: z.object({ id: z.string(), status: z.string() }),
  }),

  webLeads: route({
    method: "post",
    path: "/v1/web/leads",
    summary: "Web mentions of an identifier the graph doesn't know (Tavily); leads only",
    auth: "any",
    body: s.IdentifierInput,
    response: s.WebLeads,
  }),
  urlCheck: route({
    method: "post",
    path: "/v1/web/url-check",
    summary: "Inspect a link's page without the user opening it",
    auth: "any",
    body: s.UrlCheckInput,
    response: s.UrlCheckResult,
  }),
  investmentCheck: route({
    method: "post",
    path: "/v1/web/investment",
    summary: "SC / BNM alert lists and news for an investment platform or scheme name",
    auth: "any",
    body: s.InvestmentCheckInput,
    response: s.WebLeads,
  }),

  caseBrief: route({
    method: "post",
    path: "/v1/cases/:id/brief",
    summary: "Nemotron Ultra (reasoning) case brief + NSRC/PDRM referral note",
    auth: BANK,
    response: s.CaseBrief,
  }),
  campaignMatch: route({
    method: "post",
    path: "/v1/campaigns/match",
    summary: "Known scam campaign for a message (embedding similarity)",
    auth: "any",
    body: s.CampaignMatchInput,
    response: s.CampaignMatch,
  }),
  detectCampaigns: route({
    method: "post",
    path: "/v1/campaigns/detect",
    summary: "Cluster the novelty pool into new campaign candidates; Nemotron labels them",
    auth: BANK,
    response: s.DetectResult,
  }),
  reviewCampaign: route({
    method: "post",
    path: "/v1/campaigns/:id/review",
    summary: "Confirm or dismiss a detected campaign",
    auth: BANK,
    body: s.CampaignReviewInput,
    response: s.Campaign,
  }),
  backfillScripts: route({
    method: "post",
    path: "/v1/campaigns/backfill",
    summary: "Embed case narratives that have no script yet (demo setup)",
    auth: "service",
    response: z.object({ embedded: z.number().int() }),
  }),
  publicCheck: route({
    method: "post",
    path: "/v1/public/check",
    summary: "Landing-page check: identifiers in a message, or the scam pattern (rate-limited)",
    auth: "public",
    body: s.PublicCheckInput,
    response: s.PublicCheckResult,
  }),
  publicLookup: route({
    method: "post",
    path: "/v1/public/lookup",
    summary: "Browser extension: verdicts for identifiers found on the page (graph only, no AI; rate-limited)",
    auth: "public",
    body: s.PublicLookupInput,
    response: s.PublicLookupResult,
  }),
  publicScreenshot: route({
    method: "post",
    path: "/v1/public/screenshot",
    summary:
      "Landing-page screenshot check: Nemotron VL reads it, then the same check (rate-limited)",
    auth: "public",
    body: s.PublicScreenshotInput,
    response: s.PublicCheckResult,
  }),
  news: route({
    method: "get",
    path: "/v1/news",
    summary: "Scams in the news this week (Tavily + Nemotron), with sources",
    auth: "public",
    response: s.NewsFeed,
  }),

  listCampaigns: route({
    method: "get",
    path: "/v1/campaigns",
    summary: "Scam campaigns by spike",
    auth: "any",
    response: z.array(s.Campaign),
  }),
  bankDashboard: route({
    method: "get",
    path: "/v1/dashboard/bank",
    summary: "Bank overview",
    auth: BANK,
    response: s.BankDashboard,
  }),
  audit: route({
    method: "get",
    path: "/v1/audit",
    summary: "Audit log (supervisors)",
    auth: SUPERVISOR,
    query: s.PageQuery.extend({ entityId: z.coerce.number().int().optional() }),
    response: s.Page(
      z.object({
        id: z.number().int(),
        actor: z.string().nullable(),
        action: z.string(),
        entityId: z.number().int().nullable(),
        detail: z.unknown(),
        policyVersion: z.string(),
        at: s.Timestamp,
      }),
    ),
  }),

  listSuppliers: route({
    method: "get",
    path: "/v1/suppliers",
    summary: "The business's suppliers",
    auth: SME,
    response: z.array(s.Supplier),
  }),
  createSupplier: route({
    method: "post",
    path: "/v1/suppliers",
    summary: "Add a supplier",
    auth: SME,
    body: s.SupplierInput,
    response: s.Supplier,
  }),
  getSupplier: route({
    method: "get",
    path: "/v1/suppliers/:id",
    summary: "Supplier detail",
    auth: SME,
    response: s.Supplier,
  }),
  updateSupplier: route({
    method: "patch",
    path: "/v1/suppliers/:id",
    summary: "Update a supplier",
    auth: SME,
    body: s.SupplierInput.partial(),
    response: s.Supplier,
  }),
  supplierCheck: route({
    method: "post",
    path: "/v1/supplier-check",
    summary: "Check an invoice / bank-detail change before paying",
    auth: [...SME, "admin"] as const,
    body: s.SupplierCheckInput,
    response: s.SupplierCheckResult,
  }),
  listInvoiceChecks: route({
    method: "get",
    path: "/v1/invoice-checks",
    summary: "Past checks",
    auth: SME,
    query: s.PageQuery,
    response: s.Page(s.InvoiceCheckSummary),
  }),
  getInvoiceCheck: route({
    method: "get",
    path: "/v1/invoice-checks/:id",
    summary: "One check with its result",
    auth: SME,
    response: s.SupplierCheckResult,
  }),
  listHolds: route({
    method: "get",
    path: "/v1/holds",
    summary: "Payment holds on bank-detail changes",
    auth: SME,
    response: z.array(s.Hold),
  }),
  updateHoldChecklist: route({
    method: "post",
    path: "/v1/holds/:id/checklist",
    summary: "Tick a callback-checklist step",
    auth: SME,
    body: s.HoldChecklistInput,
    response: s.Hold,
  }),
  decideHold: route({
    method: "post",
    path: "/v1/holds/:id/decision",
    summary: "Release (verified) or reject; rejection reports the account",
    auth: SME,
    body: s.HoldDecisionInput,
    response: s.Hold,
  }),
  smeDashboard: route({
    method: "get",
    path: "/v1/dashboard/sme",
    summary: "SME overview",
    auth: SME,
    response: s.SmeDashboard,
  }),
} as const satisfies Record<string, RouteDef>;

export type Routes = typeof routes;
export type RouteId = keyof Routes;
