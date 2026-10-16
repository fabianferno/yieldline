"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { NextStep, NextStepProvider, useNextStep, type CardComponentProps, type Tour } from "nextstepjs";
import { useNextAdapter } from "nextstepjs/adapters/next";
import { IArrow, IX, PrismCube } from "./icons";

/**
 * First-visit walkthrough of the loop, across the dashboard, the lookup and one seller.
 * Every target is an `id="tour-…"` on the page itself; steps that wait on API data retry the selector.
 */
const TOUR = "loop";
const SEEN = "horos.tour.v1";
const DEMO_SELLER = "/seller/0xb6cb2d219abbf11ce61525d35b49513d9a2fa80f";
const WAIT = { selectorRetryAttempts: 25, selectorRetryDelay: 200 };

const STEPS: Tour[] = [
  {
    tour: TOUR,
    steps: [
      {
        icon: <PrismCube size={28} />,
        title: "Working capital, repaid by the sales it funds",
        content: (
          <>
            Horos lends USDC to businesses that get paid per call over x402. An agent checks the revenue is real, and every later payment pays
            a slice of the loan back automatically. Eight stops, about a minute.
          </>
        ),
      },
      {
        title: "The loop, live",
        content: (
          <>
            Read left to right. <b>Underwrite</b>: an agent judges the seller. <b>Advance</b>: the pool sends USDC. <b>Repay</b>: each sale
            pays a share back. <b>Watch</b>: a monitor checks payments still route correctly. <b>Park</b>: idle cash earns yield.
          </>
        ),
        selector: "#tour-loop",
        side: "bottom",
        pointerPadding: 6,
        pointerRadius: 14,
      },
      {
        title: "An advance pays itself back",
        content: (
          <>
            The seller points their x402 <span className="mono text-ice">payTo</span> at a splitter. Every payment is divided on arrival: a
            share to the pool until the cap is reached, the rest to the seller. The bar is real repayment on Arc.
          </>
        ),
        selector: "#tour-advance",
        side: "bottom",
        pointerPadding: 8,
        pointerRadius: 16,
        ...WAIT,
      },
      {
        title: "Every decision shows its reasoning",
        content: (
          <>
            Underwriting, monitoring and operator overrides are each written to Arc with the agent&apos;s reasoning. Filter by who decided.
            Rejections stay on the record too.
          </>
        ),
        selector: "#tour-decisions",
        side: "bottom",
        pointerPadding: 8,
        pointerRadius: 12,
        ...WAIT,
      },
      {
        title: "Limits the agent can't talk its way past",
        content: (
          <>
            Where the pool&apos;s money is right now, and the hard limits enforced by the contract: maximum advance, human approval above $5,
            exposure per seller. The prompt can&apos;t override them.
          </>
        ),
        selector: "#tour-pool",
        side: "left-top",
        pointerPadding: 8,
        pointerRadius: 16,
        nextRoute: "/lookup",
        ...WAIT,
      },
      {
        title: "Check a seller before you lend",
        content: (
          <>
            Paste any wallet. You&apos;ll see whether its revenue is already pledged to a lender, its repayment record, and where its payments
            really come from. Next, one seller up close.
          </>
        ),
        selector: "#tour-lookup",
        side: "bottom",
        pointerPadding: 10,
        pointerRadius: 14,
        prevRoute: "/dashboard",
        nextRoute: DEMO_SELLER,
        ...WAIT,
      },
      {
        title: "Pledged or not, in one line",
        content: (
          <>
            While an advance is open, the seller&apos;s revenue is <b>pledged</b>: recorded as a public lien so no second lender can borrow
            against the same income. It clears when the advance is repaid.
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
            The underwriter&apos;s latest verdict on this seller: decision, risk score and reasoning. This one was rejected and then financed
            as an operator pilot, and the page says so. Below it: revenue and payer forensics.
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

/** Opens the tour once, on a first visit to the dashboard. */
function AutoStart() {
  const { startNextStep, isNextStepVisible } = useNextStep();
  const path = usePathname();
  useEffect(() => {
    if (path !== "/dashboard" || isNextStepVisible) return;
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
        if (path !== "/dashboard") push("/dashboard");
        setTimeout(() => startNextStep(TOUR), path === "/dashboard" ? 0 : 500);
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
