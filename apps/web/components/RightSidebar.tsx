import type { Me } from "@crowdshield/contracts";
import { titleCase } from "@/lib/utils";

/** banking-main's right sidebar: profile banner on top, then panels. */
export function RightSidebar({ me, children }: { me: Me; children: React.ReactNode }) {
  return (
    <aside className="right-sidebar" aria-label="Summary">
      <section className="flex flex-col pb-8">
        <div className="profile-banner" />
        <div className="profile">
          <div className="profile-img">
            <span className="text-5xl font-bold text-brand">{me.name[0]}</span>
          </div>
          <div className="profile-details">
            <h1 className="profile-name">{me.name}</h1>
            <p className="profile-email">
              {titleCase(me.role)} · {me.org.name}
            </p>
          </div>
        </div>
      </section>
      <section className="banks">{children}</section>
    </aside>
  );
}
