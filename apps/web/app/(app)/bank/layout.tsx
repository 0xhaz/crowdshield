import { redirect } from "next/navigation";
import { getMe, homeFor, isBank } from "@/lib/api";

export default async function BankLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const me = await getMe();
  if (!isBank(me)) redirect(homeFor(me));
  return children;
}
