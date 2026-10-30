# Tidal light — grainy gradients / digital atmospheres

## Direction and validation before implementation

User feedback: the ledger became too flat. Explicit request: Grainy Gradients / Digital Atmospheres, retaining the prior advisor → implementation → browser testing → GitHub deployment workflow.

Both independent advisors approved Tidal light before implementation. UX conditions: visibly atmospheric Safe Limit and sign-in; opaque KPI strip and data surfaces; preserve 24px spacing, section order, navigation, risk signals, and keyboard behavior. UI conditions: dark marine anchors white text; cobalt/aqua and one small peach rim sit away from labels; static fine grain; mobile-specific crops. Neither advisor requested additional user approval.

The design-taste-frontend app draw offered achromatic-ledger and pastel-consumer. Pastel consumer, seed 1584374533, is the closer material starting point; existing Geist and layout are retained. Its gradient restriction and colour-share budget conflict with the user's explicit chosen style and are deliberately overridden. This also supersedes the prior ledger's ban on coloured atmosphere. The rest of the app-screen rules remain: hierarchy, real data, quiet controls, no glass, readable contrast, responsive layout, real actions, no decorative entrances or rainbow charts. Existing 8px data panels are retained per both advisors; atmosphere is a single shared material, not category-coloured panels.

Idea: the salary cycle's daily allowance becomes a horizon of grainy light, while the underlying ledger stays precise. Safe Limit remains the dominant answer to “How much can I spend per day?” The existing period switches and drill-downs remain the live controls. All nine screens keep their existing jobs and data scope.

Material: static procedural SVG grain over CSS colour fields. Palette: marine #102e43, blue #265b9b, aquamarine #62b8b1, one restrained peach #edb99c. A pale atmospheric canvas carries the style through Records, Spending, Merchants, Daily, Weekly, Planned, Add, Settings. No downloaded or generated stock imagery is required.

## QA edge-case scan before code

1. Data shape: preserve report_amount, CZK formatting, Category/Monthly Budget, TRUE/FALSE checkbox handling and meaningful-name filtering for planned formatting artefacts. No data/schema changes.
2. State/cache: same first-run sign-in, cached data, refresh and post-write invalidation. Empty headers remain the existing refresh/setup state. Bump entry points and service worker together; no data cache version change needed.
3. Empty/single/many: test empty accounts, one transaction, 200 records, no income/no payday, negative balances, long merchant names and large CZK amounts. The decorative colour must not act as a financial status signal.
4. Mobile: maintain >=16px inputs, >=44px buttons and visualViewport sheet caps; test 375x400 keyboard viewport. Static grain receives no pointer events and sits behind text; controls never inherit grain.
5. Drill-down: retain mode and period parameters, calendar/billing filters and saved section order. No auth scope changes or new network/data services.

## Implementation plan

- Record the existing app at 1440, 768 and 390.
- Add one isolated theme stylesheet and a locally authored, static SVG grain tile. Avoid changes to business logic and layout.
- Apply strong atmosphere to sign-in and allowance; place the existing KPI strip on opaque white. Carry gentler fields across the shell and secondary headers.
- Update FEATURES.md, PWA colours and asset/cache version together.
- Inspect real-browser screenshots and contrast, verify all routes and edge states using isolated local fixtures, review with advisors, then publish the exact tested commit to GitHub Pages and verify public assets.

## Clarification: enjoyable and easy to navigate

The user emphasized a pleasant place to visit, not merely a finance utility, while keeping important information easy to find. Both advisors separately approved a discoverability refinement: a real 44px Upcoming button beside daily allowance context, using the existing upcomingPlannedTotal. It opens Planned even if the optional dashboard section is hidden. Empty text is determined by upcoming-item count so a zero-valued item is not mislabeled empty; its current until-payday scope remains independent of historical period selection. A regression check was run before implementation and failed on the missing shortcut, then rerun after implementation.

First visual critique: the atmospheric material is clearly visible at desktop and phone widths. Advisors identified white period text crossing the peach edge; the date now has opaque marine backing. Hover styling is limited to clickable KPI cells. No other blocking visual issues were found.

## Final QA and critique

- 42 route/workflow browser checks passed: all nine screens at 1440/768/390, data-bearing layouts, >=16px visible fields, no horizontal overflow, calendar drill-down propagation, search, transaction/budget editors, 375x400 reduced keyboard viewport, mocked append, empty states, 200 rows, cached authentication and first-run sign-in.
- Seven final keyboard/large-amount checks passed. Ten targeted atmospheric/Upcoming checks passed, including missing payday, no income, negative balance, one transaction, reduced motion/static grain, hidden Planned section, no upcoming items, and zero-value upcoming item.
- The short-phone check initially caught the summary bottom at 610px below the nav's 594px top. Targeted short-screen spacing corrected it to 586px, retaining 44px actions and normal-sized figures. Menu/Settings/toggle navigation passed without exceptions.
- All 20 JavaScript syntax checks passed. `git diff --check` clean. Source lint for the theme, base CSS, index and dashboard: 0 FAIL / 0 WARN, with each requested gradient explicitly annotated using the linter's supported exception comment.
- App inspector: 0 FAIL at 1440/768/390 with `--allow gradient,covered-text`. Gradient is the user's explicit direction. Covered-text is the same documented scroll-container hit-test issue as the previous app: document scrolling does not reflect the inner `.page-content` scroll viewport. Independent screenshots and viewport geometry were checked; no content was hidden to influence the meter.
- Sign-in inspector: 0 FAIL at all widths with `--allow gradient`. Colour-share and wide-art-field warnings are deliberate consequences of the requested atmosphere. The dark text-bearing region stays distinct from the bright light field.
- Remaining populated-overview warnings are inherited: optional sections continue below the fold; a summary card pins its real navigation action level with the merchant card. No new tiny text, typography, overflow, heavy shadows, glass or contrast warning was reported.
- Both advisors approved the implemented desktop/tablet/mobile views after the opaque marine date backing. Final UX review confirmed all primary figures visible at 375x667 and useful Upcoming discoverability.
- Local fixtures only: CSOB/Cash, salary, Albert, Prague transport, Café Letka, home maintenance and an Internet commitment. No fixture numbers, authentication bypass, or mock network handler ship in the app. No live sheet was written.
- Real Google OAuth, live Google Sheets save/refresh and native device keyboards remain the user's manual check. Browser reduced-height tests do not prove physical iOS keyboard behavior.

ROUND 2
Seen in one second: Finance, a daily allowance in grainy marine light, and four clear financial figures on white.
Idea (one sentence): Salary-cycle allowance becomes a horizon of grainy light above a precise ledger.
Live thing: Period scope, contextual Upcoming shortcut, and data drill-downs.
Layout words by section: atmosphere=continuous colour field / allowance=dark focal region / KPIs=opaque divided strip / working data=white paired panels / mobile context=compact two-line grid.
Scores: design 8 · usability 8 · creativity 7 · content 8 → overall 7.8.
Caps applied: app-screen rubric; page imagery/motion floors do not apply; gradients deliberately requested rather than banned.
Top three problems, in visible order:
1. White date text crossed the peach field (first after/desktop-fold.jpg). Fixed with opaque marine date backing in final/desktop-fold.jpg.
2. Four main figures extended below the short-phone navigation (first 375x667 geometry check). Fixed with short-screen spacing; small-phone.jpg shows the full primary summary.
3. Optional analysis sections remain below the first fold (final/desktop-fold.jpg). Preserved for readable density and existing saved order; Upcoming now makes commitments accessible immediately.

No stock image credits or replacements are needed. The tiny procedural SVG is original code-native artwork, static in use; no asset-generation service or new dependency was introduced. Install icons retain the existing neutral mark.

## Manual device test

- Sign in and refresh: real transactions appear without ghost rows; the new grainy atmosphere is visible.
- Tap Upcoming: Planned opens and the commitment total matches the existing Upcoming group. With no items, the shortcut reads “No upcoming expenses”.
- On a small phone, check Overview: Safe limit, Income, Expenses, Balance and Savings remain readable; the primary figures sit above bottom navigation.
- Switch Calendar Month and tap Expenses: Records retains the selected period and mode; search still narrows the list.
- Open a budget editor, focus and type in its amount: the field stays above the keyboard without iOS zoom, then Cancel closes it.
- Open Add, enter your next expense and save: fields remain usable, the transaction appears, and refreshed totals reflect the sheet.
