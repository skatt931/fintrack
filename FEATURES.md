# Finance PWA — Feature Reference

> **Source of truth.** This document is the authoritative record of everything the app does.
> Keep it in sync with every meaningful change: new features, behaviour changes, UI layout updates, removed functionality.
> The Excalidraw architecture diagram (`finance-pwa-architecture.excalidraw`) is a snapshot — it is only redrawn on explicit request and should not be treated as current.

Personal finance tracker backed by Google Sheets. PWA (installable, offline-capable).
The product includes a broader automation layer built in n8n: transaction ingestion from Gmail, Telegram bot commands for finance operations, and Telegram-delivered summaries with AI commentary.

---

## Product Scope

- The PWA is the main interface for browsing, editing, and analyzing finance data stored in Google Sheets.
- n8n workflows automate ingestion, classification follow-up, Telegram bot interactions, and report delivery.
- Google Sheets is the system of record shared by both the PWA and n8n workflows.
- Telegram is part of the product surface, not a separate side tool: it is used for category confirmation, manual cash entry, and report delivery.

---

## Authentication

- Sign in with Google (OAuth 2.0 / Google Identity Services)
- Token stored in `sessionStorage` — not persisted across browser sessions
- Auto-refresh: token renewed 60 s before expiry; prompts re-auth if refresh fails
- Sign-out via the ⋮ menu → action sheet → **Sign Out**
- Sign-in screen uses the same light, editorial-style visual system as the main app shell

---

## Visual Design

- Predominantly light theme with warm paper-toned backgrounds and dark text
- Shared typography system:
  - display headings use a serif face for product identity
  - operational text uses a clean sans-serif face for data readability
- App shell uses elevated rounded surfaces for header, navigation, cards, sheets, and form controls
- Sign-in screen now uses a custom illustrated brand mark instead of a generic chart icon
- PWA browser chrome / install chrome uses a matching light `theme_color`

---

## Data Source

- Google Sheets backend — four main sheets used by the product: **Transactions**, **Budgets**, **Salary Periods**, **Planned Expenses**
- 5-minute session cache minimises API calls; survives tab navigation
- Cache auto-invalidates after any write (add or edit)
- Manual **Refresh Data** option in the ⋮ menu forces full reload
- Cell-level updates via Sheets API v4 (`batchUpdate`)
- Formula columns (`month`, `billing_period`, `report_amount`, `linked_reimbursement_total`, `reimbursement_status`) are never overwritten — computed by the sheet

### n8n ingestion into the sheet

- A workflow named **Finance Collector** scans Gmail for finance-related messages and writes parsed transactions into the **Transactions** sheet
- Scan cadence: hourly during the day (`0 9-23 * * *`)
- Gmail source filter:
  - Reads up to 30 messages
  - Only messages from the previous 24 hours
  - Only messages carrying a dedicated Gmail label (`Label_14`)
- Duplicate protection:
  - Existing `email_id` values are loaded from the sheet
  - Incoming emails with an already-seen Gmail message ID are skipped
- Some known non-transaction subjects are ignored before AI parsing, including:
  - `click to pay`
  - `apple pay`
  - `bankovní identita`
  - `confirmation of apple pay activation`
  - `your card is ready`
  - `registration`
- Czech bank emails are parsed through an AI prompt that extracts:
  - `email_id`, `date`, `bank`, `direction`, `amount`, `currency`, `merchant`, `category`, `description`, `confidence`
  - `source_subject`, `source_from`, `source_date`, `raw_snippet`
- Parsed rows are appended to the **Transactions** sheet with review metadata
- Auto-review rules in the workflow:
  - `needs_review = true` when confidence is below `0.8`
  - `needs_review = true` when category is `unknown`
  - `needs_review = true` when amount is `>= 1000`

---

## Automation Layer

### Finance Collector

- Primary ingestion workflow for bank email notifications
- Reads Gmail, filters duplicates and ignored subjects, sends the content to an AI parser, and appends valid transactions to Google Sheets
- Only rows classified as `is_transaction = true` are written
- After saving a row that still needs human confirmation, the workflow sends a Telegram message with category buttons for quick cleanup

### Telegram Finance Bot

- A workflow named **Finance Telegram Router - merged fixed** handles incoming Telegram messages and callback buttons
- Supports both regular bot messages and callback queries from inline keyboards
- Works against the same **Transactions** sheet as the PWA

#### Category confirmation from Telegram

- When the Finance Collector flags or posts a new transaction to Telegram, the bot offers category buttons such as:
  - Groceries
  - Restaurants
  - Transport
  - Shopping
  - Subscriptions
  - Debt
  - Entertainment
  - Travel
  - Dog
  - Photography
  - Other
  - Delivery
- Tapping a category button updates the matching transaction row by `email_id`
- The bot also sets:
  - `needs_review = false`
  - `review_reason = manual_category`
- After the update, the Telegram message is edited in place to confirm the new category

#### Manual cash entry from Telegram

- The bot supports manual cash-style expense capture via the `/cash` command
- The command accepts an amount plus optional free-text description
- After receiving `/cash`, the bot replies with a category picker
- Selecting a cash category appends a new expense row to the **Transactions** sheet with:
  - synthetic `email_id` in the form `cash_<timestamp>`
  - `bank = cash`
  - `direction = expense`
  - `currency = CZK`
  - `merchant = cash description`
  - `source_subject = Manual cash entry`
- After save, the Telegram message is edited to confirm the saved cash transaction

#### Telegram finance summaries

- The Telegram router builds on-demand summaries from the **Transactions** sheet
- Supported report modes visible in the workflow:
  - daily summary
  - weekly summary
  - monthly summary
- Weekly and monthly reports:
  - load rows from the Transactions sheet
  - ignore rows where `exclude_from_reports = true`
  - ignore transfers
  - calculate expense, income, balance, transaction count, and top categories
- Daily summaries also list same-day transactions and category totals
- Weekly and monthly summaries call an AI model to generate additional Ukrainian commentary
- The AI commentary is intentionally constrained to:
  - use Telegram-friendly emoji structure
  - avoid markdown formatting
  - avoid suggesting cuts to fixed / obligatory costs such as housing, rent, utilities, subscriptions, or loan payments
  - focus optimization suggestions on discretionary spending

### Scheduled Telegram reports

- There is a separate active workflow named **Finance Auto Reports — Daily / Weekly / Monthly**
- It has 3 triggers and appears to be the scheduled report-delivery layer for recurring Telegram summaries
- Its internal node graph was not available through MCP in this session, so the exact trigger times and downstream steps were not directly inspectable here

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
- **Weekly View** — accessed by tapping any week header in Records
- **Dashboard Settings** — accessed via ⋮ menu → Dashboard Settings

Breakdown and Merchants pages are also reachable by drilling down from Overview cards.

### Menu (⋮ button)

Opens an action sheet with four options:
- **Planned Expenses** — opens the Planned Expenses management page
- **Dashboard Settings** — configure which sections are visible and their order
- **Refresh Data** — clears cache and reloads all data from Google Sheets
- **Sign Out** — clears token and cache, returns to sign-in screen

---

## Overview (Dashboard)

### Overview Hero

The top of the dashboard is now decision-first rather than four equal-weight metric cards:

- **Safe Limit** is the primary hero metric at the top of the screen
- The hero also shows the active period as a human-readable badge such as `June 2026`
- The hero subline surfaces:
  - `payday in N days` when a future salary period start is available
  - `no payday found` when it is not
  - `Today` spend amount with category emojis when today has expenses
- Safe Limit still uses the same formula: `balance ÷ days until next payday`
- Safe Limit shows `—` if the balance is negative or there is no future payday

### Secondary Summary Metrics

`Income`, `Expenses`, and `Balance` still appear in the first viewport, but as lower-priority compact cards below the hero:

- **Income** — total income for the period; tap to open Records filtered to income only
- **Expenses** — total expenses; tap to open Records filtered to expenses only
- **Balance** — income minus expenses (green if positive, red if negative)
- The amount + currency suffix never wraps onto two lines — `card-value` uses `white-space: nowrap` and a fluid `clamp()` font size so values like "67 000 Kč" stay on a single line even on narrow phones. Cards have reduced vertical padding so they sit at a normal height.

### Period Controls
- Toggle between **Billing Period** (salary-cycle based) and **Calendar Month**
- Previous / Next navigation buttons to browse historical periods
- Active period label is shown in a human-readable format such as `May 2026`
- Billing period boundaries derived from the Salary Periods sheet

### Today Strip
- Compact strip in the configurable dashboard sections below the hero area
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
- **By Week**: bar chart of spending per week within the active billing period or calendar month; week numbering always starts from the beginning of that active period; tap a bar → Weekly View for that week
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
- Displays the count and a chevron — the whole banner is a button
- Tap opens Records pre-filtered to **needs-review only** in the current period and mode
- The Records page shows a dismissible "Needs review" chip while the filter is active; tapping the chip (or "Clear all") removes it

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
- Switching mode resets the period to the current period in the new mode

### Period Navigation
- **Hero block** at the top of Records shows the active period (e.g. "May 2026") with `‹` and `›` arrow buttons either side
- Arrows step backward and forward through available periods one at a time (oldest periods to the left, newest to the right)
- Arrows are disabled when at the oldest / newest period
- The same period can also be picked from the Refine sheet (period dropdown) — both controls stay in sync
- Switching period clears the active week and merchant filters so the new period starts fresh

### Shared period state across pages
- The selected period mode (Billing / Month) and current period are remembered across Overview, Records, Spending Breakdown, and Merchants pages within a session
- Example: viewing **June** in **Calendar Month** mode on Overview and tapping the Records tab now opens Records with the same June + Calendar Month context (instead of resetting to Billing + current period)
- Drill-down navigation (tapping a category card, "tap to see →" on Income/Expenses, etc.) still passes its own explicit mode + period — those take precedence over the shared state
- Stored in memory only — resets to default (Billing) on full reload

### Filters
- **Search** — real-time, matches category, bank, merchant, and all other fields; pre-filled when navigating from search-based drill-downs
- **Refine button** — opens a bottom sheet for secondary controls instead of showing all filters at once
- **Refine sheet controls**:
  - period selector with human-readable labels such as `May 2026`
  - week selector within the active period
  - direction (`All`, `Expenses`, `Income`)
  - category
  - sort order
- **Active filter chips** — dismissible chips for direction, category, merchant drill-down, active week, needs-review filter, and non-default sort state
- Active filter chips wrap onto multiple lines instead of forcing horizontal page overflow
- **Clear all** chip removes all secondary filters and resets sort to the default

### Sort
- **Sort order** — chosen inside the `Refine` sheet; supports **New→Old** (default) and **Old→New**
- Handles mixed date formats from the sheet (DD/MM/YYYY, YYYY-MM-DD, ISO datetime)

### Records Header
- Top section is a compact summary card rather than a plain filter stack
- Shows:
  - current period
  - whether the view is `Billing` or `Calendar`
  - visible record count
  - a compact spend/inflow summary for the visible result set
- Only search and `Refine` remain visible as primary controls below the summary card

### Transaction Rows
- Category emoji badge (tinted background)
- Merchant / primary text is the first visual line
- Amount stays on the right (+ green for income, − red for expenses)
- Category moves into a smaller pill treatment on the metadata row
- Bank / source name stays visible as secondary metadata
- "Review" badge for flagged transactions

### Date Grouping
- Transactions are also clustered under tappable week headers inside Records
- Each week header shows:
  - week number
  - visible record count for that week
  - total expense amount for that week
- Week numbering is relative to the active billing period or month, so cross-month billing periods still show a continuous `Week 1`, `Week 2`, `Week 3` sequence
- Transactions grouped under date headers (e.g., "Mon, 01 Jan →")
- Date headers also show the number of visible transactions in that group
- Groups sorted in the same direction as the active sort
- **Tapping a date header navigates to the Daily View for that date**
- **Tapping a week header navigates to the Weekly View for that week**

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
- **Hero card** — wraps daily navigation and total summary into one elevated section
- **Header** — total expenses for the day + up to 3 category emoji chips (only shown when transactions exist)
- **Empty state** — uses a dedicated calm card rather than a plain text block
- **Transaction rows** — same style as Records; tap any row to open the edit bottom sheet
- Future dates and today's date are disabled in the → navigation button (no forward navigation past today)

---

## Weekly View

- Shows all **expense** transactions for a single week inside the active billing period or calendar month
- Accessed by tapping a week header in Records
- Uses the same period-based week numbering as Records and the Overview weekly chart
- **Week navigation** — ← → buttons step through available weeks in the same active period
- **Hero card** — shows week number, period label, date range, total expenses, and top category badges
- **List layout** — transactions remain grouped by day inside the selected week
- **Day headers** — keep daily totals visible and can still be tapped to open the Daily View for that date
- **Transaction rows** — same style as Records and Daily View; tap any row to open the edit bottom sheet

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
- Manual entry is therefore possible in two product surfaces:
  - directly in the PWA via the Add page
  - through the Telegram bot for cash expenses

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

- Numbers formatted with `cs-CZ` locale (space thousands separator)
- **Per-transaction display uses the transaction's own currency** (col F of Transactions sheet). Known codes are mapped to symbols: `CZK → Kč`, `EUR → €`, `USD → $`, `GBP → £`, `PLN → zł`, `CHF → CHF`. Unknown codes render as the raw ISO code (e.g. "100 NOK"). Empty / missing currency falls back to `Kč`.
- Sites that show the per-transaction currency: Records list rows, Daily View rows, Weekly View rows, transaction edit sheet header.
- **Aggregations (Dashboard cards, Spent in Period, By Merchant, Budget vs Actual, Spending Trend, Comparison, Recurring, Owes You, Planned Expenses) currently render in Kč regardless of underlying transaction currencies.** This means totals that include non-CZK transactions are arithmetically wrong (a 4 EUR row is summed as if it were 4 Kč). Full multi-currency aggregation (exchange-rate conversion or per-currency tabs) is a separate refinement — see Option B in the currency display discussion.
- Period labels: "April 2026" in full headers, "Apr '26" in chart axis labels
- Date display: "Mon, 01 Jan" in list headers, "01 Jan 2026" in edit sheet
- Single source of truth for amount/currency formatting: `js/utils/format.js` (`fmt`, `parseAmount`, `currencySymbol`)

---

## PWA & Offline

- Installable on iOS and Android via browser "Add to Home Screen"
- Service Worker with network-first strategy: always fetches fresh, caches response, falls back to cache when offline
- **Auto-update**: when a new version is deployed, the app detects the updated Service Worker, activates it immediately, and reloads automatically — no manual incognito/re-install needed
- Safe-area support for iOS home indicator and Dynamic Island (top header + nav bar background)
- `sessionStorage` for auth token and data cache — cleared when the browser session ends
