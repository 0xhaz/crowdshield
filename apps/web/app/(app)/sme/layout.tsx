import { redirect } from "next/navigation";
import { getMe, homeFor, isSme } from "@/lib/api";

export default async function SmeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const me = await getMe();
  if (!isSme(me) && me.role !== "admin") redirect(homeFor(me));
  return children;
}
