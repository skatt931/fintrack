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
- Sign-out via the ⋮ menu → action sheet → **Sign Out**

---

## Data Source

- Google Sheets backend — three sheets: **Transactions**, **Budgets**, **Salary Periods**
- 5-minute session cache minimises API calls; survives tab navigation
- Cache auto-invalidates after any write (add or edit)
- Manual **Refresh Data** option in the ⋮ menu forces full reload
- Cell-level updates via Sheets API v4 (`batchUpdate`)
- Formula columns (`month`, `billing_period`, `report_amount`, `linked_reimbursement_total`, `reimbursement_status`) are never overwritten — computed by the sheet

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

Additional pages (not in tab bar):
- **Daily View** — accessed by tapping any date header in Records, or the Today strip on the Dashboard
- **Dashboard Settings** — accessed via ⋮ menu → Dashboard Settings

Breakdown and Merchants pages are also reachable by drilling down from Overview cards.

### Menu (⋮ button)

Opens an action sheet with three options:
- **Dashboard Settings** — configure which sections are visible and their order
- **Refresh Data** — clears cache and reloads all data from Google Sheets
- **Sign Out** — clears token and cache, returns to sign-in screen

---

## Overview (Dashboard)

### Summary Cards

Four cards always shown at the top:

- **Income** — total income for the period; tap to open Records filtered to income only
- **Expenses** — total expenses; tap to open Records filtered to expenses only
- **Balance** — income minus expenses (green if positive, red if negative)
- **Safe Limit** — daily spending limit = `balance ÷ days until next payday`; sub-label shows "payday in N days"; shows `—` if balance is negative or no future payday found

### Period Controls
- Toggle between **Billing Period** (salary-cycle based) and **Calendar Month**
- Previous / Next navigation buttons to browse historical periods
- Billing period boundaries derived from the Salary Periods sheet

### Today Strip
- Compact strip below the Summary Cards
- Shows today's date, total expenses for today, and top category emojis
- Tapping opens the Daily View for today
- Shows "Nothing spent" when no expense transactions exist for today

### Spent in Period Card
- Shows total amount spent in the **currently selected period and mode**
- Segmented colour bar: top 9 categories proportionally coloured
- "N categories" count; tap opens the Spending Breakdown page for the same period/mode

### By Merchant Card
- Shows top 4 merchants by spend in the **currently selected period and mode**
- "+N more" when more than 4 merchants exist; tap opens the Merchants page for the same period/mode

### Budget vs Actual
- 2-column grid of budget cards, one per category
- Each card: category emoji, name, amount spent, budget limit ("of X Kč"), progress bar
- Progress bar colours: green (≤ 80 %), yellow (80–100 %), red (over budget)
- Period-elapsed indicator: % of billing period elapsed shown next to section title
- Tap any card → Records filtered to that category + period
- **Pencil icon** (top-right of each card) → opens budget edit sheet
  - Set or change the monthly budget amount for any category
  - Categories with no budget row yet: saving appends a new row to the Budgets sheet
  - **Remove budget** button clears the budget value (only shown when a budget exists)

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

### Owes You
- Shows all open reimbursement debts — transactions where `link_role = original_expense` and `reimbursement_status ≠ Settled`
- Per entry: person name (from merchant/description/comment field), outstanding amount, status badge (Waiting / Partial)
- Outstanding = `expected_reimbursement − linked_reimbursement_total`
- Tap any entry → Records searched by that person's name

### Planned Expenses (Dashboard section)
- Configurable section on the Dashboard (can be hidden in Dashboard Settings)
- Shows up to 5 upcoming planned expenses due before the next payday
- Displays total upcoming amount and **Projected Balance** (current balance − upcoming total)
- Tapping the card opens the Planned Expenses management page

### Needs Review Banner
- Shown when ≥ 1 transaction has `needs_review = TRUE`
- Displays count; tap opens Records (no auto-filter applied)

### Dashboard Settings
- All sections except Summary Cards and Needs Review Banner are configurable
- Access via ⋮ menu → Dashboard Settings
- Toggle sections on/off and reorder them using ↑ ↓ arrows
- Settings persisted in `localStorage` — survive app restarts
- Reset to defaults button restores original order and visibility

---

## Records (Transaction List)

### Period Mode Toggle
- **Billing / Month** pill toggle at the top — switches between billing-period and calendar-month grouping
- Switching mode resets the period dropdown to the current period in the new mode

### Filters
- **Search** — real-time, matches category, bank, merchant, and all other fields; pre-filled when navigating from search-based drill-downs
- **Period dropdown** — select any available billing period or calendar month (list changes with mode)
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
- Transactions grouped under date headers (e.g., "Mon, 01 Jan →")
- Groups sorted in the same direction as the active sort
- **Tapping a date header navigates to the Daily View for that date**

### Edit Sheet (tap any transaction)
- Bottom sheet slides up; repositions above the virtual keyboard automatically (using `visualViewport` API)
- Focused text fields scroll into view when keyboard appears
- **Editable fields:**
  - Category — dropdown of all known categories
  - Merchant — text input (shown only if sheet has a Merchant column)
  - User Comment — textarea (shown only if sheet has a comment/note column)
  - Needs Review — toggle switch (Yes / No)
  - **Debt / Reimbursement** — see below
- **Read-only display:** all other transaction fields shown as key–value pairs
- Save writes only changed cells back to the sheet; cache is invalidated on success

#### Debt / Reimbursement (in Edit Sheet)

A dedicated section at the bottom of the edit sheet with three role options:

| Role | Description | Fields written |
|------|-------------|---------------|
| **Normal** | No debt relationship | Clears `link_role`, `linked_group_id`, `expected_reimbursement` |
| **Debt** (I expect money back) | Marks this as an `original_expense` | `link_role = original_expense`, `linked_group_id` (auto-generated `DEBT-YYYYMMDD-XXXX`), `expected_reimbursement` (editable amount) |
| **Reimbursement** (money received) | Links this income to an existing debt | `link_role = reimbursement`, `linked_group_id` (dropdown of open debts or manual ID entry) |

`reimbursement_status` and `linked_reimbursement_total` are auto-computed by the sheet and never written by the app.

---

## Daily View

- Shows all **expense** transactions for a single calendar day
- Accessed by tapping a date header in Records, or the Today strip on Overview
- **Date navigation** — ← → buttons step through every calendar day (including days with no transactions)
- **Header** — total expenses for the day + up to 3 category emoji chips (only shown when transactions exist)
- **Empty state** — "Nothing spent on this day." shown for days with no expense transactions
- **Transaction rows** — same style as Records; tap any row to open the edit bottom sheet
- Future dates and today's date are disabled in the → navigation button (no forward navigation past today)

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
- Period and mode passed from caller context (follows Dashboard's selected mode)
- Header: period title, total spent, category count, segmented colour bar
- Sorted list of all expense categories with: emoji badge, name, amount, % of total, progress bar
- Tap any row → Records filtered to that category + period, same mode

---

## Merchants

- Reached by tapping the By Merchant card or the Merchants tab
- Period and mode passed from caller context (follows Dashboard's selected mode)
- Header: period title, total spent, merchant count
- Sorted list of all merchants with: emoji badge (inferred from merchant name), name, amount, % of total, progress bar
- Tap any row → Records filtered to that merchant + period, same mode
- Empty state message prompts adding a Merchant column to the sheet if none exists

---

## Planned Expenses

- Manage upcoming committed bills and planned purchases
- Accessible via the Dashboard section tap or ⋮ menu → Planned Expenses
- Data stored in the **Planned Expenses** Google Sheets tab (pure data, no formulas)

### Item types
- **One-time** — a specific future purchase or bill; moves to Paid once marked paid
- **Recurring** — monthly/quarterly/yearly items (e.g. subscriptions, rent); always visible in the Recurring section; "Mark as paid" records the current-period payment without removing the item

### Sections on the management page
- **Upcoming** — due before the next payday and not yet paid this period
- **Recurring** — all recurring items; shows "✓ Paid" badge when paid this billing period
- **Later** — one-time items due after the next payday
- **Paid** — completed one-time items
- **Cancelled** — collapsed at the bottom

### Add / Edit
- Fields: Name, Amount (Kč), Category, Due date, Recurring toggle, Recurring period (monthly/quarterly/yearly when recurring on), Notes, Status (edit only)
- Save writes directly to the Planned Expenses Google Sheet

### Mark as paid
- **One-time**: sets `status = paid` in the sheet; item moves to Paid section
- **Recurring**: writes `last_paid_date = today`; item stays active and resets automatically next billing period

### Projected Balance
- Shown on the Dashboard planned section
- Formula: current period Balance − sum of unpaid upcoming planned amounts

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
- **Auto-update**: when a new version is deployed, the app detects the updated Service Worker, activates it immediately, and reloads automatically — no manual incognito/re-install needed
- Safe-area support for iOS home indicator and Dynamic Island (top header + nav bar background)
- `sessionStorage` for auth token and data cache — cleared when the browser session ends
