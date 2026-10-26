# Visual guidelines

How Tillroll looks and reads. Follow these for every screen, and update this file when a rule changes. The styles
all live in `src/index.css`.

## Colours

- Use the tokens on `:root` (`--page`, `--surface`, `--surface-sunk`, `--ink`, `--ink-soft`, `--muted`, `--line`,
  `--axis`, `--accent`, `--up`, `--down`, ...). Never write a hex value in a component or a new rule. Each token has a
  light and a dark value (`prefers-color-scheme`), so a screen built from tokens works in both themes.
- **Categories have colours** (`--cat-1` to `--cat-8`, `--cat-grey`): built-in categories have a fixed slot, new
  categories take the next slot in turn, and Cash, Other and anything that is not spending are grey. Get one with
  `colourStyle(categories.colours[key])`, which sets `--cat` on the element.
- Category colours go on **dots, bars and tinted pills** only (`.cat-dot`, a bar's fill, a chip's background at
  `--tint`). Text never wears them: it stays in `--ink`, `--ink-soft` or `--muted`.
- Never let colour carry meaning alone: a category's colour always comes with its emoji or its name, and up or down
  (`--up` red for more spending, `--down` green for less) always comes with an arrow.
- The theme is soft lavender: a lilac page, white cards, violet (`--accent`) for actions. Charts of a single series
  use the one violet (`--bar`, `--bar-strong` for the marked period). The calendar uses the violet ramp `--heat-0`
  to `--heat-5`.

## Type

- Body: DM Sans, 15px, line height 1.5.
- Hints and secondary facts: `.hint` or `.muted`, 13px, `--muted`.
- Card titles: `.card h2`, 13px, 600, uppercase, letter spacing 0.08em, `--ink-soft`.
- Dialog titles: 18px.
- Amounts in tables and lists: `font-variant-numeric: tabular-nums`. Always format money with `money()` from
  `src/format.ts`.
- What the bank wrote (a payment's raw text): IBM Plex Mono (`--font-mono`).
- Space Grotesk (`--font-brand`) is for the "Tillroll" wordmark only. The logo is three bars in `--cat-1`, `--cat-2`
  and `--cat-3` (`src/components/Logo.tsx`, `public/favicon.svg`).

## Shape and space

- Cards: `.card`, 20px padding, `--radius` (20px), `--shadow`.
- Dialogs: 24px radius, 20px side padding.
- Buttons and chips are pills (radius 999px). Text fields and selects have a 10px radius and are at least 38px tall.
- At phone width keep a 16px gutter on each side and never scroll the page sideways.

## Building blocks

### Cards

A view is a stack of `.card`s. The `.card-head` holds the `h2`, then a `.hint` with the key number or what the card
shows, then the actions as `.link-button`s at the right end (`.card-actions` when there are several).

### Buttons

- `.button.is-primary`: the one main action of a dialog (Save), at the right end of the footer.
- `.button.is-quiet`: Cancel, just before it.
- `.link-button`: secondary actions, in card heads, inside lists (Separate, Undo, Merge into this) and on the left of
  a dialog footer for "go somewhere else" (`.store-dialog-more`: "Merge with other stores…", "See its payments").

### Dialogs

- Every dialog is a `<dialog className="dialog ...">` opened through `useDialog()` (it opens as a modal, Escape
  closes it, and the focus lands on the first field). They are all the same size: 720px wide at most and 860px tall at most, less 16px on each side on a
  small screen. Never set a width on one dialog.
- Every dialog has a **✕ in its top right corner**, right after the `h2` in the `.dialog-head`:
  ```tsx
  <button type="button" className="dialog-close" aria-label="Close" onClick={closeDialog}>
    ✕
  </button>
  ```
- Head: the `h2` title, the ✕, then a `.hint` that says what the dialog is for in one or two sentences.
- Body: when the content can be longer than the screen, only the body scrolls (`min-height: 0; overflow: auto`); the
  head and the footer stay in place.
- Footer (`.dialog-foot`, a hairline on top): actions at the right, a "go elsewhere" link at the left.
- One dialog at a time: a dialog that opens another gives it its place (`setDialog({type: ...})`), it never stacks.
- Two short fields (a name and a category) sit side by side on a wide screen and one above the other on a phone.

### Lists of stores, payments, labels

- A row is: the name (in `--ink`, 500), then `N payments · €X` in `.muted`, then its action as a `.link-button` at
  the right end. Write "1 payment", never "1 payments".
- Groups of rows are split by a 1px `--line` hairline. A sub-list (the stores merged into one) is indented with a 2px
  `--line` rule on its left.
- Show a search field above a list once it has more than 8 items, and an `.empty` line when nothing matches.
- A category always shows as its emoji and its name, with its colour as a dot or a tint.

## Overview

The overview answers "how is this month going?" first, above all on a phone, so its order is fixed:

1. The receipt: what the period has cost so far, against last month at the same point, and time against money: how
   much of the period has gone next to how much of a usual period was spent, as two lines, two bars or two rings (a
   switch picks one for now), with what is left per day under them.
2. Balances: each bank's balance from its last sync, and their total (owner only).
3. The prompts, when there is something to do: stores to sort, payments to check.
4. The latest payments.
5. Everything else: the period chart, top categories and stores, budgets, money in and out, fixed and flexible,
   regular payments, insights.

## Phone (560px and below)

- Wide screens (over 960px) pick the view in the sidebar; narrower ones in the frosted tab bar at the bottom.
- On a phone the main job is fixing categories: a tap on a payment opens the category sheet. Keep rows light (no
  ticks, no extra buttons on each row); the rest lives in the sheet or the store's dialog.
- Anything a row's buttons do on a computer must also be reachable from the sheet or the store's dialog: the sheet
  for one payment holds its labels, since a phone row has no # button.
- The home-screen app has no browser around it, so it has its own pull to refresh at the top of the page
  (`PullToRefresh`): it syncs the banks for the owner and loads the page again for anyone else.
- So the home-screen app's header has no Sync button: a pull syncs, and "Sync now" stays in the ⋯ menu. A Safari tab
  keeps the button, since Safari's own pull only reloads the page.

## Words

- Plain English, short sentences, sentence case. Name things the way a person would: payments, stores, categories,
  money in, moves between my accounts. No jargon, no em dashes.
- Hints say what a choice changes ("Separate a store to give it back its own name and payments").
- Numbers are written plainly: "7 payments · €408", "about €1,900 usually comes in".

## Accessibility

- Every button with only an icon or a symbol has an `aria-label` (the ✕ is "Close").
- Keyboard focus shows the `--accent` outline (`:focus-visible`); never remove it.
- Text keeps its contrast in both themes: only the ink tokens are used for text.

## Screenshots

Screenshots of the app (in the README, in a pull request, in a chat) use the sample data ("Try it with sample data"),
never real payments.
