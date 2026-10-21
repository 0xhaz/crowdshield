// Mock adapters for SSM, LHDN MyInvois and DuitNow account-name enquiry (workplan §1: mocked
// with realistic responses). Each adapter has the interface the real integration will implement,
// so swapping one in only changes this file. Data matches the demo seed's suppliers.
import { normalise, normaliseSsmNo, normaliseTin } from "@crowdshield/normalise";

export interface CompanyRecord {
  ssmNo: string;
  name: string;
  type: "Sdn Bhd" | "Enterprise" | "Berhad";
  status: "active" | "dissolved" | "winding_up";
  registeredOn: string;
  directors: string[];
  tin: string;
}

export interface SsmAdapter {
  readonly source: string;
  byRegNo(ssmNo: string): Promise<CompanyRecord | null>;
}
export interface MyInvoisAdapter {
  readonly source: string;
  /** GET /api/v1.0/taxpayer/validate/{tin}?idType=BRN&idValue=… → valid or not */
  validateTin(tin: string, brn: string): Promise<boolean>;
  /** GET /api/v1.0/documents/{uuid}/details → status */
  documentStatus(uuid: string): Promise<"Valid" | "Cancelled" | null>;
}
export interface AccountNameAdapter {
  readonly source: string;
  /** DuitNow account-name enquiry (via a bank / PayNet partner). null = not available */
  holderName(bankAccountValue: string): Promise<string | null>;
}

const COMPANIES: CompanyRecord[] = [
  {
    ssmNo: "201901023456",
    name: "KELUVRA STEEL SUPPLIES SDN BHD",
    type: "Sdn Bhd",
    status: "active",
    registeredOn: "2019-03-12",
    directors: ["Lee Wai Keong", "Nurul Huda binti Azman"],
    tin: "C2584563200",
  },
  {
    ssmNo: "201501007731",
    name: "CEMVORA TRADING SDN BHD",
    type: "Sdn Bhd",
    status: "active",
    registeredOn: "2015-02-27",
    directors: ["Ravi Chandran"],
    tin: "C2391175508",
  },
  {
    ssmNo: "202003118842",
    name: "BINQORA BEKALAN ENTERPRISE",
    type: "Enterprise",
    status: "active",
    registeredOn: "2020-09-03",
    directors: ["Mohd Faizal bin Rahim"],
    tin: "IG21455091020",
  },
  // The demo's fake supplier: registered weeks ago, selling gloves far below market
  {
    ssmNo: "202608047712",
    name: "GLOVEXA SUPPLY SDN BHD",
    type: "Sdn Bhd",
    status: "active",
    registeredOn: "2026-08-14",
    directors: ["Tan Kok Leong"],
    tin: "C60011234500",
  },
  {
    ssmNo: "201107004421",
    name: "PALMQUIRA PRODUCTS SDN BHD",
    type: "Sdn Bhd",
    status: "dissolved",
    registeredOn: "2011-05-19",
    directors: ["Ahmad Zaki bin Osman"],
    tin: "C1955420010",
  },
];

const ACCOUNT_HOLDERS: Record<string, string> = {
  "PBB:318922014457": "KELUVRA STEEL SUPPLIES SDN BHD",
  "MBB:514409127730": "CEMVORA TRADING SDN BHD",
  "CIMB:860211773409": "BINQORA BEKALAN ENTERPRISE",
  "HLB:229018473365": "TAN WEI MING", // the BEC "new account": a personal account in the mule ring
  "MBB:562100984410": "LIM AH KOW",
};

const VALID_EINVOICES: Record<string, "Valid" | "Cancelled"> = {
  F9D425P6DS7D8IU: "Valid",
  "9KQ2ZR7M1WX3B5T": "Cancelled",
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mockSsm: SsmAdapter = {
  source: "SSM (mock)",
  async byRegNo(ssmNo) {
    await delay(20);
    const n = normaliseSsmNo(ssmNo);
    return COMPANIES.find((c) => c.ssmNo === n) ?? null;
  },
};

export const mockMyInvois: MyInvoisAdapter = {
  source: "LHDN MyInvois (mock)",
  async validateTin(tin, brn) {
    await delay(20);
    const t = normaliseTin(tin);
    return COMPANIES.some((c) => c.tin === t && c.ssmNo === normaliseSsmNo(brn));
  },
  async documentStatus(uuid) {
    await delay(20);
    return VALID_EINVOICES[uuid.toUpperCase()] ?? null;
  },
};

export const mockAccountName: AccountNameAdapter = {
  source: "DuitNow name enquiry (mock)",
  async holderName(value) {
    await delay(20);
    return ACCOUNT_HOLDERS[value] ?? null;
  },
};

/** Company-style account holder names (vs individuals). */
export const looksLikeCompany = (name: string) =>
  /\b(SDN\.?\s*BHD|BHD|BERHAD|ENTERPRISE|TRADING|PLT|LLP|RESOURCES|INDUSTRIES|HOLDINGS|SERVICES|SUPPLIES|CO\.?)\b/i.test(
    name,
  );

export const normaliseCompanyName = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\bSDN\s+BHD\b|\bBHD\b|\bBERHAD\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const bankAccountValue = (bank: string | undefined, account: string) =>
  normalise("bank_account", account, { bank }).value;
