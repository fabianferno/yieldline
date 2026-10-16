---
name: Horos
description: Prism glass on midnight for a public ledger of revenue liens on Arc.
colors:
  midnight: "#09090b"
  navy: "#16161a"
  glass: "#232327"
  cyan: "#ff4545"
  cyan-deep: "#c81e2a"
  ice: "#ffe2de"
  amber: "#ff8a7a"
  amber-deep: "#e0352f"
  white: "#f5f7fa"
  muted: "#9d9ca3"
  success: "#34d399"
  danger: "#ff5a5f"
  info: "#3b9cff"
  line: "rgba(157, 156, 163, 0.14)"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(40px, 6vw, 56px)"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(30px, 4.5vw, 40px)"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  page-title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(26px, 3vw, 34px)"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  figure:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
    fontFeature: "tnum"
  panel-title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.005em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.625
  body-small:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.625
rounded:
  xs: "6px"
  tab: "9px"
  sm: "10px"
  md: "12px"
  lg: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "28px"
  section: "80px"
components:
  button-primary:
    backgroundColor: "rgba(108, 20, 26, 0.55)"
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "40px"
    typography: "{typography.body-small}"
  button-primary-lg:
    backgroundColor: "rgba(108, 20, 26, 0.55)"
    textColor: "{colors.white}"
    rounded: "{rounded.lg}"
    padding: "0 24px"
    height: "48px"
  button-ghost:
    backgroundColor: "rgba(35, 35, 39, 0.5)"
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "40px"
  button-secondary:
    backgroundColor: "rgba(224, 53, 47, 0.1)"
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "40px"
  panel:
    backgroundColor: "{colors.navy}"
    rounded: "{rounded.lg}"
    padding: "20px"
  input:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    padding: "0 14px 0 40px"
    height: "44px"
  chip:
    backgroundColor: "rgba(22, 22, 26, 0.8)"
    rounded: "{rounded.pill}"
    padding: "0 10px"
    height: "24px"
  nav-item:
    textColor: "rgba(245, 247, 250, 0.82)"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "40px"
  nav-item-active:
    textColor: "{colors.cyan}"
    rounded: "{rounded.sm}"
  tab:
    textColor: "{colors.muted}"
    rounded: "{rounded.tab}"
    padding: "0 14px"
    height: "38px"
  tab-active:
    backgroundColor: "rgba(92, 20, 24, 0.9)"
    textColor: "{colors.white}"
    rounded: "{rounded.tab}"
---

# Design System: Horos

## Overview

**Creative North Star: "The Lit Ledger"**

A dark ledger read through glass. Everything sits on near-black midnight, inside translucent navy panels, and the only light in the room is the money: cyan where USDC moves toward the pool, amber where it belongs to the seller or where a human has to judge. The system's signature is the iridescent edge, a 1px border that runs cyan at the top-left, fades to near-nothing along the sides and turns amber at the bottom-right, so a single panel carries both halves of every split.

The world is dense but quiet. Numbers are the heroes: tabular, semibold, and alive (they count to their new value and flash ice when they grow). Prose is sentence-case Inter at moderate weight, set narrow (48 to 72ch). Mono is reserved for real protocol text: addresses, `payTo`, HTTP lines, flags. Motion is one curve everywhere (cubic-bezier(0.16, 1, 0.3, 1)) and always means something arrived, moved or settled.

Light follows the pointer. Buttons carry a specular edge whose bright arc points toward the cursor and brightens as it approaches, so the interface feels like a lit object rather than a flat page.

**Key Characteristics:**
- Midnight ground with two faint fixed radial washes (cyan top-left, amber bottom-right).
- Translucent navy panels with a hairline border and a soft drop; the iridescent edge on the panel that matters most per view.
- Cyan = toward the pool / system; amber = seller's share / human judgement. Never swapped.
- Tabular semibold numbers that animate between values.
- Mono only for protocol and chain text.
- One easing curve; motion reports state changes, not decoration.

## Colors

A cold, near-monochrome night palette split by two warm-and-cool light sources, cyan and amber, plus a small signal set for verdicts.

### Primary
- **Pool Cyan** (cyan): money moving to the pool, active states, the live/active nav and tab, links on hover, focus rings, the repaid figure, the sweep segment of every split bar. Paired with **Deep Cyan** (cyan-deep) as the far stop of the primary gradient (90deg cyan → cyan-deep) on fills and split segments, with midnight text on top.
- **Ice** (ice): the pale cold highlight. Mono addresses and `payTo` tokens, the flash color when a number grows, the sweep-run light that crosses the bar when a repayment lands.

### Secondary
- **Seller Amber** (amber), with **Deep Amber** (amber-deep) as its gradient partner: the seller's share in a split, idle cash parked in the treasury, risk scores, the 402 status, "needs a human" chips, operator overrides and warnings. Amber is judgement and the other side of the ledger; it is never a generic accent.

### Tertiary (signal set)
- **Verdict Green** (success): offers, funding, repaid liens, 200 OK, clean revenue.
- **Freeze Red** (danger): rejections, freezes, defaults, errors, the frozen progress fill (danger → #c2262c).
- **Monitor Blue** (info): neutral agent actions (continue, deploy idle) and the monitor's verdict.

### Neutral
- **Midnight** (midnight): page ground, text on cyan fills, inset wells (at 40 to 60%).
- **Ledger Navy** (navy): panel body (as a 78% translucent gradient to #0a0f17), input fill, chips.
- **Glass Slate** (glass): the seller segment of split bars, nav hover, skeletons, inactive tracks.
- **Paper White** (white): primary text. Secondary text steps down by opacity (85, 75, 70%) rather than by new hues.
- **Fog** (muted): labels, metadata, timestamps, placeholders.
- **Hairline** (line): every border and divider.

### Named Rules
**The Two Lights Rule.** Cyan means toward the pool or the system acting; amber means the seller's share or a human deciding. A split bar is always cyan then amber/glass, left to right, and the iridescent edge always runs cyan top-left to amber bottom-right.

**The Opacity Ladder Rule.** Secondary text is white at reduced opacity (85 / 75 / 70%) or muted; do not introduce new grey hexes.

## Typography

**Display Font:** Inter (with system-ui, sans-serif)
**Body Font:** Inter (with system-ui, sans-serif)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, monospace)

**Character:** One neutral grotesk at four weights does all the talking, tightened at size; a clean mono appears only where the text is literally machine text. The pairing reads as an instrument, not a brochure.

### Hierarchy
- **Display** (600, 40px → 56px, 1.04, -0.03em): the landing's single offer line only, capped near 16ch.
- **Headline** (600, 30px → 38/40px, ~1.25, -0.025em): landing section heads, each a full sentence.
- **Page title** (600, 26/28px → 30/34px, tight): the app's per-route h1 (Ledger, Seller, the explorer question).
- **Title** (600, 22px, tight): loop stage names; lien headings step down to 18px.
- **Figure** (600, 22px, tabular): metric values. Smaller figures use 15 to 20px at the same weight, always tabular.
- **Panel title** (500, 15px, +0.005em): the heading inside every panel.
- **Body** (400, 15 to 16px, 1.625): lead and section prose, 48 to 62ch.
- **Body small** (400, 13 to 14px, 1.625): rationales, list rows, alerts; rationales cap at 72ch.
- **Label** (400/500, 12px): metric labels, metadata lines, panel right-hand notes. Sentence case. 11px for chips and counts.
- **Mono** (400, 12 to 16px): addresses, HTTP exchange (12.5px), flags, `payTo`.

### Named Rules
**The Protocol-Only Mono Rule.** JetBrains Mono appears only on text a machine produced or consumes: addresses, hashes, endpoints, headers, flag codes, `payTo`. Never for labels, numbers or decoration.

**The Sentence Case Rule.** Nothing in the system is uppercase or letter-spaced as a label. Headings are sentences; labels are sentence-case muted text. (Uppercase appears only when quoting a real protocol header such as PAYMENT-REQUIRED.)

**The Tabular Rule.** Every figure that can change carries tabular numerals so live updates don't jitter.

## Layout

**Site (landing):** a single centered column, max 1240px, 16px gutters (24px from sm). Sections breathe at 80px vertical padding. The first viewport is a two-column grid (offer left, a 560px console right) that stacks below lg. Section intros cap near 640px; two-column sections split roughly 1 : 1.1 to 1.2.

**App:** a max-1536px grid with a 272px sticky sidebar rail (from lg) and a fluid main column; 12 to 16px outer padding, 16 to 20px gaps. Below lg the rail collapses to a compact header with a horizontally scrolling pill nav. Within the ledger, content splits 1.6 : 1 from xl (liens and decisions left, activity right).

**Rhythm:** a 4px base. Panels pad 16px (20px from sm), hero panels 20 to 32px. Stacks use 20px between panels, 32px between lien cards. Metric grids are 2 columns on mobile, 4 from sm, with 24px column gaps. Five-stage strips use 1px gaps over a hairline background to draw their dividers.

## Elevation & Depth

Depth is glass layering plus light, not lift. The page is lit by two fixed radial washes; panels are translucent navy over it with an inner top highlight and a long soft drop; the most important panel per view gets the iridescent edge; active controls glow from inside. Nothing hovers higher on hover except buttons, by 1px.

### Shadow Vocabulary
- **Panel** (`box-shadow: inset 0 1px 0 rgba(255,255,255,0.03), 0 20px 40px -24px rgba(0,0,0,0.8)`): every panel. Ambient, structural.
- **Cyan glow** (`box-shadow: 0 0 0 1px rgba(255,69,69,0.08), 0 0 22px -4px rgba(255,69,69,0.45), inset 0 0 18px -6px rgba(255,69,69,0.35)`): the active nav pill and active tab pill only.
- **Fill glow** (`box-shadow: 0 0 12px rgba(255,69,69,0.7)`): progress fills (red equivalent on frozen).
- **Alert glow** (`box-shadow: 0 0 18px -8px <signal at 0.6>`): alerts, tinted to their signal.
- **Button drop** (`box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 20px -12px <edge color × intensity>`): grows with the specular intensity.

### Named Rules
**The Iridescent Edge Rule.** The cyan-to-amber 1px edge (masked gradient border) marks the one hero panel per view (landing console and closing panel, ledger intro, explorer search, seller header), the search field, and the active pill. It is a signature, not a default border; ordinary panels use the hairline.

**The Lit From Within Rule.** Glows are inner-and-outer light in the signal's own color, never a dark offset shadow.

## Shapes

Softly rounded glass slabs, never sharp, never bubbly. Panels and large buttons are 14px; buttons, tab tracks and inset wells 12px; inputs, nav items and alerts 10px; tab pills 9px; small tags 6px; chips, status dots and progress tracks are full pills. Split bars are 6 to 8px with hard internal seams. Borders are always 1px hairline; the edge treatment is a 1px (button 1.2px) masked gradient that inherits the host radius. Icons are a thin line set: 24px grid, 1.6px stroke, round caps and joins, used at 15 to 18px. The PrismCube mark is the only illustration, used large (150 to 220px) at the side of hero panels.

## Components

### Buttons
Specular glass: dark, tinted, and lit along the edge by the pointer.
- **Shape:** gently rounded (12px), 40px tall, 18px side padding; large is 48px, 24px padding, 14px radius.
- **Primary:** deep-teal tint (rgba(108, 20, 26, 0.55)) fading to midnight, white 13px/500 text, cyan edge light.
- **Secondary:** amber edge light over a faint amber tint. Used for the alternate action in a pair (e.g. "Read the code" on the closing panel).
- **Ghost:** ice edge light over translucent glass slate. The quiet partner beside a primary.
- **Hover / Focus:** a conic arc of the edge color points toward the cursor and its intensity (--spec-i, idle 0.3) rises with proximity, with a blurred halo behind it and a soft radial hotspot inside; on hover the button rises 1px and a trailing icon nudges 3px right. Active presses to scale 0.98 in 80ms. Disabled is 40% opacity. Focus uses the global 2px cyan ring, 2px offset. On coarse pointers the edge rests at idle.

### Chips
- **Style:** 24px full pill, 11px/500 text, hairline border on translucent navy.
- **State:** status chips tint text and border to the state (Active cyan with a pulsing dot, Frozen and Defaulted red, Repaid green); "needs a human" and override chips are amber.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** vertical gradient from navy at 78% to #0a0f17 at 82%.
- **Shadow Strategy:** Panel shadow (see Elevation).
- **Border:** 1px hairline; iridescent edge on the hero panel only.
- **Internal Padding:** 16px, 20px from sm. A panel title row (15px/500 title, 12px muted note on the right) sits 16px above content. Inset wells inside panels are midnight at 40 to 50% with a hairline and 12px radius.

### Inputs / Fields
- **Style:** 44px tall, 10px radius, navy-to-midnight vertical gradient, 13px text (mono for addresses), muted placeholder, 40px left padding for a leading 18px search icon. The border is the iridescent edge on a wrapping element.
- **Focus:** the global 2px cyan ring.

### Navigation
- **Sidebar rail (app):** a sticky panel with the PrismCube mark and wordmark, primary items, then a "Sellers on file" group with a muted status note per item, and chain links at the foot. Items are 40px, 14px text at 82% white, 10px radius; hover fills glass slate at 60% and nudges the icon 2px. The active item turns cyan behind a single shared pill (cyan-to-navy-to-amber gradient, iridescent edge, cyan glow) that glides between items as a shared layout element (spring 420 / 38).
- **Mobile:** the rail becomes a compact header panel with a horizontally scrolling row of the same items and the same gliding pill.
- **Site nav (landing):** wordmark left, three 13px text links, and a primary "Ledger" button.

### Tabs
A segmented track (midnight 60%, hairline, 12px, 4px inset) of 38px tabs in muted 13px text with tabular counts. The active tab is white over a deep-teal pill with the iridescent edge and cyan glow, which slides between tabs as a shared element (spring 420 / 36).

### Alerts
A 10px-radius row with a 1px signal-tinted border, a horizontal gradient from the signal at 14% into midnight, and a matching inner glow.

### Lien Card (signature)
The lien as the page's main object: a title with status chip and metadata, a four-figure metric row (Advanced, Repaid in cyan, Still owed, Revenue routed), a cyan progress track, and an inset well showing where one payment goes, as a split bar: cyan-gradient pool segment then glass seller segment. When a repayment lands, a light (sweep-run, ice, 0.9s) crosses the pool segment and the figures count up and flash.

### Decision Entry (signature)
Verdict first: a 32px circular icon ringed and tinted by verdict kind, the action in its verdict color, agent name, a mono subject link, an amber "needs a human" chip when escalated, and the timestamp linking to the chain. Terms and risk follow in tabular 12px; the rationale clamps to two lines with a "Full reasoning" toggle that reveals mono flag tags. New entries settle down from 8px above.

### The Exchange Console (signature, landing)
A request/response console in the hero panel playing the real x402 exchange: mono lines that come into focus one by one (opacity 0.12 and 2px blur to sharp, 0.45s, 700ms apart), a decoded challenge in an inset well, then a split bar whose cyan and amber halves grow in turn. It replays on demand and on re-entry.

### Motion
- **Ease:** cubic-bezier(0.16, 1, 0.3, 1) for every authored transition.
- **Route change:** the new view settles from 10px below out of 5px blur and 35% opacity in 380ms.
- **Numbers:** count to the new value over 0.9s; on increase they flash from ice with a cyan glow over 1.2s.
- **Pills:** shared-layout springs (stiffness 420, damping 36 to 38).
- **Progress:** fills grow by scaleX over 0.9 to 1.1s, never by width.
- **Live dot:** a 2s pulse ring on Active status dots.
- **Reduced motion:** pulse, flash, sweep and the route settle switch off; the console shows its final state.

## Do's and Don'ts

### Do:
- **Do** keep cyan for flows toward the pool and system state, amber for the seller's share and human judgement (The Two Lights Rule).
- **Do** give exactly one panel per view the iridescent edge; everything else uses the 1px hairline.
- **Do** set every changing figure in tabular semibold and animate it with the shared count-up.
- **Do** use the single ease cubic-bezier(0.16, 1, 0.3, 1) and animate with transform, opacity and filter only.
- **Do** make active states a single shared pill that glides, rather than per-item highlights.
- **Do** step secondary text down by white opacity (85 / 75 / 70%) or muted.
- **Do** label testnet mocks and operator overrides in the UI text itself.

### Don't:
- **Don't** use JetBrains Mono for anything that isn't protocol or chain text.
- **Don't** set uppercase, letter-spaced eyebrows or kickers above headings.
- **Don't** use dark offset drop shadows to lift components; depth comes from glass, the edge and inner glow.
- **Don't** swap the edge gradient direction or use amber as a generic highlight.
- **Don't** introduce sharp (0px) corners or new grey hexes outside the neutral set.
- **Don't** animate width/height for progress; grow fills with scaleX.
