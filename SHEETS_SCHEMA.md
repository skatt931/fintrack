# Google Sheets — Full Schema & Feature Reference

> **Source of truth for the spreadsheet backend.** Consult this when reading or writing any sheet data.
> Last known state: 2026-05-29 (Europe/Prague).

---

## Spreadsheet Structure (5 tabs)

| Tab | Role |
|-----|------|
| **Transactions** | Raw source of truth — never overwritten to "look nice" |
| **Dashboard** | Legacy dashboard (uses raw `amount`, not analytics-safe) |
| **Dashboard 2.0** | Current analytics dashboard — uses `report_amount` |
| **Budgets** | Category list + monthly budgets + dropdown source |
| **Salary Periods** | Start dates for salary-cycle period mapping |

---

## Core Principles

- **Transactions is raw truth.** Real rows are never overwritten for aesthetics.
- **Analytics is a separate layer.** Dashboards interpret Transactions via rules.
- **Transfers + reimbursements must not distort analytics.**
- **`exclude_from_reports`** is the master "ignore in reports" switch.
- **Linking layer** (`linked_group_id` / `link_role`) makes shared expenses + reimbursements reconcile correctly.

---

## Transactions Tab — Columns A:AB

> Columns A and K:N are hidden by the user (not deleted).

| Col | Field | Notes |
|-----|-------|-------|
| A | `email_id` | Technical source ID; useful for dedupe / import tracing. Hidden. |
| B | `date` | Real transaction datetime. Drives all period logic. |
| C | `bank` | Source bank/account label. |
| D | `direction` | Dropdown: `expense` / `income` / `transfer`. Drives dashboards + `report_amount`. |
| E | `amount` | Raw numeric amount (always the bank truth). Used in linking; dashboards prefer `report_amount`. |
| F | `currency` | Default CZK. |
| G | `merchant` | Intended for merchant→category mapping; often blank. |
| H | `category` | Dropdown validated from `Budgets.all_categories`. Drives budgets + category charts. |
| I | `description` | Human-readable info. |
| J | `confidence` | AI/parser confidence score. Used for quality checks. |
| K | `source_subject` | Debug/audit. Hidden. |
| L | `source_from` | Debug/audit. Hidden. |
| M | `source_date` | Debug/audit. Hidden. |
| N | `raw_snippet` | Debug/audit. Hidden. |
| O | `needs_review` | Checkbox. Flags uncertain rows for human review. |
| P | `review_reason` | Reason string for the review flag. |
| Q | `month` | **Auto** — ARRAYFORMULA from `date`, formatted `YYYY-MM`. Calendar-month analytics key. |
| R | `type` | Auto or manual. Classifies special cases (transfer, reimbursement, normal). |
| S | `manual_override` | Checkbox. Marks user-corrected rows (training signal / audit). |
| T | `user_comment` | Free notes. Shown in attention queue. |
| U | `billing_period` | **Auto** — mapped from `Salary Periods.start_date`. Salary-cycle analytics key. |
| V | `exclude_from_reports` | Checkbox. If TRUE → `report_amount` = 0. Master "ignore" switch. |
| W | `linked_group_id` | Manual. Groups an expense with its reimbursements or transfer pair. |
| X | `link_role` | Dropdown: `original_expense` / `reimbursement` / `transfer_pair`. Drives `report_amount`. |
| Y | `expected_reimbursement` | Manual. Expected reimbursement amount for an `original_expense` row. |
| Z | `linked_reimbursement_total` | **Auto** — sums reimbursement `amount` values for same `linked_group_id`. |
| AA | `report_amount` | **Auto — the value all dashboards use.** Rules: exclude→0; reimbursement→0; transfer→0; original_expense→`max(amount − linked_reimbursement_total, 0)`; else→`amount`. |
| AB | `reimbursement_status` | **Auto** — `Waiting` / `Partial` / `Settled` based on expected vs received. |

---

## Budgets Tab — Columns A:C

| Col | Field | Notes |
|-----|-------|-------|
| A | `Category` | Canonical budget category names. Only rows with a budget set have an entry here. |
| B | `Monthly Budget` | Budget amount in CZK for that category. |
| C | `all_categories` | **Complete list of all valid categories** (including those without budgets). Used as the dropdown data source for `Transactions.category` (col H). Do not overwrite or append to this column from the PWA — it is maintained in the sheet. |

> **Important for writes:** When adding a new budget row via the API, only write columns A and B (`Category` and `Monthly Budget`). Never write to column C (`all_categories`) — it is managed by the sheet itself.

---

## Salary Periods Tab — Columns A:B

| Col | Field | Notes |
|-----|-------|-------|
| A | `period` | Period label, e.g. `2026-05`. |
| B | `start_date` | Date when the period begins. Used to auto-fill `Transactions.billing_period`. |

---

## Dashboard Tab (legacy)

- Month-based overview: Total Expenses, Income, Net Balance, category breakdown.
- **Limitation:** Uses raw `amount` (col E), does NOT respect `exclude_from_reports` or `report_amount`.
- Kept for reference / backward compatibility only.

---

## Dashboard 2.0 Tab (current)

Uses `report_amount` (col AA) and `exclude_from_reports` (col V) for all analytics.

**Two modes side-by-side:**
- Calendar month — keyed on `Transactions.month` (Q)
- Salary cycle — keyed on `Transactions.billing_period` (U)

**Sections:**
- Controls: Current Month, Salary Period, refresh timestamp
- KPI row: Monthly Expenses / Income / Net / Savings Rate · Salary Expenses / Balance · Needs Review count
- Budget Health (Monthly + Salary): spent vs budget, % used, remaining, status (OK / Watch / Risk / Over)
- Top Monthly Categories + Salary Period Trend (tables + charts)
- Data Quality & Automation Health: needs review count, low confidence, missing category, excluded entries, open reimbursement groups, unlinked reimbursements, reportable transfers
- Attention Queue: QUERY-based list of rows needing attention

---

## Connection Map

| Source | → | Target | Purpose |
|--------|---|--------|---------|
| `Transactions.month` (Q) | → | Dashboard & Dashboard 2.0 | Calendar-month analytics |
| `Salary Periods.start_date` | → | `Transactions.billing_period` (U) | Salary-cycle period mapping |
| `Budgets.all_categories` (C) | → | `Transactions.category` (H) dropdown | Category validation |
| `Transactions.exclude_from_reports` (V) + `link_role` (X) / linking (W:AB) | → | `report_amount` (AA) | Authoritative analytics amount |
| Dashboard 2.0 | = | Authoritative analytics layer | Uses `report_amount` throughout |
| Legacy Dashboard | = | Older raw-amount view | Uses `amount`, not analytics-safe |
