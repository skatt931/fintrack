# Finance PWA Design Refresh Refinement

**Goal:** Make the PWA easier to read, less visually generic, and more memorable without reducing feature depth or dumbing down the product.

**Working brief:** Keep the current product scope, but redesign the UI around stronger information hierarchy, calmer density, and a more distinctive finance-product personality.

---

## Why This Needs Refinement

The app already has strong functionality, but the current UI still feels heavier and more generic than the product deserves.

Current friction points:

- Too many similar dark surfaces compete for attention.
- The Dashboard exposes a lot of value, but not in a clear visual order.
- Cards, charts, filters, and pills often use similar weight, so priority is harder to scan quickly.
- The visual language is consistent enough to work, but not distinctive enough to feel like "this app".
- Data-heavy pages are functional, yet they read more like utility screens than a polished product.

---

## Design Intent

- Preserve the current feature set and drill-down behavior.
- Improve scanability before adding decoration.
- Give the app a recognisable personality through typography, spacing, color discipline, and component rhythm.
- Reduce visual noise, not product capability.
- Keep the experience mobile-first and PWA-native.

---

## Recommended Ticket Split

| Ticket | Scope | Story Points |
|---|---|---:|
| 0 | Visual direction lock | 2 |
| 1 | App shell + design system foundation | 5 |
| 2 | Dashboard information hierarchy redesign | 8 |
| 3 | Data-heavy page readability pass | 5 |
| 4 | Forms, sheets, and polish pass | 3 |

**Total:** 23 story points

This split keeps the highest-risk subjective work small at the start, then separates shared system changes from page-level redesign work.

---

## Ticket 0: Visual Direction Lock

**Story Points:** 2

**Problem**

If we jump straight into implementation, we risk spending time on CSS churn without agreeing on what "more personality" actually means in this product.

**Scope**

- Define 1 approved visual direction for the Finance PWA
- Lock typography direction
- Lock color strategy and contrast rules
- Lock card / surface philosophy
- Define 4-6 design principles that guide later tickets

**Deliverables**

- Short visual brief
- One preferred direction for Dashboard-first redesign
- Mini token guidance for typography, spacing, color, and surfaces

**Acceptance Criteria**

- Team agrees on one design direction before implementation starts
- Direction explicitly states what to avoid, not only what to add
- Direction is grounded in the current app, not a generic inspiration board

**Notes**

Recommended because the request is partly aesthetic and subjective. This ticket reduces rework in Tickets 1-4.

---

## Ticket 1: App Shell + Design System Foundation

**Story Points:** 5

**Problem**

The current shell and shared components create a uniform but flat visual experience. Too many surfaces feel equally important, and the system does not yet express a clear product identity.

**Scope**

- Refresh global design tokens in `css/app.css`
- Update typography scale, spacing rhythm, and surface hierarchy
- Restyle shared shell elements:
  - header
  - bottom navigation
  - buttons
  - chips / pills
  - cards
  - empty / loading / error states
  - bottom sheets / overlays

**Acceptance Criteria**

- The app uses a clearer typography hierarchy with better separation between labels, values, and section titles
- Shared components feel like one system instead of page-specific styling patches
- Surface hierarchy is reduced and easier to parse at a glance
- The visual identity feels more intentional and less template-like
- No navigation or functional regressions

**Primary Files Likely Affected**

- `css/app.css`
- `index.html`
- shared markup patterns across page renderers

---

## Ticket 2: Dashboard Information Hierarchy Redesign

**Story Points:** 8

**Problem**

The Dashboard contains the highest product value, but it currently asks the user to parse too many equally-loud blocks. The issue is not missing features; it is prioritisation and sequencing.

**Scope**

- Redesign the Overview page for faster scanning
- Re-rank the visual importance of:
  - summary cards
  - period controls
  - today strip
  - spent-in-period
  - merchants
  - budgets
  - charts
  - projected / planned sections if shown
- Introduce stronger section rhythm and more breathing room
- Reduce visual competition in the first viewport
- Keep existing drill-down actions intact

**Acceptance Criteria**

- The first screen communicates the current financial state more clearly within a few seconds
- The top viewport has a clear primary focus and secondary information order
- Dense sections feel easier to read without hiding product capability
- Dashboard sections feel visually related but not repetitive
- Existing navigation from cards, charts, and category drill-downs still works

**Primary Files Likely Affected**

- `js/pages/dashboard.js`
- `css/app.css`
- possibly `js/settings.js` if section treatment changes

**Why 8 Points**

This is the most valuable and highest-risk redesign area. It mixes visual decisions, content hierarchy, responsive layout work, and regression risk across many interactive elements.

---

## Ticket 3: Data-Heavy Page Readability Pass

**Story Points:** 5

**Problem**

Records, Breakdown, Merchants, Daily View, and similar pages are useful, but they currently read as dense utility screens. They need a cleaner reading rhythm and stronger hierarchy for repeated row content.

**Scope**

- Refresh page layouts for:
  - Records
  - Spending Breakdown
  - Merchants
  - Daily View
  - Planned page if included in current navigation flow
- Improve list row scanability
- Improve filter and search readability on narrow mobile widths
- Make totals, labels, amounts, and metadata easier to distinguish
- Align secondary pages with the new visual language from Tickets 0-2

**Acceptance Criteria**

- Repeated list items are easier to scan quickly
- Filters no longer dominate the page visually
- Amounts, dates, categories, and merchant names are easier to distinguish
- Breakdown and merchant pages feel consistent with the redesigned Dashboard
- Empty and low-data states feel intentional rather than leftover

**Primary Files Likely Affected**

- `js/pages/transactions.js`
- `js/pages/breakdown.js`
- `js/pages/merchants.js`
- `js/pages/daily.js`
- `js/pages/planned.js`
- `css/app.css`

---

## Ticket 4: Forms, Sheets, and Polish Pass

**Story Points:** 3

**Problem**

The form and overlay patterns work, but they do not yet carry enough personality or clarity. They should feel lighter, clearer, and more premium, especially on mobile.

**Scope**

- Refresh:
  - Add Transaction page
  - edit sheets
  - settings sheets
  - menu sheet
  - inline validation / feedback styling
- Improve touch target clarity and vertical rhythm
- Align form controls with the new system

**Acceptance Criteria**

- Forms feel easier to complete on mobile
- Overlays and sheets have a clearer hierarchy and stronger visual identity
- Validation and success feedback are easier to notice
- Styling is consistent with Tickets 1-3

**Primary Files Likely Affected**

- `js/pages/add.js`
- `js/pages/settings-page.js`
- `js/pages/transactions.js`
- `js/app.js`
- `css/app.css`

---

## Delivery Recommendation

**Recommended order:** 0 -> 1 -> 2 -> 3 -> 4

If we want a smaller first slice with maximum leverage, stop after Ticket 2 and demo that first. That gives us:

- approved personality direction
- shared visual foundation
- a materially better Dashboard

That first slice is **15 story points** and should already change how the product feels.

---

## Risks and Refinement Notes

- The biggest risk is subjective redesign churn if Ticket 0 is skipped.
- The Dashboard should not become "cleaner" by hiding useful finance insight.
- We should avoid introducing too many one-off page styles; the redesign should strengthen the system, not fragment it.
- Because this is a PWA, mobile viewport behavior, sticky elements, and bottom safe-area spacing must stay reliable.

---

## Definition of Done for the Epic

- The app feels more distinctive and less generic
- Readability is improved across the highest-traffic screens
- Shared UI patterns feel systemised, not patched
- Feature depth remains intact
- Mobile-first PWA usability is preserved
