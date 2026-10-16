"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IChart, ICube, IExternal, IHome, ILayers, IUsers, PrismCube } from "./icons";

const PRIMARY = [
  { href: "/", label: "Ledger", icon: IHome },
  { href: "/explorer", label: "Lien explorer", icon: ILayers },
];

const SELLERS = [
  { href: "/lien/0xb6cb2d219abbf11ce61525d35b49513d9a2fa80f", label: "Horos Lien Oracle", note: "financed", icon: ICube },
  { href: "/lien/0xa8904aaa5ef379ccad3edad0c8545fb0951d6466", label: "Arc seller 0xa890", note: "offer out", icon: IUsers },
  { href: "/lien/0x43f10820df70545f0b308ed014e5b5e5b7f28f28", label: "Wash seller", note: "rejected", icon: IChart },
];

const LINKS = [
  { href: "https://github.com/sirbadenpowell/horos", label: "Source on GitHub" },
  { href: "https://explorer.testnet.arc.io/address/0x3655319cf8E43f54E90ffdb7A1CF2627Fdd67506", label: "LenderPool" },
  { href: "https://explorer.testnet.arc.io/address/0xD140eED8f20B2157366B36FcC08226d64c16906F", label: "LienRegistry" },
];

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
}

export function Sidebar() {
  const isActive = useActive();
  return (
    <>
      {/* Mobile / tablet: compact bar */}
      <header className="panel flex flex-col gap-3 p-3 lg:hidden">
        <Link href="/" className="flex items-center gap-2.5 px-1">
          <PrismCube size={30} />
          <span className="text-[18px] font-semibold tracking-tight">Horos</span>
          <span className="ml-auto text-[11px] text-muted">revenue liens on Arc</span>
        </Link>
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
          {[...PRIMARY, ...SELLERS].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`shrink-0 rounded-lg px-3 py-2 text-[13px] ${isActive(href) ? "edge glow-cyan bg-glass/70 text-cyan" : "text-white/75 hover:bg-glass/60"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>

      {/* Desktop: sticky rail */}
      <aside className="panel hidden self-start p-4 lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100vh-2rem)] lg:flex-col">
        <Link href="/" className="flex items-center gap-3 px-2 pb-5 pt-2">
          <PrismCube size={40} />
          <div>
            <div className="text-[22px] font-semibold leading-none tracking-tight">Horos</div>
            <div className="mt-1.5 text-[12px] text-muted">ΟΡΟΣ · revenue liens on Arc</div>
          </div>
        </Link>

        <nav className="space-y-1">
          {PRIMARY.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`nav-item ${isActive(href) ? "active edge glow-cyan" : ""}`}>
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="mb-1.5 mt-6 px-3 text-[12px] font-medium text-muted">Sellers on file</div>
        <nav className="space-y-1">
          {SELLERS.map(({ href, label, note, icon: Icon }) => (
            <Link key={href} href={href} className={`nav-item ${isActive(href) ? "active edge glow-cyan" : ""}`}>
              <Icon size={18} />
              <span className="flex-1 truncate">{label}</span>
              <span className="text-[11px] text-muted">{note}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-auto pt-8">
          <div className="divider mb-3" />
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} target="_blank" className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] text-muted hover:text-cyan">
              <span className="flex-1">{l.label}</span>
              <IExternal size={13} />
            </a>
          ))}
          <p className="mt-3 px-3 text-[11px] leading-relaxed text-muted/80">Arc testnet · chain 5042002. Every number on these pages is read from chain.</p>
        </div>
      </aside>
    </>
  );
}
