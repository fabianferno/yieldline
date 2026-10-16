import type { Metadata } from "next";
import { EB_Garamond, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const display = EB_Garamond({ subsets: ["latin", "greek"], weight: ["500", "600", "700"], variable: "--font-display" });
const body = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const code = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-code" });

export const metadata: Metadata = {
  title: "Horos — working capital for x402 sellers",
  description:
    "An agent advances USDC against a seller's proven x402 revenue on Arc, sweeps repayment from incoming payments, and publishes every advance as a public on-chain lien.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${code.variable} stone min-h-screen antialiased`}>
        <header className="border-b border-rule">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <Link href="/" className="flex items-baseline gap-3">
              <span className="font-serif text-3xl font-bold tracking-wide">ΟΡΟΣ</span>
              <span className="engraved hidden text-[11px] text-ink-3 sm:inline">Horos · revenue liens on Arc</span>
            </Link>
            <nav className="flex items-center gap-5 text-sm">
              <Link href="/" className="hover:text-terra">Ledger</Link>
              <Link href="/explorer" className="hover:text-terra">Lien explorer</Link>
              <a href="https://github.com/sirbadenpowell/horos" className="text-ink-3 hover:text-terra">GitHub</a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs text-ink-3 sm:px-6">
          Arc testnet · USDC · Circle Wallets · x402. In Attica, a <em>horos</em> was a boundary stone recording a debt
          against the land, readable by every future lender.
        </footer>
      </body>
    </html>
  );
}
