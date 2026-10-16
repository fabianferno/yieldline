import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });
const code = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-code" });

export const metadata: Metadata = {
  title: "Horos — working capital for x402 sellers",
  description:
    "An agent advances USDC against a seller's proven x402 revenue on Arc, sweeps repayment from incoming payments, and publishes every advance as a public on-chain lien.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${body.variable} ${code.variable} min-h-screen antialiased`}>
        <div className="mx-auto grid max-w-[1536px] grid-cols-1 gap-4 p-3 sm:p-4 lg:grid-cols-[272px_1fr] lg:gap-5">
          <Sidebar />
          <main className="min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
