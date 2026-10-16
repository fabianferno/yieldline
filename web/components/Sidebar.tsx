"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IChart, ICube, IExternal, IHome, ILayers, IUsers, PrismCube } from "./icons";

const NAV = [
  { href: "/", label: "Ledger", icon: IHome },
  { href: "/explorer", label: "Lien explorer", icon: ILayers },
  { href: "/lien/0xb6cb2d219abbf11ce61525d35b49513d9a2fa80f", label: "Horos Lien Oracle", icon: ICube },
  { href: "/lien/0xa8904aaa5ef379ccad3edad0c8545fb0951d6466", label: "Arc seller 0xa890", icon: IUsers },
  { href: "/lien/0x43f10820df70545f0b308ed014e5b5e5b7f28f28", label: "Wash seller (demo)", icon: IChart },
];

const LINKS = [
  { href: "https://github.com/sirbadenpowell/horos", label: "GitHub" },
  { href: "https://explorer.testnet.arc.io/address/0x3655319cf8E43f54E90ffdb7A1CF2627Fdd67506", label: "LenderPool on Arc" },
  { href: "https://explorer.testnet.arc.io/address/0xD140eED8f20B2157366B36FcC08226d64c16906F", label: "LienRegistry on Arc" },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
      <div className="panel overflow-hidden p-6">
        <div className="flex items-center gap-3">
          <PrismCube size={52} />
          <div>
            <div className="text-[28px] font-semibold leading-none tracking-tight">Horos</div>
            <div className="mt-1 text-[12px] text-muted">ΟΡΟΣ · revenue liens on Arc</div>
          </div>
        </div>
        <p className="mt-4 text-[14px] leading-snug text-muted">
          Working capital for businesses that earn through x402, carved into a public lien registry.
        </p>
      </div>

      <nav className="panel flex-1 p-4">
        <div className="mb-3 px-2 text-[15px] font-medium">Navigate</div>
        <div className="space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link key={href} href={href} className={`nav-item ${active ? "active edge glow-cyan" : ""}`}>
                <Icon />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
        <div className="divider my-5" />
        <div className="mb-2 px-2 text-[13px] text-muted">On-chain</div>
        <div className="space-y-1">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} target="_blank" className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-white/80 hover:bg-glass/60">
              <span className="h-2.5 w-2.5 rounded-full border border-muted" />
              <span className="flex-1">{l.label}</span>
              <IExternal size={14} className="text-muted" />
            </a>
          ))}
        </div>
      </nav>
    </aside>
  );
}
