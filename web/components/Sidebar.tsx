"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { IChart, ICube, IExternal, IHome, ILayers, IUsers, PrismCube } from "./icons";
import { TourButton } from "./Tour";

const PRIMARY = [
  { href: "/dashboard", label: "Dashboard", icon: IHome },
  { href: "/lookup", label: "Check a seller", icon: ILayers },
];

const SELLERS = [
  { href: "/seller/0xb6cb2d219abbf11ce61525d35b49513d9a2fa80f", label: "Horos Lien Oracle", note: "financed", icon: ICube },
  { href: "/seller/0xa8904aaa5ef379ccad3edad0c8545fb0951d6466", label: "Arc seller 0xa890", note: "offer out", icon: IUsers },
  { href: "/seller/0x43f10820df70545f0b308ed014e5b5e5b7f28f28", label: "Wash seller", note: "rejected", icon: IChart },
];

const LINKS = [
  { href: "https://github.com/sirbadenpowell/horos", label: "Source on GitHub" },
  { href: "https://explorer.testnet.arc.io/address/0x3655319cf8E43f54E90ffdb7A1CF2627Fdd67506", label: "LenderPool" },
  { href: "https://explorer.testnet.arc.io/address/0xD140eED8f20B2157366B36FcC08226d64c16906F", label: "LienRegistry" },
];

function useActive() {
  const path = usePathname();
  return (href: string) => path === href || path.startsWith(href + "/");
}

export function Sidebar() {
  const isActive = useActive();
  return (
    <>
      {/* Mobile / tablet: compact bar */}
      <header className="panel flex flex-col gap-3 p-3 lg:hidden">
        <div className="flex items-center gap-2.5 px-1">
          <Link href="/" className="flex items-center gap-2.5">
            <PrismCube size={30} />
            <span className="text-[18px] font-semibold tracking-tight">Horos</span>
          </Link>
          <span className="text-[11px] text-muted max-sm:hidden">revenue-based credit on Arc</span>
          <TourButton className="btn btn-ghost ml-auto !h-8 !px-3 text-[12px]" />
        </div>
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
          {[...PRIMARY, ...SELLERS].map(({ href, label }) => (
            <Link key={href} href={href} className={`relative shrink-0 rounded-lg px-3 py-2 text-[13px] ${isActive(href) ? "text-cyan" : "text-white/75"}`}>
              {isActive(href) && <motion.span layoutId="nav-pill-m" className="nav-pill edge glow-cyan" transition={PILL} />}
              <span className="relative">{label}</span>
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
            <div className="mt-1.5 text-[12px] text-muted">ΟΡΟΣ · revenue-based credit on Arc</div>
          </div>
        </Link>

        <nav className="space-y-1">
          {PRIMARY.map(({ href, label, icon: Icon }) => (
            <NavItem key={href} href={href} active={isActive(href)}>
              <Icon size={18} />
              <span>{label}</span>
            </NavItem>
          ))}
        </nav>

        <div className="mb-1.5 mt-6 px-3 text-[12px] font-medium text-muted">Sellers on file</div>
        <nav className="space-y-1">
          {SELLERS.map(({ href, label, note, icon: Icon }) => (
            <NavItem key={href} href={href} active={isActive(href)}>
              <Icon size={18} />
              <span className="flex-1 truncate">{label}</span>
              <span className="text-[11px] text-muted">{note}</span>
            </NavItem>
          ))}
        </nav>

        <div className="mt-auto pt-8">
          <TourButton className="btn btn-ghost mb-4 w-full" />
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

const PILL = { type: "spring", stiffness: 420, damping: 38 } as const;

/** The active pill is one element that glides between items as the route changes. */
function NavItem({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
      {active && <motion.span layoutId="nav-pill" className="nav-pill edge glow-cyan" transition={PILL} />}
      <span className="relative z-[2] flex flex-1 items-center gap-3">{children}</span>
    </Link>
  );
}
