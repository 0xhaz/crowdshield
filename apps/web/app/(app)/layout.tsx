import Image from "next/image";
import { MobileNav } from "@/components/MobileNav";
import { Sidebar } from "@/components/Sidebar";
import { getMe } from "@/lib/api";
import { navFor } from "@/lib/nav";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const me = await getMe();
  const links = navFor(me);
  return (
    <main className="flex h-screen w-full">
      <Sidebar me={me} links={links} />
      <div className="flex size-full flex-col">
        <div className="root-layout">
          <Image src="/logo.svg" width={30} height={30} alt="CrowdShield" />
          <MobileNav me={me} links={links} />
        </div>
        {children}
      </div>
    </main>
  );
}
