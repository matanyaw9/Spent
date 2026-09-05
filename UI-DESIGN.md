# UI redesign: design notes

Working document for the next generation of the Spent UI. This is the
plan of record for the fork; update it as decisions land.

Goals, in the owner's words:

1. Select multiple transactions, filter them, tag them all at once, add
   rules. An Outlook-style workflow.
2. Show much more information: spending per category, changes between
   months, budget adherence.
3. "Pockets": loan repayments, loans taken, and investments are not
   really spending or income. Money moving between my own pockets should
   be modeled and shown as such.
4. Transactions that do not count toward monthly spending must be
   visually obvious (grayed out or similar).
5. When waiting for sync, or for testing a new connection (like during setup), there should be an indication that it's loading something, that we are wating and it didn't crash. 

## What already exists (build on it, do not duplicate it)

The schema and UI are further along than the docs suggest:

- `transactions.kind` is `expense | income | transfer`, with
  `kind_source` (`auto | user`) so manual overrides survive re-sync
  (migrations 008, 021). Card-aware transfer detection runs on sync and
  on server startup.
- `transactions.is_excluded` plus an `excluded_merchants` table
  (migration 020). Excluded rows already render at `opacity-50`.
- Budgets per category with `budget_mode` (`budgeted | tracking`) and a
  `payday_day` setting (migrations 004, 012). A `/budget` page and a
  budget detail sheet exist.
- Category hierarchy (016), category kinds, AI confidence and past
  corrections (015), manual categorization applied to merchant history.
- Transactions page with month selector, search, multi-select category
  and account filters, kind filter, sorting, pagination, KPI cards.
- Workspaces (013) scope everything.

What is genuinely missing: row selection and bulk actions, a
user-visible rules engine, month-over-month analytics, and the pocket
concept. That is the work.

## Design pillars

- **The table is a workbench, not a report.** Every cleanup action
  (recategorize, exclude, reclassify, "make a rule so I never do this
  again") should be doable from the transactions table without leaving
  it.
- **Every automatic decision is visible and reversible.** If the app
  decided a row is a transfer, or a rule categorized it, the row says
  so, and one click undoes it.
- **Counted vs not-counted is a first-class visual distinction.**
  A reader should be able to glance at the table and know exactly which
  rows make up the monthly total.

## A. Transactions workbench (selection, bulk actions, rules)

### Selection

- Checkbox column on the transactions table. Click to toggle,
  Shift+click for ranges, header checkbox selects the whole filtered
  result set (with a "select all N matching" affordance when the
  selection spans pages, like Gmail/Outlook).
- Keyboard: arrow keys move a focus row, Space toggles, Shift+arrows
  extend. Esc clears.

### Bulk action bar

A floating bar appears when 1+ rows are selected (pattern: Outlook /
Linear). Actions:

- **Categorize**: pick a category, applies to all selected.
- **Set kind**: expense / income / transfer (sets `kind_source = user`).
- **Exclude / include** in totals.
- **Move to pocket** (see section C).
- **Create rule from selection**: pre-fills a rule from what the
  selected rows share (merchant, provider, amount range). This is the
  Outlook-style glue between one-off cleanup and automation.

### Rules engine

Today two hardcoded rule types exist in disguise: `excluded_merchants`
("always exclude this merchant") and apply-categorization-to-history.
Generalize into one `rules` table and one settings UI:

```
rules (
  id, workspace_id, name, priority, enabled,
  -- conditions (all must match)
  merchant_match TEXT,          -- contains | equals | regex (advanced)
  merchant_value TEXT,
  provider TEXT NULL,           -- limit to one integration
  amount_min REAL NULL,
  amount_max REAL NULL,
  -- actions
  set_category_id INTEGER NULL,
  set_kind TEXT NULL,           -- expense | income | transfer
  set_excluded INTEGER NULL,
  set_pocket_id INTEGER NULL,
  created_at, updated_at
)
```

Semantics:

- Rules run on sync for new transactions, before AI categorization.
  A rule hit means the AI never sees the row (cheaper, deterministic).
- Creating or editing a rule offers a **preview + retroactive apply**:
  "This rule matches 37 existing transactions. Apply to them?" with a
  diff-style list before confirming.
- Rules never override `kind_source = user` or manually categorized
  rows unless the user explicitly asks in the retroactive-apply step.
- Migrate `excluded_merchants` rows into `rules` with
  `set_excluded = 1` so there is a single mental model.
- Rows touched by a rule show a small rule chip in the table; clicking
  it opens the rule for editing.

## B. Insights (more information, better shown)

Keep the dashboard cozy and glanceable; add depth on a dedicated
**Insights** page (new route, `/insights`). Content:

- **Category breakdown over time**: per-category monthly spend with a
  sparkline, current month vs previous month delta (absolute and %),
  and a 6-month mini bar chart per category. Sorted by biggest change,
  not biggest amount, because change is what needs attention.
- **Month comparison**: pick two months, see side-by-side per-category
  bars with deltas. Default: this month vs last month.
- **Budget adherence**: for each budgeted category, spent vs budget as
  a progress bar with pace ("day 20 of 31, 85% of budget used"), plus a
  monthly adherence history: how many months out of the last 6 stayed
  under budget. One aggregate "adherence score" at the top for the
  whole workspace.
- **Income vs spending flow**: monthly net line (income minus counted
  spending), with pocket movements shown separately so they never
  distort the net.
- Respect the `payday_day` setting everywhere a "month" is used, so
  people paid mid-month see their real budget cycle.

Dashboard changes stay small: add a compact "vs last month" delta to
each category card and a link into the matching Insights section.

## C. Pockets (transfers between my own money)

### Concept

A pocket is a named place your money sits: checking, savings,
investments, a loan balance. Moving money between pockets is neither
income nor spending. This resolves the loan/investment ambiguity:

- Repaying a loan: transfer from checking pocket to the loan pocket
  (debt shrinks). Not spending. The interest part, when identifiable,
  IS spending (category: Fees/Interest).
- Taking a loan: transfer from the loan pocket to checking. Not income.
- Buying an investment: transfer to the investments pocket. Not
  spending. Selling: transfer back. Not income (P&L is out of scope for
  now).

### Model

```
pockets (
  id, workspace_id, name, icon, color,
  type TEXT,   -- checking | savings | investment | loan | other
  created_at
)
-- transactions get a nullable pocket_id: set = this row is a movement
-- into (amount < 0) or out of (amount > 0) that pocket.
```

The existing `kind = transfer` stays the umbrella: a pocket movement is
a transfer with a destination. Existing card-payment transfer detection
keeps working unchanged; assigning a pocket is optional enrichment.

### UI

- Pockets are managed in settings (create, rename, archive). Seed
  nothing; an empty state on the transactions page suggests creating
  one the first time a user marks a row as a transfer.
- Bulk action "Move to pocket" and rules action `set_pocket_id` (a
  standing order to a savings account becomes one rule).
- A "Pockets" card on the dashboard: net movement per pocket this month
  ("Investments +8,000, Loan -2,100"). Framing is *where money went*,
  not *what it cost you*.
- Monthly totals and budget math count only `kind = expense` rows that
  are not excluded. Income counts only `kind = income`. Pocket
  movements and plain transfers appear in neither, ever.

## D. Not-counted rows are visually obvious

One consistent treatment for every row that does not count toward the
monthly total, regardless of why:

- Row at reduced opacity (keep the current `opacity-50`), amount struck
  through, and a small reason chip: `excluded`, `transfer`,
  `pocket: Investments`, or `rule: <name>`.
- The chip is the affordance: click it to see why and undo it.
- Table footer per month: "N transactions (X ILS) not counted", which
  toggles a filter showing only those rows for review.
- KPI cards state what they count ("Spending: expenses only, excludes
  transfers and pockets") in a tooltip, so the numbers are auditable.

## Phasing

1. **Selection + bulk actions + not-counted treatment** (A minus rules,
   plus D). Pure UI over existing endpoints; highest daily leverage.
2. **Rules engine** (rest of A). New table, sync-pipeline hook,
   settings page, retroactive apply. Migrate `excluded_merchants`.
3. **Insights page** (B). New summary queries (per-category per-month
   aggregates), charts with recharts, which is already a dependency.
4. **Pockets** (C). Migration, settings UI, dashboard card, and the
   bulk/rule actions land last because they build on 1 and 2.

Each phase is shippable on its own; the order minimizes rework because
the bulk bar (1) is the surface that rules (2) and pockets (4) plug
into.

## Open questions

- Should interest on a loan repayment be split automatically when the
  bank reports principal and interest together? (Probably phase 5;
  needs per-bank data quality research.)
- Do pockets eventually want balances and a net-worth view, or stay a
  flow-only concept? Flow-only for now; balances require opening
  balances and reconciliation.
- Hebrew UI is out of scope for now but the new components should keep
  using next-intl message keys from day one, as the existing pages do.
