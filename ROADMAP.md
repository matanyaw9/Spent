# Project Roadmap

Personal fork of [Spent](https://github.com/Shaya16/Spent) (matanyaw9/Spent), extended into a
family finance dashboard. Base currency NIS. Data comes in via `israeli-bank-scrapers`
(the only viable automated path in Israel; open banking is licensed-entities-only).

## Decisions made

- **Build on Spent**, not from scratch and not on Firefly III / Actual Budget.
  Closest existing project to the requirements; clean codebase; we own maintenance.
- **TypeScript end-to-end.** The scraper library is Node; Rust would add a sidecar
  seam for no benefit here.
- **Scraping as primary ingestion**, CSV import + manual entry to be added later
  (also the only way to itemize Bit/PayBox, which have no scrapers).
- **Multi-currency aggregation deferred.** Foreign purchases on Israeli cards are
  already correct in ILS. Real foreign-currency accounts exist but wait.
  Original-currency *display* is still a cheap early win.
- Dedup philosophy: never silently exclude spending. A card charge that matches no
  tracked card stays counted and gets flagged, not hidden.

## Done

- [x] Evaluated landscape (Firefly III, Actual, Sure, Ghostfolio, Caspion, moneyman)
      and the Spent codebase; picked Spent.
- [x] Phase 0 validation: scrapers work against real accounts (Discount + Cal).
- [x] Forked to matanyaw9/Spent, upstream remote kept.
- [x] Bumped `israeli-bank-scrapers` 6.7.4 → 6.9.0 (fixed Discount login;
      Isracard bot-detection workaround; Max login fix).
- [x] Test infrastructure: vitest + first 11 tests (`npm test`).
- [x] **Card-aware transfer detection** (the double-count fix):
      bank charge lines are matched against the cards actually tracked
      (by card number, then company keyword). Tracked → transfer;
      untracked → stays counted as spending + flagged for review.
      Covers Discount pending aggregates (חיוב זמני למפתח) and
      Max's current bank-statement name (מקס איט פיננסים).
      Runs after every sync and on server startup. `kind_source` column
      protects manual kind changes from the auto pass.
- [x] **Retroactive categorization**: manually categorizing a transaction also
      applies to the merchant's existing uncategorized/AI-categorized transactions
      (merchant memory already covered future syncs).

## Next (in order)

1. **Transactions area, email-style UI** (one branch, probably in steps):
   - Multi-select transactions (checkboxes) + bulk actions: label/categorize
     together, bulk exclude, bulk kind change.
   - Show/hide toggle for transfers and excluded rows.
   - When shown, aggregates/transfers rendered de-emphasized (grayed out) to
     signal "does not count toward totals".
   - Apply-to-merchant becomes visible + reversible: toast
     "Also applied to N other transactions — Undo".
2. **Category picker polish**: search box, pick color/icon when creating,
   create-from-picker flow.
3. **Rules engine** (Outlook-style): condition on description/amount/provider →
   set category/kind/exclude. Solves generic descriptions like a rent check
   (משיכת שיק + amount 4800 → rent). Schema groundwork exists
   (`excluded_merchants` is a primitive rule table).
4. **Small cleanups**: `timeZone: "Asia/Jerusalem"` for next-intl,
   middleware → proxy rename, replace Google favicon fetch with local bank PNGs
   (privacy), fix duplicate migration number 020.
5. **Cycle reconciliation (the verifier)**: per billing cycle, check
   sum(card transactions) == bank charge; surface discrepancies.
6. **CSV import + manual entry**: unscrapeable money (cash, Bit/PayBox detail).

## Later / ideas

- Original-currency display on foreign purchases; then true multi-currency
  (FX table, per-account currency) when foreign accounts join.
- Better trends: YoY comparison, category drilldown over time, planning ahead.
- Subscription detection ("small payments I forgot I'm paying").
- Investment accounts (IBKR transfers currently just excluded) + interest/debts.
- Splitwise-style shared bills.
- LICENSE: upstream README says MIT but the file is missing — open an issue
  asking Shaya16 to add it before publishing this fork's changes.
- Consider PRs upstream: scraper bump, מקס איט pattern, card-aware detection.
- Long term: "app my mom could use" (packaging, zero-config setup).

## Operational notes

- Dev: `npm run dev` → http://127.0.0.1:3000. Production service install:
  `npm run setup` (systemd user unit, port 41234) — do this once stable.
- DB: `data/spent.db` (SQLite). Backup = copy `data/`. Never commit `data/`.
- Most banks need bank-side 2FA disabled or "show browser" manual login per sync.
- When a bank scraper breaks, first try bumping `israeli-bank-scrapers`.
