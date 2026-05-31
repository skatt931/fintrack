# Finance PWA — Feature Reference

> **Source of truth.** This document is the authoritative record of everything the app does.
> Keep it in sync with every meaningful change: new features, behaviour changes, UI layout updates, removed functionality.
> The Excalidraw architecture diagram (`finance-pwa-architecture.excalidraw`) is a snapshot — it is only redrawn on explicit request and should not be treated as current.

Personal finance tracker backed by Google Sheets. PWA (installable, offline-capable).

---

## Authentication

- Sign in with Google (OAuth 2.0 / Google Identity Services)
- Token stored in `sessionStorage` — not persisted across browser sessions
- Auto-refresh: token renewed 60 s before expiry; prompts re-auth if refresh fails
- Sign-out via menu (⋮) button — clears token and data cache, returns to sign-in screen

---

## Data Source

- Google Sheets backend — three sheets: **Transactions**, **Budgets**, **Salary Periods**
- 5-minute session cache minimises API calls; survives tab navigation
- Cache auto-invalidates after any write (add or edit)
- Manual refresh button on Overview forces full reload
- Cell-level updates via Sheets API v4 (`batchUpdate`)
- Formula columns (`month`, `billing_period`, `report_amount`) are never overwritten — computed by the sheet

---

## Navigation

Five pages accessible via the bottom tab bar:

| Tab | Page |
|-----|------|
| Overview | Dashboard |
| Records | Transaction list |
| Add | New transaction form |
| Spending | Category breakdown |
| Merchants | Merchant breakdown |

Daily View is accessible by:
- Tapping any date header in the Records list
- Tapping the **Today strip** on the Overview dashboard

Breakdown and Merchants pages are also reachable by drilling down from Overview cards.

---

## Overview (Dashboard)

### Summary Cards
- **Income** — total income for the period; tap to open Records filtered to income only
- **Expenses** — total expenses; tap to open Records filtered to expenses only
- **Balance** — income minus expenses (green if positive, red if negative)
- **Savings Rate** — `(income − expenses) / income × 100 %`

### Period Controls
- Toggle between **Billing Period** (salary-cycle based) and **Calendar Month**
- Previous / Next navigation buttons to browse historical periods
- Billing period boundaries derived from the Salary Periods sheet

### Spent in Period Card
- Shows total amount spent in the current **billing period** (always billing mode, not calendar)
- Segmented colour bar: top 9 categories proportionally coloured
- "N categories" count; tap opens the Spending breakdown page

### By Merchant Card
- Shows top 4 merchants by spend in the current billing period
- "+N more" when more than 4 merchants exist; tap opens the Merchants page

### Budget vs Actual
- 2-column grid of budget cards, one per category
- Each card: category emoji, name, amount spent, budget limit ("of X Kč"), progress bar
- Progress bar colours: green (≤ 80 %), yellow (80–100 %), red (over budget)
- Period-elapsed indicator: % of billing period elapsed shown next to section title
- Tap any card → Records filtered to that category + period

### Spending Breakdown Donut Chart
- Top 9 expense categories with colour-coded segments and legend
- Tap a chart slice → Records filtered to that category

### Spending Trend Chart
- Bar chart of total monthly expenses for the last 6 months (calendar months, always)
- Labels formatted as "Apr '26"

### vs Previous Period
- Table comparing each category's spend: current vs previous period
- ↑ / ↓ / = badge with % change; red = spending more, green = spending less, grey = new

### Weekly & Day Breakdown _(collapsible)_
- **By Week**: bar chart of spending per calendar week within the current period; tap a bar → Records filtered to that week
- **By Day of Week**: average spend per weekday (Mon–Sun) across all transactions in the period
- Charts render lazily when section is expanded; destroyed on collapse to free memory

### Recurring Expenses
- Categories that appear in ≥ 2 distinct periods
- Shows average amount and "× N periods" frequency badge
- Sorted by average amount descending, capped at 8 entries

### Needs Review Banner
- Shown when ≥ 1 transaction has `needs_review = TRUE`
- Displays count; tap opens Records (no auto-filter applied)

---

## Records (Transaction List)

### Filters
- **Search** — real-time, matches category, bank, merchant, and all other fields
- **Period dropdown** — select any available billing period or calendar month
- **Category dropdown** — filter to a single category
- **Week pills** — shown when the period contains multiple weeks; filter by Week 1–5
- **Active filter chips** — dismissible chips for direction ("Income only" / "Expenses only"), category, and merchant filters applied from drill-down navigation

### Sort
- **Sort toggle button** — switches between **New→Old** (default) and **Old→New**
- Handles mixed date formats from the sheet (DD/MM/YYYY, YYYY-MM-DD, ISO datetime)

### Transaction Rows
- Category emoji badge (tinted background)
- Category name and amount (+ green for income, − red for expenses)
- Bank / source name
- Merchant name (if the sheet has a Merchant column)
- "Review" badge for flagged transactions

### Date Grouping
- Transactions grouped under date headers (e.g., "Mon, 01 Jan")
- Groups sorted in the same direction as the active sort

### Edit Sheet (tap any transaction)
- Bottom sheet slides up; repositions above the virtual keyboard automatically (using `visualViewport` API)
- Focused text fields scroll into view when keyboard appears
- **Editable fields:**
  - Category — dropdown of all known categories
  - Merchant — text input (shown only if sheet has a Merchant column)
  - User Comment — textarea (shown only if sheet has a comment/note column)
  - Needs Review — toggle switch (Yes / No)
- **Read-only display:** all other transaction fields shown as key–value pairs
- Save writes only changed cells back to the sheet; cache is invalidated on success

---

## Daily View

- Shows all **expense** transactions for a single calendar day
- Accessed by tapping a date header in Records, or the Today strip on Overview
- **Date navigation** — ← → buttons step through every calendar day (including days with no transactions)
- **Header** — total expenses for the day + up to 3 category emoji chips (only shown when transactions exist)
- **Empty state** — "Nothing spent on this day." shown for days with no expense transactions
- **Transaction rows** — same style as Records; tap any row to open the edit bottom sheet
- Future dates disabled in the → navigation button

### Today Strip (Overview Dashboard)

- Compact strip below the Summary Cards on the Dashboard
- Shows today's date, total expenses today, and top category emojis
- Tapping opens the Daily View for today
- Shows "Nothing spent" when no expense transactions exist for today

---

## Add Transaction

- **Type toggle** — Expense / Income (changes amount input styling)
- **Amount** — large number input, auto-focused on page load; CZK currency
- **Category** — dropdown from Budgets sheet (budgeted + unbudgeted categories)
- **Bank / Source** — text input with autocomplete datalist from historical banks
- **Date** — date picker, defaults to today
- **Note** — optional text for merchant name or comment; auto-mapped to the first available note-type column in the sheet (merchant, comment, note, etc.)
- **Validation** — amount > 0, category selected, bank filled, date set; inline error messages
- **Submission** — appends a new row; formula columns left blank for the sheet to compute; navigates to Records after success; cache is cleared

---

## Spending Breakdown

- Reached by tapping the Spent in Period card or the Spending tab
- Period and mode passed from caller context
- Header: period title, total spent, category count, segmented colour bar
- Sorted list of all expense categories with: emoji badge, name, amount, % of total, progress bar
- Tap any row → Records filtered to that category + period

---

## Merchants

- Reached by tapping the By Merchant card or the Merchants tab
- Period and mode passed from caller context
- Header: period title, total spent, merchant count
- Sorted list of all merchants with: emoji badge (inferred from merchant name), name, amount, % of total, progress bar
- Tap any row → Records filtered to that merchant + period
- Empty state message prompts adding a Merchant column to the sheet if none exists

---

## Category Icons

- Every category name and merchant name is matched to an emoji using keyword patterns
- Covers 100 + patterns in both English and Czech
- Word-boundary matching prevents false positives (e.g., "Business" does not get a bus emoji)
- Each category group also gets a distinct tinted background colour for its badge
- Used across: transaction rows, budget cards, breakdown pages, merchant pages

---

## Currency & Localisation

- All amounts displayed in **Czech Koruna (Kč)** using `cs-CZ` locale formatting (space thousands separator)
- Period labels: "April 2026" in full headers, "Apr '26" in chart axis labels
- Date display: "Mon, 01 Jan" in list headers, "01 Jan 2026" in edit sheet

---

## PWA & Offline

- Installable on iOS and Android via browser "Add to Home Screen"
- Service Worker with network-first strategy: always fetches fresh, caches response, falls back to cache when offline
- Safe-area support for iOS home indicator and Dynamic Island (top header only)
- `sessionStorage` for auth token and data cache — cleared when the browser session ends
