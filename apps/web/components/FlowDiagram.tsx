import {
  ArrowRight,
  Ban,
  Building2,
  Camera,
  Puzzle,
  Landmark,
  Mail,
  MessageCircle,
  Network,
  PhoneCall,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Stage = {
  title: string;
  line: string;
  tone: string;
  items: { icon: LucideIcon; label: string }[];
};

const STAGES: Stage[] = [
  {
    title: "A scam reaches you",
    line: "A call, a chat, an SMS or an email",
    tone: "bg-risk-high-bg text-risk-high border-risk-high-border",
    items: [
      { icon: PhoneCall, label: "Call" },
      { icon: MessageCircle, label: "WhatsApp" },
      { icon: Mail, label: "Email" },
    ],
  },
  {
    title: "Check in one tap",
    line: "Nemotron reads it; nothing to copy",
    tone: "bg-blue-25 text-indigo-700 border-indigo-500/30",
    items: [
      { icon: MessageCircle, label: "Bot" },
      { icon: Puzzle, label: "Extension" },
      { icon: Camera, label: "Screenshot" },
    ],
  },
  {
    title: "One shared scam graph",
    line: "Every report warns the next person",
    tone: "bg-risk-info-bg text-risk-info border-risk-info-border",
    items: [
      { icon: Users, label: "Public" },
      { icon: Landmark, label: "Banks" },
      { icon: Building2, label: "Businesses" },
    ],
  },
  {
    title: "Stopped before you pay",
    line: "In milliseconds, with one clear action",
    tone: "bg-success-25 text-success-700 border-success-600/30",
    items: [
      { icon: Ban, label: "Transfer paused" },
      { icon: ShieldCheck, label: "Warned" },
      { icon: Network, label: "Mule flagged" },
    ],
  },
];

/** The whole product in four stages. */
export function FlowDiagram() {
  return (
    <ol className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-stretch">
      {STAGES.map((s, i) => (
        <li key={s.title} className="contents">
          <div className={`flex flex-col gap-3 rounded-2xl border p-5 ${s.tone}`}>
            <span className="text-12 font-bold uppercase tracking-wider opacity-80">
              Step {i + 1}
            </span>
            <h3 className="text-18 font-bold text-gray-900">{s.title}</h3>
            <p className="text-14 text-gray-700">{s.line}</p>
            <div className="mt-auto flex flex-wrap gap-2 pt-2">
              {s.items.map((x) => (
                <span key={x.label} className="chip border-gray-200 bg-white/80">
                  <x.icon className="size-3.5" aria-hidden /> {x.label}
                </span>
              ))}
            </div>
          </div>
          {i < STAGES.length - 1 && (
            <div className="flex items-center justify-center text-gray-400" aria-hidden>
              <ArrowRight className="size-6 rotate-90 md:rotate-0" />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
