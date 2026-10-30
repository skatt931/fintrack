# Daybreak selected-image implementation

The user chose the first displayed generated image, unambiguously mapped by welcoming-options/options.json to 01-daybreak.png (853×1844). The app should faithfully match it, not merely adopt its palette. Target mobile viewport: 390×844. Reference density normalization: 390/853 ≈ 0.457, matching the reference height to 843.1 CSS pixels.

Visual requirements: Finance header; pale aqua/apricot grain; open Room for today allowance with smaller / day; payday and today's spending notes; sunrise/hills between allowance and metrics; unboxed two-column figures; separate warm Upcoming row; grounded labelled bottom navigation. Existing extra sections and review queue continue below the selected first-screen composition. Other screens inherit the welcoming material while retaining their own titles and behavior. Existing vanilla app/backend retained.

Asset catalog: portrait sunrise field and landscape adaptation, generated from the actual selected reference with all UI removed; standard Phosphor house/list/plus/calendar outline icons rather than custom approximations. Financial text stays editable. Existing brand mark retained outside the matching overview header.

QA scan before implementation:
- Data: report_amount remains authoritative; Category/Monthly Budget unchanged; checkbox strings and meaningful planned names still handled by existing logic. No schema changes.
- Cache: preserve cache/invalidation and authentication; bump CSS/app entry versions and SW cache together. First-run and error surfaces inherit the same light palette.
- Empty/single/many: preserve zeros, missing salary/payday dash, negative balances, one and 200 records. Large amounts must wrap/scale without clipping. Upcoming label uses item count, not a zero total.
- Mobile: 44px targets and >=16px editable fields; 375×400 keyboard editor retains visualViewport cap. Short devices scroll normally rather than shrinking the visual target's type.
- Navigation: Income/Expenses retain mode+period drill-downs; Upcoming remains reachable regardless of configured section visibility. Saved additional-section order remains unchanged. No auth scopes changed.

Implementation choices: current available-per-day calculation is labelled Room for today to match the selected image, not recalculated. The generated sample amounts are not hardcoded. On desktop the same visual system adapts to the existing wider canvas. The supplied visual overrides the prior dark-hero treatment, previous headline-size and icon-chip house rules where necessary for fidelity.

Verification: 42 in-app browser checks passed, all nine routes at phone/tablet/desktop sizes. Reference comparison and residual P3 differences are documented in root design-qa.md. Large figures wrap rather than truncating. Real account authorization, physical keyboard behavior and real-sheet writes remain manual checks; automated saves used an isolated fake backend. Shipped art uses compact WebP files, official icon license included. Entry and service worker version42.
