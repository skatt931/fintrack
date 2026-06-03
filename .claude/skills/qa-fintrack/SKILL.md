---
name: qa-fintrack
description: Verify Finance PWA changes actually work before claiming "done". MUST be invoked at the START of every feature/bugfix (to surface edge cases up front) and again BEFORE any "DONE" message (to run the preview browser, write a manual test plan, and produce an honest status report). Skip ONLY for pure internal refactors with zero user-visible effect.
---

You are running quality assurance for the Finance PWA. Read code is not enough — code must be **run** before being claimed done. This skill enforces that.

## When to invoke

- **Start of every feature or bug fix** — section 1 (edge-case scan) before writing any code
- **Before any "DONE" or "ready" message** — sections 2 and 3 (verification + reporting)
- **NEVER skip** because "the spec reviewer already approved" — spec review checks intent, not behaviour

## Project context

- Finance PWA at `/Users/ihor.kurnytskyi/My_projects/Claude/finance-pwa`
- Vanilla ES Modules, no build step, served from GitHub Pages
- Data backend: Google Sheets API (5 tabs documented in `SHEETS_SCHEMA.md`)
- Primary target: mobile PWA (iOS Safari, Android Chrome)
- Test the change as the user would experience it on a phone, not a desktop

---

## Section 1 — Edge-case scan (BEFORE you write code)

For every change, walk through these questions and write down concrete answers. If you can't answer one, you don't understand the change well enough to ship it yet.

### Data shape
- What does the data actually look like in the user's Google Sheet? Read `SHEETS_SCHEMA.md`
- **Sheets quirk**: columns with checkbox/dropdown formatting store the default value (`FALSE`, `planned`) on every formatted row even when the row is otherwise empty. `fetchRange` will return these as non-empty rows. Always filter by a meaningful field (e.g. `name`, `Category`) before iterating
- String vs boolean: sheet checkboxes come through as `'TRUE'`/`'FALSE'` strings, not booleans. Check both: `x === 'TRUE' || x === true`

### State and cache
- What does this look like on first load (no `sessionStorage` cache)?
- What does it look like after a write (cache is invalidated, next read goes to network)?
- What if the user opens the app BEFORE creating the sheet, then creates it mid-session? (Cache contains `headers: []` — must show "Refresh Data" hint, not break)

### Empty / single / many
- 0 items: does the empty state render correctly?
- 1 item: does any "X of N" or comma-joining logic produce a singular/plural correctly?
- 200 items: do all click handlers still register fast? Is scrolling smooth?

### Mobile / viewport
- Does the form fit in the visible area when the keyboard takes 40% of the screen?
- `.sheet-panel` has `max-height: 90vh` — that's 90% of the **full** screen, not the visible area above the keyboard. The `visualViewport` handler MUST also cap `panel.style.maxHeight = vv.height` or fields will overflow above the screen
- Does the search input have `font-size ≥ 1rem`? iOS auto-zooms on focus if it's smaller

### Drill-down navigation
- Does the source page pass `mode` (`billing` / `calendar`) when navigating to Records / Breakdown / Merchants?
- Records defaults `periodMode = 'billing'` — calendar-mode periods won't match without explicit `mode` parameter

### Permission / auth
- Does this require any new scope? (Currently `https://www.googleapis.com/auth/spreadsheets` covers all needs)
- Will the user need to re-grant if so?

---

## Section 2 — Run the change before claiming done

Spec compliance review = "code matches description". This = "behaviour matches expectation". Both are needed.

### Step 1: Sanity-check the syntax

```bash
node --check js/pages/<file-you-changed>.js
node --check js/api.js
```

Any syntax error = stop and fix before browser testing.

### Step 2: Launch the preview browser

Use the `mcp__Claude_Preview__preview_*` tools (or invoke the `verify` skill).

```
mcp__Claude_Preview__preview_start with the project URL or local path
mcp__Claude_Preview__preview_screenshot — take a baseline screenshot
```

If signing in is required and you can't complete OAuth in the preview, document that limitation and at minimum verify:
- The page loads without console errors
- The expected DOM elements render
- No CSS rules are unscoped (e.g. a generic `.toggle-track` that breaks other pages)

### Step 3: Simulate the user flow

For UI changes affecting forms or lists:

```
mcp__Claude_Preview__preview_resize → 375 × 667 (iPhone SE)
mcp__Claude_Preview__preview_click → the trigger button
mcp__Claude_Preview__preview_screenshot → confirm the sheet opens correctly
mcp__Claude_Preview__preview_fill → type into the first field
mcp__Claude_Preview__preview_screenshot → confirm fields are visible (NOT pushed above screen)
mcp__Claude_Preview__preview_resize → 375 × 400 (simulate keyboard taking ~250px)
mcp__Claude_Preview__preview_screenshot → confirm fields STILL visible with reduced viewport
```

For data-driven changes:

```
mcp__Claude_Preview__preview_eval → inject mock data via window.__test_data or by mocking fetch
mcp__Claude_Preview__preview_screenshot → confirm rendering matches expectation
```

### Step 4: Console + network check

```
mcp__Claude_Preview__preview_console_logs → must be empty (or only intentional logs)
mcp__Claude_Preview__preview_network → no failed requests
```

A red console error = not done.

---

## Section 3 — Manual test plan for the user

Even with browser automation, the user runs the real app against the real sheet on the real device. Write a short, concrete checklist they can run in under 3 minutes:

### Format

```markdown
## Manual test — [feature name]

Before pushing / after pulling, verify:

- [ ] [Specific UI action] → [expected visible result]
- [ ] [Edge case action] → [expected behaviour]
- [ ] [Mobile-specific test if applicable] → [expected]
```

### Rules

- **Concrete UI actions**, not abstract goals. "Tap the pencil icon on the Food card" not "test budget editing"
- **Expected visible result**, not just "should work". "The amount text changes to 5 000 Kč" not "saves correctly"
- **Cover the edge cases identified in Section 1**. If the feature has empty/full states, list both
- **Cover mobile-specific behaviour** if the feature has any form input. "Tap the Name field, type 'test', confirm field stays visible above keyboard"
- **3–6 items maximum**. Longer lists get skipped

### Always include for forms

- [ ] Open the form → all fields visible without scrolling on first frame
- [ ] Tap a text field → keyboard appears, field stays above the keyboard
- [ ] Type something → cursor stays in the field, no zoom occurs on iOS
- [ ] Save → returns to the previous page, new data is visible

### Always include for lists driven by Google Sheets

- [ ] First load (after refresh) → expected items show, no ghost rows
- [ ] No data state → empty-state message shows, no broken layout
- [ ] After write → list updates without needing manual refresh

---

## Section 4 — Honest status reporting

Status language must reflect what was actually done.

| Use this phrase | Means |
|---|---|
| "Code written, syntax-checked" | I edited files and they parse. Nothing was run. |
| "Implemented and code-reviewed" | Spec reviewer + quality reviewer signed off. Still nothing was run. |
| "Tested via preview browser" | I launched the preview, ran the user flow, screenshots confirm expected state. |
| "Ready for your manual test" | I've done my checks; here is the test plan for the device-specific bits I can't verify. |
| "DONE / verified working" | Only if all of the above + you confirmed manually. **I do not write this myself.** |

### Always include in the final message

1. **What changed** — files + commits
2. **What I verified** — preview browser steps that passed, or honest "no browser test possible because X"
3. **Manual test plan** — section 3 checklist
4. **Known limitations** — anything I couldn't test (e.g. "real Google Sheet behaviour with checkbox column formatting — please verify with your sheet")

### Phrases to avoid

- ❌ "Works correctly" (unless I literally ran it and watched it work)
- ❌ "Should work" (means I'm guessing)
- ❌ "Done" (with no test plan)
- ❌ "Tested" (without saying *how*)

---

## Common past failures — verify these every time

These have already bitten us. Re-check each one for any new UI/data change:

1. **Ghost rows from Sheets formatting** — filter list iteration by a meaningful field, not just non-empty row
2. **Sheet panel overflows above keyboard** — `panel.style.maxHeight = vv.height` in `visualViewport` handler
3. **iOS form zoom** — all `input` / `textarea` / `select` need `font-size ≥ 1rem`
4. **Drill-down loses mode** — every `navigate('transactions', ...)` must include `mode`
5. **Stale cache after sheet schema change** — bump `CACHE_KEY` in `api.js` when changing the data shape
6. **Empty headers crash** — if `xxxHeaders.length === 0`, show "Refresh Data" hint, never let the user save
7. **CSS class name collision** — when adding new CSS, scope class names to a parent (e.g. `.settings-page .toggle-track`, not bare `.toggle-track`)
8. **Service worker version bump missed** — every user-visible change requires `sw.js` cache version bump + matching `?v=` in `index.html`

---

## Quick reference — the bare minimum

For a small change:

```
1. Read Section 1, write 3 edge-case answers
2. Make the change, syntax-check the file
3. Launch preview, take a screenshot of the affected page
4. Write a 3-item test plan for the user
5. Send "Ready for your manual test" with the plan
```

For a bigger change (new page, new form): do all four sections in full.
