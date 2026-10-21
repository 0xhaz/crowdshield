import type { Metadata } from "next";
import { Noto_Sans } from "next/font/google";
import "./globals.css";

const noto = Noto_Sans({ subsets: ["latin"], variable: "--font-noto", display: "swap" });

export const metadata: Metadata = {
  title: "CrowdShield",
  description: "Scam and fraud intelligence for Malaysian banks, e-wallets and businesses.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${noto.variable} bg-white font-sans text-gray-900 antialiased`}>
        {children}
      </body>
    </html>
  );
}
