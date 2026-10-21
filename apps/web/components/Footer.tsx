import type { Me } from "@crowdshield/contracts";
import { LogOut } from "lucide-react";
import { logout } from "@/lib/actions/auth";
import { titleCase } from "@/lib/utils";

export function Footer({ me, type = "desktop" }: { me: Me; type?: "desktop" | "mobile" }) {
  return (
    <footer className="footer">
      <div className={type === "mobile" ? "footer_name-mobile" : "footer_name"}>
        <p className="text-xl font-bold text-gray-700">{me.name[0]}</p>
      </div>
      <div className={type === "mobile" ? "footer_email-mobile" : "footer_email"}>
        <h1 className="text-14 truncate font-semibold text-gray-700">{me.name}</h1>
        <p className="text-14 truncate font-normal text-gray-600">
          {titleCase(me.role)} · {me.org.name}
        </p>
      </div>
      <form action={logout}>
        <button
          type="submit"
          className="footer_image text-gray-600 hover:text-gray-900"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="size-5" />
        </button>
      </form>
    </footer>
  );
}
