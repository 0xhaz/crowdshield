// Malaysian banks and e-wallets: short codes used in normalised identifiers ("MBB:5123…")
// and the names/aliases users and invoices actually write.

export const BANKS: Record<string, { name: string; aliases: string[] }> = {
  MBB: {
    name: "Maybank",
    aliases: ["maybank", "malayan banking", "maybank islamic", "mbb", "m2u"],
  },
  CIMB: { name: "CIMB Bank", aliases: ["cimb", "cimb bank", "cimb islamic", "cimb clicks"] },
  PBB: { name: "Public Bank", aliases: ["public bank", "pbb", "public islamic", "pbe"] },
  RHB: { name: "RHB Bank", aliases: ["rhb", "rhb bank", "rhb islamic"] },
  HLB: {
    name: "Hong Leong Bank",
    aliases: ["hong leong", "hong leong bank", "hlb", "hong leong islamic"],
  },
  AMB: { name: "AmBank", aliases: ["ambank", "amb", "am bank", "ambank islamic"] },
  BIMB: { name: "Bank Islam", aliases: ["bank islam", "bimb"] },
  BKRM: { name: "Bank Rakyat", aliases: ["bank rakyat", "bkrm"] },
  BSN: { name: "BSN", aliases: ["bsn", "bank simpanan nasional"] },
  AFFIN: { name: "Affin Bank", aliases: ["affin", "affin bank", "affin islamic"] },
  ABMB: { name: "Alliance Bank", aliases: ["alliance", "alliance bank", "abmb"] },
  MUAMALAT: { name: "Bank Muamalat", aliases: ["muamalat", "bank muamalat"] },
  AGRO: { name: "Agrobank", aliases: ["agrobank", "agro bank", "bank pertanian"] },
  OCBC: { name: "OCBC Bank", aliases: ["ocbc", "ocbc bank", "ocbc al-amin"] },
  UOB: { name: "UOB", aliases: ["uob", "united overseas bank"] },
  HSBC: { name: "HSBC", aliases: ["hsbc", "hsbc amanah"] },
  SCB: { name: "Standard Chartered", aliases: ["standard chartered", "scb", "stanchart"] },
  GXB: { name: "GXBank", aliases: ["gxbank", "gx bank", "gxb"] },
  BOOSTB: { name: "Boost Bank", aliases: ["boost bank"] },
  AEONB: { name: "AEON Bank", aliases: ["aeon bank"] },
  KAF: { name: "KAF Digital Bank", aliases: ["kaf", "kaf digital"] },
  RYT: { name: "Ryt Bank", aliases: ["ryt", "ryt bank"] },
};

export const EWALLETS: Record<string, { name: string; aliases: string[] }> = {
  TNG: {
    name: "Touch 'n Go eWallet",
    aliases: ["tng", "touch n go", "touch 'n go", "tng ewallet", "touchngo"],
  },
  GRAB: { name: "GrabPay", aliases: ["grabpay", "grab"] },
  BOOST: { name: "Boost", aliases: ["boost", "boost ewallet"] },
  SPAY: { name: "ShopeePay", aliases: ["shopeepay", "shopee pay", "spay"] },
  BIGPAY: { name: "BigPay", aliases: ["bigpay", "big pay"] },
  MAE: { name: "MAE by Maybank", aliases: ["mae"] },
};

function buildLookup(table: Record<string, { name: string; aliases: string[] }>) {
  const map = new Map<string, string>();
  for (const [code, { name, aliases }] of Object.entries(table)) {
    for (const key of [code, name, ...aliases])
      map.set(key.toLowerCase().replace(/[^a-z0-9]/g, ""), code);
  }
  return (input: string) => map.get(input.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

export const resolveBankCode = buildLookup(BANKS);
export const resolveEwalletCode = buildLookup(EWALLETS);
