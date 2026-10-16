import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SpecularField } from "@/components/Specular";
import "./globals.css";

const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });
const code = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-code" });

export const metadata: Metadata = {
  title: "Horos — working capital for x402 sellers",
  description:
    "An agent advances USDC against a seller's proven x402 revenue on Arc, sweeps repayment from incoming payments, and publishes every advance as a public on-chain lien.",
};

const CONTRACT = `<!--
THESIS: The landing is the x402 exchange itself: a live GET that answers 402 with payTo set to a lien splitter, then the paid 200 and the split. It refuses the hero-plus-feature-cards landing.
OWN-WORLD: Prism glass on midnight; cyan for money moving to the pool, amber for the seller's share and for human judgement; mono only for real protocol text.
STORY: A judge sees a real request get paid and split, understands the lien and the watch, and opens the live ledger.
FIRST VIEWPORT: Left, one-line offer and the "Open the live ledger" action; right, a request/response console playing the exchange against the real endpoint.
FORM: HTTP exchange as receipt, position 3 of 6, seed key d5e0e442.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${body.variable} ${code.variable} min-h-screen antialiased`}>
        <div hidden dangerouslySetInnerHTML={{ __html: CONTRACT }} />
        <SpecularField />
        {children}
      </body>
    </html>
  );
}
