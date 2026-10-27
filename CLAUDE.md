# Tillroll

Before changing anything the user sees (a view, a dialog, a style, a label), read
[docs/visual-guidelines.md](docs/visual-guidelines.md) and follow it. When a change sets a new visual rule, add it
there in the same commit.

The rules people forget most:

- Every dialog has a ✕ in its top right corner (`.dialog-close`), and all dialogs share one size: never set a width
  on one.
- Colours come from the tokens in `src/styles/base.css`, never a hex value. Category colours go on dots, bars and
  tints, never on text.
- Plain English everywhere, no em dashes.

## Code

- `rows.ts` turns transactions into rows (store names, merges, categories, PayPal and transfer pairing, refunds);
  `report.ts` builds a period's report from the rows. `useData.ts` holds the data and saves every change; `App.tsx`
  keeps the view state (tab, period, currency, filter, dialog) and lays out the views.
- Shared helpers: `text.ts` (`plain` for loose matching, `paymentCount`), `device.ts` (home-screen app, phone taps).
- `npm test` runs the Vitest tests (`*.test.ts`): add one when changing store names or the row pairing.
