import type { Me } from "@crowdshield/contracts";

export type IconName =
  | "dashboard"
  | "bell"
  | "shield"
  | "folder"
  | "fingerprint"
  | "radar"
  | "scroll"
  | "file-search"
  | "pause"
  | "building"
  | "history";

export interface NavLink {
  route: string;
  label: string;
  icon: IconName;
}

export function navFor(me: Me): NavLink[] {
  if (me.role === "sme_owner" || me.role === "sme_member") {
    return [
      { route: "/sme", label: "Overview", icon: "dashboard" },
      { route: "/sme/check", label: "Check invoice", icon: "file-search" },
      { route: "/sme/holds", label: "Payment holds", icon: "pause" },
      { route: "/sme/suppliers", label: "Suppliers", icon: "building" },
      { route: "/sme/checks", label: "Check history", icon: "history" },
    ];
  }
  const links: NavLink[] = [
    { route: "/bank", label: "Overview", icon: "dashboard" },
    { route: "/bank/alerts", label: "Alerts", icon: "bell" },
    { route: "/bank/payee-check", label: "Payee check", icon: "shield" },
    { route: "/bank/cases", label: "Cases", icon: "folder" },
    { route: "/bank/entities", label: "Entities", icon: "fingerprint" },
    { route: "/bank/campaigns", label: "Campaigns", icon: "radar" },
  ];
  if (me.role === "bank_supervisor" || me.role === "admin")
    links.push({ route: "/bank/audit", label: "Audit log", icon: "scroll" });
  return links;
}
