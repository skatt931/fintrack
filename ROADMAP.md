# Product Roadmap — from personal PWA to sellable app

> **Decision document.** This is the long-term plan for evolving the Finance PWA into a
> distributable, sellable product. Read together with:
> - [FEATURES.md](FEATURES.md) — what the app does today (the product spec)
> - [SHEETS_SCHEMA.md](SHEETS_SCHEMA.md) — current Google Sheets backend
> - [docs/superpowers/plans/2026-06-10-supabase-migration-plan.md](docs/superpowers/plans/2026-06-10-supabase-migration-plan.md) — detailed Phase 1 execution plan
>
> Status: agreed direction as of 2026-06-10. Phases have explicit decision gates — nothing
> beyond the current phase is committed.

---

## Where we are and where we're going

**Today:** a personal-use PWA. Vanilla JS frontend on GitHub Pages, Google Sheets as the
database (with formula columns doing analytics), n8n workflows scraping Gmail for bank
emails and providing a Telegram bot. Works well for one user; not sellable.

**Target:** a real product users can find in the App Store / Google Play, with accounts,
subscriptions, and automatic bank sync.

```
                       ┌──────────────────────────────┐
                       │     Backend (the product)     │
                       │  Supabase Postgres · Auth     │
                       │  API · Bank sync · Billing    │
                       └──────┬──────────────┬────────┘
                              │              │
                  ┌───────────┴───┐     ┌────┴─────────────┐
                  │ React Native  │     │ Next.js web      │
                  │ iOS + Android │     │ (later, optional)│
                  └───────────────┘     └──────────────────┘
```

The **backend is the product** (~60% of total effort): the data model, the analytics
engine (periods, budgets, reimbursements — already designed and battle-tested in this
PWA), bank integration, and billing. The mobile app is the storefront.

---

## Architectural principles

### Where logic lives

The single most important migration rule — spreadsheet formulas are replaced by two
distinct mechanisms, never recreated as formulas-in-disguise:

| Kind of logic | Lives in | Example |
|---|---|---|
| **Derived data** — computed fields, aggregations, joins | **SQL views**, versioned as migrations in this repo | `report_amount`, `billing_period`, `linked_reimbursement_total`, `reimbursement_status` |
| **Behaviour** — actions, validation, side effects | **Backend application code** (testable, debuggable) | mark-as-paid, debt linking flows, notifications, billing webhooks |
| **Never** | Database triggers for business logic; client-only logic for anything money-related | — |

Why views (not app code) for derived data: every consumer — PWA, n8n, Telegram bot,
future mobile app — reads identical numbers from one definition. Computing
`report_amount` in app code would let n8n and the app drift apart, which is precisely
the class of bug the current sheet formulas were preventing.

Views are still "logic in the app" in the sense that matters: they live in git, get
reviewed in PRs, and are covered by parity tests.

### Other standing decisions

- **Money:** `numeric`, never `float`. Historical `fx_rate` stored per transaction, never recalculated retroactively.
- **Time:** `timestamptz` storage; `Europe/Prague` as the canonical reporting timezone.
- **Identity:** UUID primary keys + preserved business identifiers (`email_id`, `linked_group_id`) for idempotent imports.
- **TypeScript everywhere** in new code (backend, mobile, future web) — one language across the whole stack.

---

## Phases

### Phase 0 — Now: keep shipping the PWA  *(current)*

The PWA stays the daily-use tool and the living product spec. Every feature shipped here
is requirements-discovery for the product. Zero migration work is wasted: FEATURES.md
becomes the spec for the mobile app.

- New features keep landing in this repo against Google Sheets.
- The n8n Gmail-scraping + Telegram flows stay untouched.
- Exit criteria: decision to commit evenings/weekends to Phase 1.

### Phase 1 — Database: Supabase replaces Google Sheets

**Detailed execution plan:** [2026-06-10-supabase-migration-plan.md](docs/superpowers/plans/2026-06-10-supabase-migration-plan.md)
— follow it as written. Summary of its sequence:

1. Freeze the contract (exact business-rule definitions for every derived field)
2. Create `finance.*` schema (tables, constraints, indexes)
3. Build `v_transactions_enriched` — the SQL view reproducing all sheet-formula outputs
4. Backfill historical data from Sheets; run parity checks (monthly totals, billing-period totals, reimbursement states must match the sheet exactly)
5. **n8n dual-writes** — Gmail/Telegram workflows write to both Sheets and Supabase
6. Reconciliation window (several days of parallel data, zero drift tolerated)
7. Switch PWA **reads** to Supabase
8. Switch PWA **writes** to Supabase
9. Demote Sheets to backup/archive

Key point: the existing PWA is the **first client of the new backend**. It validates the
entire data layer before any new UI is built. Authentication stays Google OAuth
(Supabase Auth supports it natively).

**n8n in this phase:** keeps running, retargeted. The Gmail scraper and Telegram bot
write to Supabase instead of Sheets. They are not replaced yet — they're personal-scale
automation that keeps working while the foundation changes underneath.

- Exit criteria: all acceptance checks in the migration plan pass; Sheets demoted; PWA fully on Supabase for a full billing cycle.

### Phase 2 — Backend API layer

For personal use, the PWA can talk to Supabase directly (client SDK + RLS). For a
product, a real API layer is required: multi-tenancy, server-held secrets, rate
limiting, an ingestion endpoint for transaction sources.

- Supabase Edge Functions or a small Node/TypeScript service (decide then; Edge Functions are the low-ops default).
- Endpoints mirror what the PWA does today: transactions CRUD, budgets, planned expenses, analytics queries.
- Multi-tenant data model: add `user_id` to every `finance.*` table + RLS policies. (Cheap to add in Phase 1 schema from day one — **do this even though it's single-user initially.**)
- The n8n flows become callers of the ingestion API instead of writing to the DB directly.

- Exit criteria: PWA runs entirely through the API; a second test account sees only its own data.

### Phase 3 — React Native mobile app

The storefront. Rebuild the UI from FEATURES.md as the spec — port the *product*, not
the code.

- **React Native + Expo** (managed workflow): one TypeScript codebase → iOS + Android, EAS builds, OTA updates for JS-only fixes (same convenience as today's PWA deploys).
- UI kit: Tamagui or NativeWind + RN Reusables (decide at kickoff).
- TanStack Query against the Phase 2 API.
- The PWA stays alive during this phase as the reference implementation; it can be retired (or kept as the web client) once the mobile app reaches feature parity.

- Exit criteria: feature parity with FEATURES.md on your own phone via TestFlight / internal track.

### Phase 4 — Store presence + billing

- Apple Developer Program ($99/yr) + Google Play Console ($25 once).
- **RevenueCat** for subscription management across both stores (handles receipt validation, entitlements, App Store/Play billing differences).
- Free tier vs paid tier decision (which features gate behind subscription).
- Privacy policy, GDPR posture (financial data!), App Store review prep.

- Exit criteria: app live in both stores; first paying subscriber possible.

### Phase 5 — Real bank integration

The actual product moat. Customers will not label their bank emails for Gmail scraping.

- **Open banking aggregator** for EU/CZ: GoCardless Bank Account Data (formerly Nordigen — has strong Czech bank coverage and a free tier), or Tink. Evaluate both then.
- Transactions sync server-side into the same ingestion pipeline n8n uses (Phase 2 API).
- The n8n Gmail scraper is retired for product users — it may live on for your personal account as a fallback.
- AI categorisation (currently in n8n) moves into the backend ingestion path as a product feature.

- Exit criteria: a new user can connect their Czech bank and see transactions without any email setup.

### Phase 6 — Optional: Next.js web app

- Marketing site + web dashboard sharing the Phase 2 API and TypeScript types with the RN app.
- Only if customer demand justifies it.

---

## What happens to each existing piece

| Today | Phase 1 | Phase 2–3 | End state |
|---|---|---|---|
| Vanilla JS PWA | First client of Supabase | Reference implementation for RN app | Retired or kept as web client |
| Google Sheets | Dual-write target → demoted | Archive/backup | Personal audit copy only |
| Sheet formulas | Replaced by SQL views | — | Gone |
| n8n Gmail scraper | Retargeted to Supabase | Calls ingestion API | Retired for product users; personal fallback |
| n8n Telegram bot | Retargeted to Supabase | Calls API | Optional personal feature; maybe product feature later |
| FEATURES.md | Source of truth | Spec for RN rebuild | Lives on as the product spec |
| GitHub Pages deploy | Unchanged | Unchanged for PWA | Replaced by EAS/stores for mobile |

---

## Decision gates (nothing past the current gate is committed)

1. **Gate → Phase 1:** willing to invest consistent side-project time for ~4–8 weeks of database migration work. The PWA keeps working throughout, so this is low-risk — but it's the commitment point.
2. **Gate → Phase 3:** Phase 1+2 stable for a full billing cycle AND still motivated to sell (not just personal use — Phases 3–5 only pay off for a product).
3. **Gate → Phase 5:** real users besides yourself exist or are concretely planned. Bank-aggregator contracts and GDPR obligations are not worth it for one user.

## Where to start (concretely, when Gate 1 is passed)

Per the migration plan's "What I Would Build Next":

1. `supabase/` directory in this repo — project config + migrations
2. First migration: `finance.*` base tables (**including `user_id` columns + RLS from day one**, per Phase 2 note)
3. Second migration: `v_transactions_enriched` view
4. Import script: Sheets export → Postgres
5. Parity-check script: Sheets totals vs Supabase totals
6. Then — and only then — touch n8n
