"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { NextStep, NextStepProvider, useNextStep, type CardComponentProps, type Tour } from "nextstepjs";
import { useNextAdapter } from "nextstepjs/adapters/next";
import { IArrow, IX, PrismCube } from "./icons";

/**
 * First-visit walkthrough: the pool marketplace, the roles, one pool's rules, the lookup and one seller.
 * Every target is an `id="tour-…"` on the page itself; steps that wait on API data retry the selector.
 */
const TOUR = "loop";
const SEEN = "horos.tour.v2";
const DEMO_SELLER = "/seller/0xb6cb2d219abbf11ce61525d35b49513d9a2fa80f";
const WAIT = { selectorRetryAttempts: 25, selectorRetryDelay: 200 };

const CORE = "/pools/0x4c5e2AE7E0875aC356A40B13D4b0Fa3033326495";

const STEPS: Tour[] = [
  {
    tour: TOUR,
    steps: [
      {
        icon: <PrismCube size={28} />,
        title: "Working capital, repaid by the sales it funds",
        content: (
          <>
            Horos lends USDC to businesses that get paid per call over x402. An agent checks the revenue is real, lenders fund it through
            pools, and every later payment pays a slice back automatically. Seven stops, about a minute.
          </>
        ),
      },
      {
        title: "Pools, run by curators",
        content: (
          <>
            Anyone can start a pool and set how much risk it takes. Lenders deposit USDC into the pools they trust. All pools share one public
            lien registry, so a seller can&apos;t borrow twice against the same revenue.
          </>
        ),
        selector: "#tour-pools",
        side: "top",
        pointerPadding: 6,
        pointerRadius: 14,
        ...WAIT,
      },
      {
        title: "One passkey, three roles",
        content: (
          <>
            Sign in with a passkey: it creates a Circle smart account on Arc. <b>Borrow</b> if you sell over x402, <b>Lend</b> to earn the fees
            sellers pay, <b>Curate</b> to run a pool.
          </>
        ),
        selector: "#tour-you",
        side: "right",
        pointerPadding: 6,
        pointerRadius: 14,
        nextRoute: CORE,
      },
      {
        title: "Rules the agent can't talk its way past",
        content: (
          <>
            Each pool&apos;s limits live in its contract: risk appetite, max advance, curator approval above a size, exposure per seller. The
            curator can&apos;t move depositors&apos; money, and only the curator can mark a default.
          </>
        ),
        selector: "#tour-rules",
        side: "left-top",
        pointerPadding: 8,
        pointerRadius: 16,
        prevRoute: "/markets",
        nextRoute: "/lookup",
        ...WAIT,
      },
      {
        title: "Check a seller before you lend",
        content: (
          <>
            Paste any wallet. You&apos;ll see whether its revenue is already pledged, which pool holds the lien, its repayment record, and where
            its payments really come from.
          </>
        ),
        selector: "#tour-lookup",
        side: "bottom",
        pointerPadding: 10,
        pointerRadius: 14,
        prevRoute: CORE,
        nextRoute: DEMO_SELLER,
        ...WAIT,
      },
      {
        title: "Pledged or not, in one line",
        content: (
          <>
            While an advance is open, the seller&apos;s revenue is <b>pledged</b>: a public lien that blocks every other pool. It clears when the
            advance is repaid.
          </>
        ),
        selector: "#tour-pledge",
        side: "bottom",
        pointerPadding: 12,
        pointerRadius: 16,
        prevRoute: "/lookup",
        ...WAIT,
      },
      {
        title: "Why the agent said yes, or no",
        content: (
          <>
            The underwriter&apos;s verdict on this seller, with its risk score and reasoning, anchored on Arc. This one was rejected and then
            financed as an operator pilot, and the page says so.
          </>
        ),
        selector: "#tour-verdict",
        side: "bottom",
        pointerPadding: 8,
        pointerRadius: 16,
        ...WAIT,
      },
    ],
  },
];

export function TourProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextStepProvider>
      <NextStep
        steps={STEPS}
        cardComponent={TourCard}
        navigationAdapter={useNextAdapter}
        shadowRgb="5, 5, 7"
        shadowOpacity="0.72"
        cardTransition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        arrowStyle={{ color: "#18181c" }}
        overlayZIndex={60}
        scrollToTop={false}
        disableConsoleLogs
        onComplete={markSeen}
        onSkip={markSeen}
      >
        <AutoStart />
        {children}
      </NextStep>
    </NextStepProvider>
  );
}

function markSeen() {
  try {
    localStorage.setItem(SEEN, "1");
  } catch {}
}

/** Opens the tour once, on a first visit to the pools page. */
function AutoStart() {
  const { startNextStep, isNextStepVisible } = useNextStep();
  const path = usePathname();
  useEffect(() => {
    if (path !== "/markets" || isNextStepVisible) return;
    let seen = true;
    try {
      seen = localStorage.getItem(SEEN) === "1";
    } catch {}
    if (seen) return;
    const t = setTimeout(() => startNextStep(TOUR), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return null;
}

/** Replays the tour from the first stop, from wherever the visitor is. */
export function TourButton({ className = "" }: { className?: string }) {
  const { startNextStep } = useNextStep();
  const path = usePathname();
  const { push } = useNextAdapter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (path !== "/markets") push("/markets");
        setTimeout(() => startNextStep(TOUR), path === "/markets" ? 0 : 500);
      }}
    >
      Take the tour
    </button>
  );
}

function TourCard({ step, currentStep, totalSteps, nextStep, prevStep, skipTour, arrow }: CardComponentProps) {
  const last = currentStep === totalSteps - 1;
  const first = currentStep === 0;
  return (
    <div className="tour-card panel edge relative w-[min(92vw,380px)] p-5" role="dialog" aria-labelledby="tour-title">
      {arrow}
      <div className="flex items-center gap-3">
        {step.icon ? <span className="shrink-0">{step.icon}</span> : null}
        <span className="num text-[12px] text-muted">
          {currentStep + 1} / {totalSteps}
        </span>
        <button type="button" onClick={skipTour} aria-label="Close tour" className="ml-auto rounded-md p-1 text-muted transition hover:text-white">
          <IX size={16} />
        </button>
      </div>
      <motion.div key={currentStep} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
        <h2 id="tour-title" className="mt-3 text-[17px] font-semibold leading-snug tracking-tight">
          {step.title}
        </h2>
        <div className="tour-copy mt-2 text-[13.5px] leading-relaxed text-white/75">{step.content}</div>
      </motion.div>

      <div className="mt-5 flex gap-1" aria-hidden>
        {Array.from({ length: totalSteps }, (_, i) => (
          <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
            <motion.span
              className="block h-full rounded-full bg-cyan"
              initial={false}
              animate={{ scaleX: i <= currentStep ? 1 : 0 }}
              style={{ originX: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            />
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {first ? (
          <button type="button" onClick={skipTour} className="text-[13px] text-muted transition hover:text-white">
            Skip
          </button>
        ) : (
          <button type="button" onClick={prevStep} className="btn btn-ghost">
            Back
          </button>
        )}
        <button type="button" onClick={last ? skipTour : nextStep} className="btn btn-primary ml-auto">
          {first ? "Show me" : last ? "Done" : "Next"} {!last && <IArrow size={15} />}
        </button>
      </div>
    </div>
  );
}
