"use client";

import type { Me } from "@crowdshield/contracts";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavLink } from "@/lib/nav";
import { Footer } from "./Footer";
import { NavIcon } from "./NavIcon";

export const isActiveRoute = (pathname: string, route: string, root: string) =>
  route === root ? pathname === route : pathname === route || pathname.startsWith(`${route}/`);

export function Sidebar({ me, links }: { me: Me; links: NavLink[] }) {
  const pathname = usePathname();
  const root = links[0]!.route;
  return (
    <section className="sidebar">
      <nav className="flex flex-col gap-4" aria-label="Main">
        <Link href={root} className="mb-12 flex cursor-pointer items-center gap-2">
          <Image
            src="/logo.svg"
            width={34}
            height={34}
            alt="CrowdShield"
            className="size-[28px] max-xl:size-14"
          />
          <h1 className="sidebar-logo">CrowdShield</h1>
        </Link>
        {links.map((item) => {
          const active = isActiveRoute(pathname, item.route, root);
          return (
            <Link
              key={item.route}
              href={item.route}
              aria-current={active ? "page" : undefined}
              className={cn("sidebar-link", { "bg-brand-gradient": active })}
            >
              <NavIcon
                name={item.icon}
                className={cn("size-6 text-gray-600", { "text-white": active })}
              />
              <p className={cn("sidebar-label", { "!text-white": active })}>{item.label}</p>
            </Link>
          );
        })}
      </nav>
      <Footer me={me} />
    </section>
  );
}
