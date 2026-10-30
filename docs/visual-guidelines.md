# Visual guidelines

How Tillroll looks and reads. Follow these for every screen, and update this file when a rule changes. The styles
live in `src/styles/`, one file per area, imported in order by `src/index.css` (the tokens are in `base.css`).

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
- The theme is **Liquid Glass over a dusk wallpaper**: a soft haze of lilac, pink and blue on a near-neutral page
  (`--wall`, still behind the page), violet (`--accent`) for actions only. Charts of a single series use the one violet (`--bar`, `--bar-strong` for the fixed part of a column). The
  calendar uses the violet ramp `--heat-0` to `--heat-5`.
- Glass: a card is `--glass` under `--glass-sheen` (see-through, light catching its top left, no blur: nothing moves
  behind it). What floats over moving content (the tab bar, dialogs, menus, the selection bar) is `--glass-strong`
  with `backdrop-filter: var(--blur)`. Both have the bright top edge and inner rim of `--shadow`. The period bar at the
  top takes the page's own colour, like the status bar above it (near black in dark mode), and blurs what passes
  under it. Violet stays off the glass: the tab bar's lens is neutral grey, only the chosen tab's icon is violet. Controls inside (fields, buttons, chips) stay solid
  `--surface`. With "Reduce transparency" on, glass turns solid and the wallpaper goes.
- Text keeps 4.5:1 both on the glass and on the bare wallpaper (the header and the sidebar sit on it): check any new
  wallpaper or glass value against the wallpaper's brightest spots.

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

### Charts

- A reference line says its amount ("usual €4,312"), never just its name.
- A trend is a dashed curve over the columns (`TrendLine`) through each full period's average with its neighbours,
  so it bends with the real ups and downs; the key under the chart says its overall direction in words ("Trend
  (3-month average): up about €95 a month", or "flat").
- The month chart's columns: the fixed part (`--bar-strong`) at the bottom, flexible above (`--bar`); a short `--ink`
  tick at what the same period cost a year before; for the period still going, a dashed outline up to where it
  should land. The chosen period has a shaded band behind its column, not a different colour.
- The tooltip says everything a column shows, plus its top three categories. The keys sit in one wrapping row under
  the chart.
- Every chart's tooltip is a `ChartTip`: the period or part first, in bold, then one line per fact. It shows on
  hover, and a tap shows and hides it on a phone. Never a `title` on a column.
- A category's or a store's small trend line in the lists curves through its periods with a soft fill in its colour. The period
  still going joins it dashed, and a faint dashed line marks its usual (its tooltip gives the amount).
- Money that goes both ways (what a period kept or spent beyond what came in, what a month put aside or took back
  from savings) is a bar up from a middle line or down below it. Savings' "Put aside" chart is violet both ways, and
  its tooltip splits a month by account.
- Where it went (Money in and out, for a month or a year) is a flow: what came in on the left (pay in
  `--bar-strong`, other money in in `--bar`, what was taken from savings or the balance in grey) runs through one
  `--axis` pool to each category in its colour, to savings and to what is left (`--bar`) on the right. Bands are the
  part's colour at 30% (55% hovered), every part is named with its amount beside it, and its tooltip gives its share.
  Six categories at most; the rest, and any under 3% of the spending, join a grey "Other spending".
- The trips map (Trips, above the trips side by side) is Leaflet on Esri's light or dark grey tiles (no key), as the page is:
  a violet bubble a trip (`--bar` at 55%, a `--bar-strong` ring), its area as big as what the trip cost, a tooltip
  like `ChartTip`, and a click shows the trip's payments. It opens on the trips in and around Europe. A trip's place
  is set in its dialog (a name, found with OpenStreetMap); a note under the map counts the trips with none.
- Trips side by side (Trips) are one bar each, as long as the trip cost against the biggest, split by category in
  the categories' colours with 2px gaps; categories under 8% of a trip join one grey "Other" part. Each part has its
  tooltip, the categories are named under the bars, the list sorts by Latest, Biggest or A day, and a trip's name
  opens its payments. A trip with payments on few of its days says "to complete" and is left out of the costs a day.

### Tags

- Refund and payback tags (`RefundTags`) look the same wherever a payment shows: the payment list and the overview's
  latest payments. A payment's "paid back" or "refunded" tag names what gave it back on hover and opens its sheet,
  which lists them ("Paid back by", with Unlink).
- A label marked as a trip wears a light orange tint (`.label-chip.is-trip`, the `--trip` token at 26% with the text
  in `--ink`) wherever its chip shows, apart from the other labels' accent, and drops the # (its colour says it is a
  trip); in the Labels card its name has a light orange dot instead of the #, like the "Trips" switch.
- A bank payment that paid a PayPal purchase says "via PayPal": it is a move between one's accounts, and the purchase
  counts at its shop, on the PayPal line.

### Buttons

- `.button.is-primary`: the one main action of a dialog (Save), at the right end of the footer.
- `.button.is-quiet`: a secondary answer in a deck (Back, Later). Never Cancel or Close: the ✕ does that.
- `.link-button`: secondary actions, in card heads, inside lists (Separate, Undo, Merge into this) and on the left of
  a dialog footer for "go somewhere else" (`.store-dialog-more`: "Merge with other stores…", "See its payments").

### Dialogs

- Every dialog is a `<dialog className="dialog ...">` opened through `useDialog()` (it opens as a modal, Escape
  or a click outside it on the dimmed page closes it, and the focus lands on the first field). Never open a modal
  any other way: it would miss these. They are all the same size: 720px wide at most and 860px tall at most, less 16px on each side on a
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
- Footer (`.dialog-foot`, a hairline on top): actions at the right, a "go elsewhere" link at the left. No Cancel or
  Close button: the ✕ closes without saving. A dialog with nothing left to do has no footer.
- One dialog at a time: a dialog that opens another gives it its place (`setDialog({type: ...})`), it never stacks.
- Two short fields (a name and a category) sit side by side on a wide screen and one above the other on a phone.
- Keep a dialog's first screen to what it is for. What comes after it (a store's payments, what the bank writes,
  merged names, look-alike stores) goes in `<details className="fold" open>`: one quiet line each with a chevron, under a hairline,
  open at first and folded with a tap.

### Lists of stores, payments, labels

- A row is: the name (in `--ink`, 500), then `N payments · €X` in `.muted`, then its action as a `.link-button` at
  the right end. Write "1 payment", never "1 payments".
- A ranked list only to read (the train lines in Trips) uses the breakdown's bars as `.bar-row.is-static`: no
  hover, no pointer.
- Groups of rows are split by a 1px `--line` hairline. A sub-list (the stores merged into one) is indented with a 2px
  `--line` rule on its left.
- Show a search field above a list once it has more than 8 items, and an `.empty` line when nothing matches.
- A filtered or searched payment list offers "See in context" on each day heading (on each date when sorted by amount
  or store). It shows every payment, all periods and categories, newest first around that day, with the filter's
  matches marked by an accent bar on the left, and a "← Back to the search" button that brings the filter back.
- Every dropdown has the `.select` look closed: same height, border, radius and caret. One choice is a plain
  `<select>` (a phone opens its own picker); several choices are a button opening a menu where a tick adds a choice
  and the name picks it alone (`CategoryFilter`), reading "All categories", one choice, or the first and "+ 2".
- The Labels card sorts by Latest, Biggest, Most used or A to Z (a small segmented control in its head), with its
  search under it once there are more than 8. A label made a trip keeps its line there; the trips themselves are in
  Trips, where a trip's name or bubble opens its dialog, and the count of payments in the dialog's head shows them.
- In the payment list, a category picked while a label, a trip or a store is the filter narrows it (a trip's eating
  out), with its counts taken within it; picking another label or store starts again with every category.
- In a dialog, a few short names that each take an action (merged names, look-alike stores) are chips with the
  action inside (`.name-chip`: ✕ to separate, Merge), not rows with the action at the far end of a wide line.
- A category always shows as its emoji and its name, with its colour as a dot or a tint.

## Overview

The overview answers "how is this month going?" first, above all on a phone, so its order is fixed:

1. The receipt: what the period has cost so far, against last month at the same point, and time against money as two
   rings (`PaceRings`): how much of a usual period was spent outside, how much of the period has gone inside, with what
   is left per day beside them. The balances (owner only) fill the space on its right: their total, then each bank's
   balance from its last sync. Under 720px they come last in the receipt, after the facts. The facts are four, in one
   row (two columns on a phone): payments with what a day cost beside them, money in, what was kept of it with its
   share (or what was spent beyond it), and what went to savings. On a phone what was kept sits under money in. A fifth
   figure joins one of these, never a new tile.
2. The prompts, when there is something to do: stores to sort, payments to check.
3. The latest payments, whole days only (at least the last 3 days, and more days until there are at least 8
   payments), under day headings like the payment list's ("Today", "Yesterday", "Mon 12 Oct"), with what
   went out that day on the right when it had more than one payment.
4. For a year only, "Your 2025": the year in a few numbers, as the fun stats' tiles (what it cost against the
   year before, what was kept when the pay is in the data, the biggest month, top category and places, new places,
   trips, trains, the biggest day and the dearest weekday).
5. Everything else: the period chart, top categories and stores, budgets, fixed and flexible, regular payments,
   insights. Money in and out lives in Money, above the savings.

## Phone (560px and below)

- Wide screens (over 960px) pick the view in the sidebar; narrower ones in the frosted tab bar at the bottom.
- The views come in two groups. Spending: Overview, Payments, Categories, Stores, Calendar (where the money goes,
  period by period). More: Money (money in and out, then net worth and savings), Trips (the map, the trips side by
  side, their facts, the trains) and Fun stats (the playful facts and hobbies). The sidebar shows the two groups under
  small headings like a card's title; the phone's tab bar holds Overview, Payments, Categories and Stores, and its
  ⋯ menu the rest. An old address keeps working: #savings opens Money.
- On a phone the main jobs are fixing categories and labelling: a tap anywhere on a payment opens its sheet, which
  holds its labels too. So a row is light, the same in the payment list and the latest payments, as in a bank's app:
  the category's emoji in a circle tinted in its colour on the left, the store and the amount, then the category's
  name and the time in small grey text under them. No pill, no tick, no search link, no #. A pending payment has its
  amount in grey and "pending" after its category instead of a tag. Day headings drop their colour strip.
- On a phone the payment list has one row of controls above it: the search, "to check" and Filters, which opens the
  sort, the switches, the category and the bank under them, with a count of the ones not at their usual setting.
- On a phone the period bar is one row: the lengths on the left, the stepper on the right. Keep it narrow enough for
  a 360px screen.
- Anything a row's buttons do on a computer must also be reachable from the sheet or the store's dialog: the sheet
  for one payment holds its labels too.
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
