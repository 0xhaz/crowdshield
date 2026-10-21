import { SCAM_TYPE_LABEL, TIER_LABEL } from "@crowdshield/i18n";

export type Tier = keyof typeof TIER_LABEL;

/** techstacks §11: colour token + icon + label for every tier; colour is never the only cue. */
export const TIER_STYLE: Record<
  Tier,
  { text: string; bg: string; border: string; solid: string; hex: string; icon: TierIcon }
> = {
  confirmed: {
    text: "text-risk-critical",
    bg: "bg-risk-critical-bg",
    border: "border-risk-critical-border",
    solid: "bg-risk-critical-solid",
    hex: "#D92D20",
    icon: "shield-x",
  },
  high: {
    text: "text-risk-high",
    bg: "bg-risk-high-bg",
    border: "border-risk-high-border",
    solid: "bg-risk-high-solid",
    hex: "#EC4A0A",
    icon: "triangle",
  },
  caution: {
    text: "text-risk-caution",
    bg: "bg-risk-caution-bg",
    border: "border-risk-caution-border",
    solid: "bg-risk-caution-solid",
    hex: "#DC9F00",
    icon: "circle-alert",
  },
  reported: {
    text: "text-risk-low",
    bg: "bg-risk-low-bg",
    border: "border-risk-low-border",
    solid: "bg-risk-low-solid",
    hex: "#A8A27A",
    icon: "info",
  },
  no_known_risk: {
    text: "text-risk-none",
    bg: "bg-risk-none-bg",
    border: "border-risk-none-border",
    solid: "bg-risk-none-solid",
    hex: "#98A2B3",
    icon: "search",
  },
  protected_official: {
    text: "text-risk-info",
    bg: "bg-risk-info-bg",
    border: "border-risk-info-border",
    solid: "bg-risk-info-solid",
    hex: "#2E90FA",
    icon: "phone-shield",
  },
};
export type TierIcon =
  "shield-x" | "triangle" | "circle-alert" | "info" | "search" | "phone-shield";

export const TIER_ORDER: Tier[] = [
  "confirmed",
  "high",
  "caution",
  "reported",
  "no_known_risk",
  "protected_official",
];
export const tierLabel = (t: string) => TIER_LABEL[t as Tier] ?? { en: t, ms: t };
export const scamLabel = (t: string | null | undefined) =>
  t ? (SCAM_TYPE_LABEL[t as keyof typeof SCAM_TYPE_LABEL]?.en ?? t) : "Unclassified";

const SOURCE_LABEL: Record<string, string> = {
  pdrm_semakmule: "PDRM Semak Mule",
  nsrc_case: "NSRC case",
  bank_confirmed: "Bank-confirmed",
  regulator_alert: "Regulator alert list",
  threat_feed: "Threat feed",
  user_report_verified: "Public report (evidence)",
  user_report: "Public report",
  news_extraction: "News / web",
  model_inference: "Model lead",
};
export const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s;
