# Finance ledger redesign

Direction: Achromatic ledger, seed 54191518. Chosen over pastel consumer because the request prioritizes quiet space and financial readability. Two independent UX/UI advisors approved before implementation. Their conditions: retain Safe Limit and period controls, preserve configurable section order, keep risk signals, remove tinted emoji, ensure 44px controls and 16px fields, and test long values and keyboard space.

Face: cool blue-grey ledger ground, white panels, Geist with tabular figures, one blue chart series and neutral comparisons. The dealt Geist face is loaded; no font redraw. The existing three-destination navigation adapts to a desktop top bar and mobile bottom bar rather than adding unnecessary sidebar destinations. The dealt accounts-tree pattern is not applicable: this app stores transactions and salary periods, not account balances. Existing data-derived Safe Limit is its leading answer.

Idea: salary-cycle spending becomes a daily allowance ledger. Existing live controls switch billing/calendar scope, period and drill-downs; no sample numbers ship in the app.

Questions: Overview: how much can I safely spend each day? Records: which transactions explain the total? Spending/Merchants: where did the money go? Daily/Weekly: when did spending happen? Planned: which commitments are next? Add: record an expense or income. Settings: which sections do I want to see?

Inventory: CZK amounts; income/expense/transfer polarity; report_amount analytics; salary start dates; calendar month keys; category budgets; budget utilization; upcoming recurring commitments; reimbursements owed; review queue; merchant names; section ordering stored locally.

QA edge-case scan before implementation:
- Shape: Transactions uses report_amount, checkbox values may be strings or booleans; budgets use Category and Monthly Budget; planned formatting-only rows have no meaningful name. Presentation changes retain existing calculations/filtering.
- Cache: preserve 5-minute session cache and invalidation. No schema/scope changes. Sign-in, loading, empty and error surfaces share the new tokens. Bump service worker and entry-point asset versions together.
- Counts: check zero/single/200 records and long values. Keep honest zeros and missing-payday dash.
- Mobile: preserve visualViewport caps in transaction, planned and budget sheets; fields >=16px, touch targets >=44px, safe-area insets retained. Reduced viewport still scrolls.
- Drill-down: retain mode/period params and existing chart click handlers; test calendar-to-records navigation.
- Auth: no added permissions; real OAuth and real Sheets writes require the user's account/device check.

Implementation: existing vanilla ES modules, CSS and Chart.js retained. Shared tokens cleaned throughout, responsive overview section wrappers preserve source order without dense grid packing. Flat summary container, ordinary outgoing amounts in ink, risk red retained. Quiet navigation and forms, no gradients/glass/resting shadows. App mark drawn as a ledger monogram.

## Final browser verification

- 42 automated browser checks passed: all nine routes at 1440/768/390; no horizontal overflow; visible form fields >=16px; calendar drill-down scope; records search; transaction and budget sheets; 375x400 reduced viewport; mocked transaction append; empty states; 200 records; session/sign-in behavior; no uncaught app exceptions.
- Seven additional final checks passed: keyboard navigation into Records and its editor, reduced-height editor bounds, retained weekly category summaries, very large amounts, a single semantic title, and no uncaught exceptions.
- Syntax checks passed for all 20 application/service-worker JavaScript files. `git diff --check` clean.
- Final source lint: 0 FAIL. Warnings retained for real date zero-padding, missing-value dashes, and the Records scope label (which communicates calendar versus billing).
- Production is static ES modules with no build step. Inspections ran against the actual files served over HTTP.
- Final sign-in inspection: 0 FAIL at 1440/768/390. Centered narrow authentication form intentionally leaves space on desktop.
- Final populated overview inspection: 0 FAIL with one explicit allowance, `--allow covered-text`. The inspector scrolls the document rather than `.page-content`; it incorrectly hit-tests amounts below the scroll viewport against the fixed bottom navigation. Those amounts are clipped by the scroll container, and scroll normally into view. The original app shows the same finding. Browser screenshots and sheet bounds were checked independently. No content or selectors were hidden to affect inspection.
- Remaining overview warnings: optional configured sections continue below the fold; the one blue chart series covers only 0.1% of the first viewport; the summary's bottom action aligns with the adjacent merchant panel, leaving an intentional gap above that action. These preserve the requested spacing and full existing data rather than compressing the dashboard.
- Sample data existed only in a local test server: CSOB/Cash, Albert, Prague transport, Café Letka, home maintenance, a salary and internet bill. No fixture token, mocked fetch, or sample financial data is included in production.
- Real Google OAuth, real spreadsheet writes and physical iOS/Android keyboards require the user's manual check. Automated writes were intercepted locally; no live finance data was changed.

## Before / after measurements

| Measurement (same local fixture) | Before | After |
| --- | --- | --- |
| Inspector failures | 10 (includes requested new font comparison) | 0 with documented scroll-container allowance |
| Faces | Manrope, Fraunces, Arial | Geist |
| Leading figure desktop | 54px | 40px |
| Tiny text below 11px | 20 blocks | 0 |
| Heavy resting panel shadows | 4 | 0 |
| Gradient surfaces | 5 | 0 |
| First-screen blocks detected | 2 of 9 | 3 of 9 |

## Final critique

ROUND 3
Seen in one second: Finance overview, current salary/calendar period and safe daily allowance.
Idea (one sentence): Salary-cycle spending becomes a daily allowance ledger.
Live thing: Period controls and data-derived drill-downs.
Layout words by section: summary=one divided ledger / today=compact strip / spending+merchants=paired evidence / budgets=full-width category plan / charts+lists=ordered responsive panels.
Scores: design 7.5 · usability 8 · creativity 6.5 · content 8 → overall 7.5.
Caps applied: app-screen rubric; page imagery and motion floors do not apply. Known approach limits creativity; no claim of a novel finance concept.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. Desktop first fold only introduces the early configurable sections (`final-dashboard/desktop-fold.jpg`). Retained intentional scrolling rather than removing full content or collapsing user preferences.
2. A sparse account gives an elongated spending summary beside merchants (`final-dashboard/desktop-fold.jpg`). Final actions align at the bottom; no legend is pinned away from its chart.
3. Long merchant names truncate at tablet width (`final-dashboard/tablet-fold.jpg`). Full detail remains available through the existing merchant drill-down.

No photography, stock illustration, new library or external image credit is required for this working app interface. The original ledger SVG is the only new graphic; PNG install icons were rendered from it.

## Manual device check (under three minutes)

- Sign in and switch Billing Period / Calendar Month, then tap Expenses: the same period and mode appear in Records.
- Search a merchant and open a result: the matching records and editable transaction sheet appear.
- Tap a budget pencil and focus its amount: the field stays above the phone keyboard without iOS zoom; Cancel closes it.
- Add a small test expense: the saved transaction appears in Records and refreshed totals match your sheet; remove/correct the test entry as usual.
- Open a period without transactions: an honest empty state appears with no ghost planned rows or invalid figures.
- In Dashboard Settings, hide/reorder a section: Overview follows that order on phone and desktop. Reopen the installed PWA to confirm the new styling loads.
