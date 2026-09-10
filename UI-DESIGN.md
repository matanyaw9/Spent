# UI design: plan of record (v2)

Working document for the next generation of the Spent UI in this fork.
Update it as decisions land. v1 (2026-09-05) is summarized at the end
under "Shipped so far"; everything above that is the plan.

## Start here (status log, newest first)

- 2026-09-10: plan v2 approved. Phase 0 done: `feature/transaction-interface`
  merged into `main`. Next: phase 1 on `feature/money-model` (migration
  027, flow fragment, cycle helper, pockets and tags settings). Open
  questions below still need the owner's answers; phase 1 starts with the
  parts that do not depend on them.

## Vision, in the owner's words

- A beautiful dashboard with many graphs and figures: this month, previous
  months, what changed, did I miss the target.
- Interactive: hover for detail, click to drill down, see how
  sub-categories vary.
- Some transactions are not spending: investments, loan repayments, cash
  withdrawals. Model them as money moving between my own pockets.
- Loans and investments as first-class: "did I spend extra this month, or
  did I spend less and return extra debt (which is good)".
- Add cash transactions manually.
- Transactions view like an email client: sort, filter, select, tag, add
  rules. Flexible, dense, keyboard-friendly.
- English UI is fine; transaction text is whatever the bank sends.
- Tagging is the user's job, and that is a feature, not a gap. Category
  tree, sub-categories, rules and tags are how you *feel* the money flow.
  AI categorization stays as an optional helper but gets no more
  investment.

## Design pillars

1. **One money model, shown the same way everywhere.** Every number on
   every screen is derivable from one classification of each row (see
   "Money model"). Tooltips say what a figure counts.
2. **Every chart is a filter.** Hovering explains, clicking focuses, and
   any focused slice can be opened as a transaction list. No dead-end
   charts.
3. **The transactions view is a workbench.** Dense rows, a detail pane,
   bulk actions, rules and tags, all without leaving the list.
4. **Manual classification is fast and sticky.** Categorizing a row takes
   one keystroke and a few letters; turning that decision into a rule is
   one more click. Automatic decisions are visible and reversible.
5. **Beautiful by default.** Warm palette already in `globals.css`, serif
   numerals, generous whitespace, motion only where it explains a change.

## Money model

### Today

`transactions.kind` is `expense | income | transfer`, `is_excluded`
removes a row from totals, `excluded_merchants` is a primitive rule, card
billing lines are auto-detected transfers and hidden. Budgets exist per
category with `budget_mode`, plus a workspace `monthly_target` and
`payday_day`.

### Target model

Add **pockets** (from v1, section C) and derive a **flow** for every row:

```
pockets (
  id, workspace_id, name, emoji, color,
  type TEXT CHECK(type IN ('cash','savings','investment','loan','other')),
  planned_monthly REAL NULL,   -- expected contribution / repayment per cycle
  archived_at TEXT NULL,
  created_at
)
transactions.pocket_id INTEGER NULL REFERENCES pockets(id)
```

Derived flow (never stored, computed in one shared SQL fragment):

| flow            | when                                              | counts in         |
|-----------------|---------------------------------------------------|-------------------|
| spending        | kind = expense, not excluded, pocket_id null      | monthly total     |
| income          | kind = income, not excluded                       | income            |
| investing       | pocket.type = investment, money out               | "where it went"   |
| debt repayment  | pocket.type = loan, money out                     | "where it went"   |
| debt taken      | pocket.type = loan, money in                      | shown, not income |
| saving          | pocket.type = savings, money out                  | "where it went"   |
| cash withdrawal | pocket.type = cash, money out (ATM)               | neither           |
| internal        | kind = transfer, no pocket (card billing etc.)    | neither           |
| excluded        | is_excluded                                       | neither           |

Consequences:

- The monthly story becomes: **income minus spending = free cash**, and
  free cash went to **investments + debt + savings + leftover**. That is
  the "did I return extra debt" answer: `debt repayment - planned_monthly`
  is the extra, shown green when positive.
- A cash pocket fixes cash accounting: the ATM withdrawal becomes a
  transfer into Cash, and manual cash entries are the actual spending.
  Users who do not itemize cash can leave ATM withdrawals as spending
  (today's behavior); nothing forces the pocket.
- Loan interest: when a bank reports principal and interest as one line,
  a **split** (below) lets the interest part stay spending. Automatic
  splitting stays an open question.
- `kind = transfer` remains the umbrella; a pocket is enrichment. Card
  billing duplicates keep their current auto-detection and hiding.

### Splits (small, needed for loans)

```
transaction_splits (
  id, transaction_id, amount, category_id NULL, pocket_id NULL, note
)
```

A row with splits contributes each split to the flow of its own
category or pocket. UI: "Split" in the detail pane, amounts must sum to
the row total, parent row shows a split chip. Keep this minimal.

### Tags

Categories are one hierarchical label per row. Tags are many-to-many,
flat, user-named, cross-cutting ("Trip to Berlin", "Reimbursable",
"Kids"), exactly like mail labels next to folders.

```
tags (id, workspace_id, name, color, created_at, UNIQUE(workspace_id, name))
transaction_tags (transaction_id, tag_id, PRIMARY KEY(transaction_id, tag_id))
```

Tags filter, group and appear as chips; they never affect totals.

### Period = payday cycle

`getMonthRange` uses calendar months while the summary uses
`payday_day`. One helper, `getCycleRange(date, paydayDay)`, used by
every page and every query, with the cycle label ("10 Aug to 9 Sep")
shown next to the month name. Calendar months stay the default when
`payday_day = 1`.

## Dashboard (Home) v2

Home becomes the insights dashboard. The current `/budget` page stays as
the place to *set* targets (rename it "Targets" in the sidebar); the
grid there also gains the adherence history. `src/components/dashboard/`
is confusingly the budget page; rename it to `src/components/budget/`
when touching it.

### Interaction model (applies to every section)

- **Period**: one cycle selector in the page header, arrow keys move it,
  URL carries `?cycle=2026-09`. Every section reads the same period.
- **Focus**: clicking a category, sub-category, pocket or month sets a
  focus; every other section cross-filters or highlights to it; a chip
  under the header shows the focus with an x. Clicking the same item
  again clears it. URL carries `?focus=cat:12`.
- **Hover**: one shared tooltip component (amount, share of total, delta
  vs previous cycle, count, top merchant). Same layout everywhere.
- **Open in transactions**: every tooltip and every focus chip has an
  "Open N transactions" link that deep-links to `/transactions` with the
  matching filters as query params. This is the drill-down of last
  resort and it must always be one click away.
- **Compare**: a "vs" control (previous cycle, same cycle last year,
  3-cycle average). Deltas everywhere use whatever it is set to.

### Sections (top to bottom, 12-col grid, all recharts)

1. **Cycle hero** (full width). Spent so far vs target with pace, delta
   vs comparison, days left. Behind it a **burn curve**: cumulative
   spending per day this cycle as an area, previous cycle as a dashed
   line, target as a flat reference. Hover a day for that day's spend
   and the running total. Click a day to focus the transactions of that
   day.
2. **Where the money went** (8 col). A left-to-right flow: Income bar
   splits into Spending, Investing, Debt repaid, Saving, Left over
   (recharts Sankey or a hand-built stacked flow; Sankey if it reads
   well at card size). Hover a band for the amount and the planned
   amount for pockets. Click a band to focus the flow.
3. **Pockets** (4 col). One row per pocket: emoji, name, this cycle's
   movement, planned amount, and an "extra" badge (green when more went
   to a loan or investment than planned, amber when less). Click to
   focus the pocket; the list below shows its rows.
4. **Categories** (8 col). Treemap of spending by top-level category,
   sized by amount, tinted by category color. Click a tile to zoom into
   its sub-categories (animated), breadcrumb to go back. Hover shows the
   shared tooltip. A toggle switches treemap to a horizontal bar list
   with budget markers for people who prefer bars.
5. **What changed** (4 col). Categories sorted by absolute delta vs the
   comparison, each with a 6-cycle sparkline and a signed amount. This
   is the "what needs attention" list; click to focus.
6. **Cycle over cycle** (full width). 12 cycles of stacked bars by
   top-level category, income as a line on top. Hover a segment for the
   category in that cycle; click a bar to change the period; click a
   legend entry to focus the category across all bars. With a category
   focused, the bars re-stack by its sub-categories.
7. **Target adherence** (6 col). Per budgeted category a bullet bar
   (spent, budget, pace marker) and a 12-dot history strip (under /
   over per cycle). A single adherence score for the cycle at the top.
8. **Recurring** (6 col). Detected monthly repeats (same merchant,
   similar amount, ~30-day spacing): subscriptions, rent, standing
   orders. Total per cycle and "new since last cycle" and "missing this
   cycle". Detection is a query, no new tables.
9. Keep, moved down: **Needs attention** (uncategorized, flagged) and
   **Bank health**. Recent transactions and top merchants go away; the
   focus chip plus "Open in transactions" replaces them.

Empty and partial states matter: with one cycle of data, comparison
sections show "collecting history" rather than zeros.

### New queries (server)

One endpoint, `GET /api/insights?cycle=&compare=&focus=`, returning all
sections in one payload like `/api/home` does today, with per-section
errors. Under it, in `src/server/db/queries/insights.ts`:

- `spendByDay(range)`, `spendByCategory(range, depth)`,
  `spendByCycle(cycles, groupBy)`, `pocketMovements(range)`,
  `flowSummary(range)`, `recurringMerchants(range)`,
  `adherenceHistory(cycles)`.
- All built on one `flowCase` SQL fragment so the money model is defined
  once.

## Transactions v2 (the email client)

### Layout

Three panes, resizable, remembered in localStorage:

- **Left rail (folders and views)**: Inbox (uncategorized + flagged +
  low-confidence), All, Not counted, Manual, then Pockets, Cards, Tags,
  Saved views. Each with a count badge. Collapses to icons.
- **Center list**: dense rows grouped by day with a sticky day header and
  a day subtotal. Infinite scroll replaces pagination. Row: checkbox
  (visible on hover or when a selection exists), emoji + category,
  description, memo (muted, truncated), tags as tiny chips, card, amount
  (serif, red for spending, green for income, muted for flows that do
  not count). Not-counted rows keep the reduced opacity and the reason
  chip.
- **Right detail pane**: opens on Enter or single click of the
  description; selection is checkbox / Ctrl / Shift as today. Contents:
  editable category (tree picker with search and recents), kind and
  pocket, tags, note, split editor, the raw bank fields, a
  "same merchant" strip (count, average, 12-cycle sparkline, "apply this
  category to 14 other rows" as an explicit checkbox), and the actions:
  exclude, delete (manual only), create rule, open merchant.

### Toolbar

Search box with a small query language parsed into the existing filters:
`amount>500`, `card:visa`, `cat:groceries`, `tag:berlin`, `is:manual`,
`is:uncategorized`, `pocket:loan`, `before:2026-08-01`. Plain words
search description and memo. The inline filter bar from v1 stays for
mouse users and stays in sync with the query text. Sort menu (date,
amount, merchant, category, card), group-by (day, merchant, category),
density (comfortable / compact), column picker. "Save view" stores the
current query + sort as a left-rail entry.

### Selection and bulk actions

Existing bulk bar plus: **Add tag**, **Move to pocket**, **Split** (one
row only), **Create rule from selection**. Keyboard: `j`/`k` move,
`x` toggle select, `Enter` open detail, `c` category picker, `t` tag
picker, `e` exclude, `r` new rule, `Esc` clear, `?` help sheet.

### Manual and cash entries

- Quick add: an inline row at the top of the list (like compose in
  mail), Tab through date, description, amount, category, `Enter` saves,
  the row stays for another entry. The dialog stays for the full form.
- Manual rows show a pen icon in the source column and are the only
  deletable rows (as today).
- Recurring manual entries (rent paid in cash): a rule of type
  "schedule" that creates a manual row each cycle, marked pending until
  the user confirms. Last in the phasing; only if wanted.

### Rules engine

From v1 section A, unchanged in shape, now with tags and pockets:

```
rules (
  id, workspace_id, name, priority, enabled,
  match_description TEXT NULL,  -- contains | equals | regex
  match_mode TEXT,
  provider TEXT NULL, account_number TEXT NULL,
  amount_min REAL NULL, amount_max REAL NULL,
  set_category_id INTEGER NULL, set_kind TEXT NULL,
  set_excluded INTEGER NULL, set_pocket_id INTEGER NULL,
  add_tag_ids TEXT NULL,        -- JSON array
  created_at, updated_at
)
transactions.rule_id INTEGER NULL   -- which rule last touched the row
```

- Rules run on sync before AI, in priority order, first match wins per
  action field.
- Editor opens pre-filled from a selection (common merchant, provider,
  amount span) with a live "matches N existing rows" count and a preview
  list; "apply to existing" is a checkbox, default on, that skips rows
  the user categorized by hand.
- Rows touched by a rule show a rule chip; clicking it opens the editor.
- `excluded_merchants` migrates into rules with `set_excluded = 1`.
- Rules live in settings and in the left rail ("Rules" with counts).

### Categories management (settings)

Since the user tags by hand, the category tree must be a pleasure to
maintain: drag to re-parent, inline rename, merge two categories
(re-points rows and rules), archive instead of delete when rows exist,
per-category page showing cycle history and top merchants. Emoji and
color pickers already exist.

## Phasing and branches

Rule: one feature branch per phase off `main`, PR into `main`, delete on
merge. Never stack phases on one branch. Docs-only changes (this file,
ROADMAP) go straight onto `main` or ride with the phase they describe.

0. **Merge what is done.** `feature/transaction-interface` is eight
   commits ahead of `main` and clean. Merge it (`gh pr create` then
   merge, or fast-forward), so every new branch starts from the current
   transactions work. Commit this document as part of that merge or as
   a docs commit on `main`.
1. **`feature/money-model`**: migration 027 (pockets, `pocket_id`,
   splits, tags), `flowCase` fragment, cycle helper, pocket and tag
   settings pages, pocket and tag actions in the row menu and bulk bar,
   KPI cards on the transactions page rewritten in terms of flows. No
   dashboard changes yet. Small and unblocks everything after it.
2. **`feature/insights-dashboard`**: `/api/insights`, new Home with the
   nine sections, focus and compare model, deep links into transactions,
   rename `/budget` to Targets and `components/dashboard` to
   `components/budget`. Biggest visible win, so it goes before the
   transactions rewrite.
3. **`feature/transactions-v2`**: three-pane layout, detail pane,
   infinite scroll with day grouping, query language, saved views,
   keyboard model, quick add, tag and pocket bulk actions, split editor.
4. **`feature/rules`**: rules table and engine, editor with preview,
   create-from-selection, rule chips, `excluded_merchants` migration.
5. **`feature/categories-settings`**: drag re-parent, merge, archive,
   per-category page. Can run in parallel with 3 or 4.
6. **Polish**: recurring manual entries, keyboard help sheet, motion
   pass, mobile layout of the three panes (list only, detail as sheet).

Each phase ships on its own and leaves `main` usable.

## Open questions

- Sankey vs stacked flow for "where the money went": prototype both on
  real data before committing; Sankey wins only if it stays legible at
  card width.
- Should a loan pocket carry an opening balance so the dashboard can
  show remaining debt? Flow-only for now; balances need reconciliation.
- Automatic principal/interest split from bank data: research per bank
  after phase 1.
- Multi-currency display: out of scope, unchanged from ROADMAP.

## Shipped so far (v1 summary, 2026-09-05)

Phase 1 of the v1 plan shipped in six waves on
`feature/transaction-interface`: row selection with Shift ranges and
select-all-matching, floating bulk bar (categorize, set kind, exclude,
include), kind-based KPI totals, reason chips and reduced opacity on
not-counted rows, searchable category picker with inline create and
parents at any depth, per-transaction notes, manual cash entries with
delete, card nicknames, card type and billing day, an inline filter bar
(kind, category, card, amount, dates, not-counted), auto-detected card
billing duplicates hidden from the list, transaction dates normalized to
Israel-local days, editable category palette and emoji, and loading
feedback on connection tests. Single-row category edits no longer
cascade to merchant history; retroactive apply returns as an explicit,
previewed action (detail pane checkbox and rules).

Existing groundwork the plan builds on: `kind` and `kind_source`
(migrations 008, 021), `is_excluded` and `excluded_merchants` (020),
budgets with `budget_mode` and `payday_day` (004, 012), category
hierarchy (016), workspaces (013), cards (025, 026), recharts as a
dependency, `/api/home` as the per-section payload pattern.
