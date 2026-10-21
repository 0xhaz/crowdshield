import {
  BellRing,
  Building2,
  FileSearch,
  Fingerprint,
  FolderSearch,
  History,
  LayoutDashboard,
  PauseCircle,
  Radar,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import type { IconName } from "@/lib/nav";

const ICONS = {
  dashboard: LayoutDashboard,
  bell: BellRing,
  shield: ShieldCheck,
  folder: FolderSearch,
  fingerprint: Fingerprint,
  radar: Radar,
  scroll: ScrollText,
  "file-search": FileSearch,
  pause: PauseCircle,
  building: Building2,
  history: History,
} as const;

export function NavIcon({ name, className }: { name: IconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} aria-hidden />;
}
