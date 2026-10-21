"use client";

import type { Me } from "@crowdshield/contracts";
import { Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { NavLink } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Footer } from "./Footer";
import { NavIcon } from "./NavIcon";
import { isActiveRoute } from "./Sidebar";

export function MobileNav({ me, links }: { me: Me; links: NavLink[] }) {
  const pathname = usePathname();
  const root = links[0]!.route;
  return (
    <section className="w-fit">
      <Sheet>
        <SheetTrigger aria-label="Open menu">
          <Menu className="size-7 cursor-pointer text-gray-700" />
        </SheetTrigger>
        <SheetContent side="left" className="border-none bg-white">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Navigation</SheetDescription>
          <Link href={root} className="flex cursor-pointer items-center gap-2 px-4">
            <Image src="/logo.svg" width={34} height={34} alt="" />
            <span className="text-26 font-bold text-black-1">CrowdShield</span>
          </Link>
          <div className="mobilenav-sheet">
            <nav className="flex h-full flex-col gap-6 pt-16" aria-label="Main">
              {links.map((item) => {
                const active = isActiveRoute(pathname, item.route, root);
                return (
                  <SheetClose asChild key={item.route}>
                    <Link
                      href={item.route}
                      className={cn("mobilenav-sheet_close w-full", {
                        "bg-brand-gradient": active,
                      })}
                    >
                      <NavIcon
                        name={item.icon}
                        className={cn("size-5 text-gray-600", { "text-white": active })}
                      />
                      <p
                        className={cn("text-16 font-semibold text-black-2", {
                          "text-white": active,
                        })}
                      >
                        {item.label}
                      </p>
                    </Link>
                  </SheetClose>
                );
              })}
            </nav>
            <Footer me={me} type="mobile" />
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
