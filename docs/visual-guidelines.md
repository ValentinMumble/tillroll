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
- The theme is **iOS**, on every screen: the grouped grey page (`--page`, black in dark mode), plain white cards
  (`--glass`; in dark mode a deep indigo a little darker than iOS's grey, with a faint light edge, its greys leaning
  indigo) with no shadow, the system blue (`--accent`) for actions only, and iOS's
  greys for secondary text (`--muted`), hairlines (`--line`) and control fills. Charts of a single series use the
  blue (`--bar`, `--bar-strong` for the fixed part of a column). The calendar uses the blue ramp `--heat-0` to
  `--heat-5`.
- Where iOS's own colour is too faint for text (its blue, red and green in light mode, its secondary grey), the token
  is the nearest shade with 4.5:1 on the page and on a card. A filled control under white text (a primary button, a
  count) takes `--accent-fill`, a deeper blue in dark mode, where iOS's light blue would fall short.
- Controls are iOS's: buttons, fields, selects, chips and the stepper sit on a grey fill (`--fill`, `--fill-strong`
  while pointed at) with no border; a plain button's text is blue, a primary one is blue with white text. The
  segmented control is a grey track (`--track`) with the chosen part on a raised thumb (`--thumb`); in dark mode the
  thumb is the cards' indigo on a darker track.
- Glass is for what floats over moving content only (the tab bar, dialogs, menus, the selection bar):
  `--glass-strong` with `backdrop-filter: var(--blur)`, a light top edge, as iOS 26's bars. The period bar at the top
  takes the page's own colour, like the status bar above it, and blurs what passes under it. The tab bar's lens is
  neutral grey, only the chosen tab is blue. The tab bar is the clearest glass, the same recipe as the docks of
  Statva, Chords and hk: the page's colour at 30%, a sheen across the top, a bright rim above and below, a light blur
  (`--dock-sheen`, `--dock-edge`), so what scrolls under it shows through, as under iOS 26's tab bar. With "Reduce
  transparency" on, glass turns solid.
- Text keeps 4.5:1 on the page and on a card: check any new colour against both.

## Type

- Body: the system's own type (San Francisco on Apple devices, `--font-body`), 15px, line height 1.5, on every screen.
- Hints and secondary facts: `.hint` or `.muted`, 13px, `--muted`.
- Card titles: `.card h2`, 20px, bold, sentence case, `--ink`, like an iOS app's section titles.
- Dialog titles: 18px.
- Amounts in tables and lists: `font-variant-numeric: tabular-nums`. Always format money with `money()` from
  `src/format.ts`.
- What the bank wrote (a payment's raw text): the system's monospaced type (SF Mono, IBM Plex Mono elsewhere,
  `--font-mono`). Amounts, days and times stay in the body type with even-width digits.
- The wordmark is the system's type too, bold and lowercase: tillroll. The phone's large titles match its type:
  tillroll on the overview, the view's name with its capital on the others (Payments, Categories).
- In the app the logo is three bars in `--cat-1`, `--cat-2` and `--cat-3` beside the full name
  (`src/components/Logo.tsx`), and the browser tab shows the bars (`public/favicon.svg`).
- The app icon (the iPhone's home screen and the web app, `public/apple-touch-icon.png` and `public/icon.png`) is a
  lowercase t in San Francisco Bold, white, beside the three coloured bars, on black, full bleed (iOS rounds it). Only
  the icon uses the t. It is drawn in `design/app-icon.svg`: change that, then run `sh design/render-icons.sh`
  (headless Chrome) on a Mac, where the system type is San Francisco, to render both PNGs.

## Shape and space

- Cards: `.card`, 20px padding, `--radius` (20px), flat on the page (`--shadow` is none).
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
  should land. What a period put in savings is stacked on top (`--saved`, the savings gold: no category and neither
  blue comes near it, for any eye), 2px above the spending or its dashed outline, on the same scale; only the top of the stack is rounded. A
  period that took more back from savings has nothing on top: its tooltip says how much. The chosen period has a
  shaded band behind its column, not a different colour.
- The tooltip says everything a column shows, plus its top three categories. The keys sit in one wrapping row under
  the chart.
- Every chart's tooltip is a `ChartTip`: the period or part first, in bold, then one line per fact, as wide as its text. It
  shows on hover, and a tap shows and hides it on a phone. Never a `title` on a column.
- A category's or a store's small trend line in the lists curves through its periods with a soft fill in its colour. The period
  still going joins it dashed, and a faint dashed line marks its usual (its tooltip gives the amount).
- Money that goes both ways (what a period kept or spent beyond what came in, what a month put aside or took back
  from savings) is a bar up from a middle line or down below it. Savings' "Put aside" chart is gold (`--saved`) both
  ways, and its tooltip splits a month by account.
- A savings account's value over time is a smooth line through the values typed (`monotonePath`: it never swings
  past a value nor folds back where values sit a day apart), dots at least 4% of the width apart. It goes back 3
  months, 1 year or all the way (a year-end value from a statement would squeeze the latest into a corner), opening on
  the shortest range with two values. The values typed fold under "Values typed (11)", open while there is none: the 6
  latest, newest first, then "Show all 11".
- Money shows each figure once. Money in and out's header says what was kept and how much of it went to savings; its
  three figures (came in, spent, to savings) stand alone only for all time, since the flow names them for a month or a
  year. One Net worth card lists each bank and each savings account (≈ when estimated). Put aside alone shows savings
  month by month; an account card gives what was paid in, in all and year by year, in one line.
- An assurance vie with statements (`StatementSection`) adds, under its value chart: a table year by year (paid in,
  fees, interest after social charges, its value at the year's end, what it grew), its funds at the latest statement
  (6, then "Show all 34 funds"), and every line of the statements, folded. Its growth counts from the first payment
  when the statements start at nothing.
- Where it went (Money in and out, for a month or a year) is a flow: what came in on the left (pay in
  `--bar-strong`, other money in in `--bar`, what was taken from savings or the balance in grey) runs through one
  `--axis` pool to each category in its colour, to savings (`--saved`) and to what is left (`--bar`) on the right. Bands are the
  part's colour at 30% (55% hovered), every part is named with its amount beside it, and its tooltip gives its share.
  Six categories at most; the rest, and any under 3% of the spending, join a grey "Other spending".
- The trips map (Trips, above the trips side by side) is Leaflet on Esri's light or dark grey tiles (no key), as the page is:
  a blue bubble a trip (`--bar` at 55%, a `--bar-strong` ring), its area as big as what the trip cost, a tooltip
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
  any other way: it would miss these. They are all the same size: 720px wide at most and 860px tall at most. Never set
  a width on one dialog.
- On a phone (560px and below) every dialog is an iPhone sheet: full width from the bottom edge, round top corners, a
  grabber on top. Dragging its top down closes it (`useDialog`), like the ✕ and a tap above it.
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
2. The prompts, when there is something to do: stores to sort, payments to check. Each opens its deck, one store
   or one payment at a time (the payments to check start on "This payment" for a transfer to someone, else on
   "Whole store"); the payments' deck links to the same payments in the list.
3. The latest payments, whole days only (at least the last 3 days, and more days until there are at least 8
   payments), under day headings like the payment list's ("Today", "Yesterday", "Mon 12 Oct"), with what
   went out that day on the right when it had more than one payment. They show everything that moved, money in
   and moves between my accounts too, with no switches: those are the payment list's.
4. For a year only, "Your 2025": the year in a few numbers, as the fun stats' tiles (what it cost against the
   year before, what was kept when the pay is in the data, the biggest month, top category and places, new places,
   trips, trains, the biggest day and the dearest weekday).
5. Everything else: the period chart, top categories and stores, budgets, fixed and flexible, regular payments,
   insights. Money in and out lives in Money, above the savings.

## Phone (560px and below)

- Wide screens (over 960px) pick the view in the sidebar; narrower ones in the frosted tab bar at the bottom, or with
  a sideways swipe on the view: to the left for the next tab, to the right for the one before (`TabBar`). Not from
  the screen's sides (Safari's back and forward), nor on a field, the map or a row that scrolls sideways, nor on a
  view from the ⋯ menu.
- During a swipe the view and its large title follow the finger at half speed, fading a little (barely moving toward
  a side with no more tabs), and the page stops scrolling. Let go far enough, they slide out (100ms) and the next
  tab's slide in from the other side (200ms, the lens's ease); not far enough, they spring back. The period bar and
  the tab bar stay put. Reduce motion: no follow, no slide.
- A sheet follows the finger when pulled down from anywhere on it, as long as what is under the finger is scrolled to
  its top, and closes when let go far enough (`useDialog`). A pull up or sideways scrolls its content as usual.
- Wherever the tab bar shows, Tillroll also behaves like an iPhone app (the last part of `shell.css`): a large title
  in the header next to the logo (the wordmark, tillroll, on the overview; the view's name on the others), and taps
  that dim a button or grey a row while pressed.
- The views come in two groups. Spending: Overview, Payments, Categories, Stores, Calendar (where the money goes,
  period by period). More: Money (money in and out, then net worth and savings), Trips (the map, the trips side by
  side, their facts, the trains) and Fun stats (the playful facts and hobbies). The sidebar shows the two groups under
  small headings like a card's title; the phone's tab bar holds Overview, Payments, Categories and Stores, and its
  ⋯ menu the rest. An old address keeps working: #savings opens Money.
- On a phone the main jobs are fixing categories and labelling: a tap anywhere on a payment opens its sheet, which
  holds its labels too. So a row is light, the same in the payment list and the latest payments, as in a bank's app:
  the category's emoji in a circle tinted in its colour on the left, the store and the amount, then the category's
  name and the time in small grey text under them. A row is always two lines: the store's name is cut short when
  long, and its tags and labels go on the second line after the category, on one line, each cut short when they do
  not fit (the sheet shows them whole, and takes a label off: no × on a row's chips). The bank's letter sits on the
  circle's corner. No pill, no tick, no search link, no #. A pending payment has its
  amount in grey and "pending" after its category instead of a tag. Day headings drop their colour strip.
- On a phone the payment list has one row of controls above it: the search, "to check" and Filters, which opens the
  sort, the switches, the category and the bank under them, with a count of the ones not at their usual setting.
- On a phone the period bar is one row: the lengths on the left, the stepper on the right. Keep it narrow enough for
  a 360px screen.
- Anything a row's buttons do on a computer must also be reachable from the sheet or the store's dialog: the sheet
  for one payment holds its labels too.
- The category sheet for one payment asks where the choice applies in one switch, equal parts side by side: Whole
  store, From here on, This payment, with a line under it saying what changes. It starts on the choice picked last,
  never on From here on (a rare choice that leaves the earlier payments as they were).
- A label field offers the labels in use as chips to tap, under it in the sheet and beside it in a row: the ones
  matching what is typed (starting with it first), the most used while it is empty, six at most. Never a browser
  datalist, which a phone hardly shows.
- The home-screen app has no browser around it, so it has its own pull to refresh at the top of the page
  (`PullToRefresh`): it syncs the banks for the owner and loads the page again for anyone else. The logo's bars are
  its only sign: they shorten as the finger pulls, down to dots at the line, then move while the sync runs. The
  logo is the one loader, never a spinner or a second circle.
- So the home-screen app's header has no Sync button: a pull syncs, and "Sync now" stays in the ⋯ menu. A Safari tab
  keeps the button, since Safari's own pull only reloads the page.
- Once payments are on screen, new ones on their way (the owner's first load after the copy kept on the device, or a
  sync) show as the logo's bars shortening and growing back in turn (`<Logo busy>`), never a spinner or a banner over
  the page. The skeleton is only for a first load with nothing kept. On a phone, once the header has scrolled away,
  the moving logo hangs in a small circle under the period bar (`FetchingMark`), so it stays in view.

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
