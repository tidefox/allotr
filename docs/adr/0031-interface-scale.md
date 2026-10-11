# 0031. The interface renders at 100 % of the browser's default size

- Status: Accepted
- Date: 2026-10-11
- Amends: [0026](0026-visual-language-v3.md) ("Scale": the 85 % root)

## Context

ADR 0026 set the root to `font-size: 85%`, so every design size rendered at
85 % (about 11 px body text on desktop). After a visual review of the built
screens against the design mockup, the maintainer found the smaller scale
harder to read and wanted the screens to match the mockup's design sizes
one for one.

## Decision

The root is `font-size: 100%`. Every size stays in `rem`, taken from the
design px in docs/ui.md §2.3 divided by 16, so the rendered size equals the
design size and the user's own browser text size still applies. CSS `zoom`
stays forbidden.

## Consequences

- docs/ui.md §2.3 and `.agent/rules/ui.md` name the 100 % root.
- Interactive targets grow by about 18 %, so the WCAG 2.2 minimum target
  (24 × 24 CSS px) is easier to meet.
- Screens show less on one viewport, which matters most on phones; the
  phone sizes in docs/ui.md §2.3 still apply.
- Screenshot baselines are regenerated once.
