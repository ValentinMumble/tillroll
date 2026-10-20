# 💸 Tillroll

Your Revolut spending by week, month, year or all time, by store and by category. Tillroll compares each period with
your usual one (or, for the current period, with the previous one at the same point) and points out what changed:
the categories that moved, your top store, new stores, the biggest payment, your big spending day and the payments
that come back every month.

## Two ways in

- **A Revolut statement**, for anyone. In the Revolut app: open the account, tap ···, then Statement, and pick Excel
  (or CSV) and the months you want. The page reads the file (CSV or `.xlsx`) in the browser and keeps it in
  localStorage. Nothing is uploaded. Importing more statements adds to the earlier ones without counting a payment
  twice. There is also a sample data set (made up, built in the browser) to try the site.
- **A live connection to Revolut**, for the site owner. Revolut has no API for personal accounts, so Tillroll goes
  through Open Banking with [Enable Banking](https://enablebanking.com). Its free "restricted" mode only reads the
  accounts the application's owner linked themself, so on a public site the live sync is the owner's. Anyone can run
  their own copy to sync their own account (see below). Revolut shares the last two years through Open Banking: for
  older history, import statements as the owner too.

## What counts as spending

Each payment gets a store name (cleaned from the bank text: `SUMUP *CAFE DU COIN 75011` becomes `Cafe Du Coin`) and a
category, in this order:

1. the category you picked by hand for that store (it applies to all its payments);
2. the kind of movement: money in, top-ups, exchanges and cash withdrawals;
3. keywords in the store name (`src/categories.ts`), so rent paid by transfer still counts as Home and rent;
4. other transfers go to Transfers and savings;
5. the merchant category code (MCC), when the bank sync gives one;
6. Other.

Transfers, savings and money in are not spending: the summary shows them apart. Refunds lower the spending of their
category. Pending payments count, with a tag.

**Stores to sort** (next to the period switch) goes through the stores Tillroll is unsure about, biggest first: no
clue from the bank, only the broad shop merchant code, or a transfer to someone. Each card shows the bank's own texts;
one tap on a category files every payment of that store, past and future, and a store can be renamed or given a new
category on the spot.

**Edit categories** renames a category, changes its icon or whether it counts as spending, and adds new ones (also
from a payment's category list, which then files that store there). **Edit stores** lists every store: rename it, pick
its category, or tick the ones that are the same place to merge them under one name. A rename is a merge into the new
name, so both can be undone. The owner's choices are kept in the site store, so they follow to every device; a
visitor's stay in their browser.

## On the iPhone

In Safari, Share, then Add to Home Screen: Tillroll opens full screen like an app, with a tab bar for its four
sections (Overview, Categories, Stores, Payments). A home-screen app keeps its own cookies, apart from Safari's: the
owner enters their key once there, through the Owner key link at the bottom of the page.

## Run your own

You need an Enable Banking account (free), a Vercel account (free) and about 15 minutes.

1. **Fork this repository** and import it in Vercel. In the project's Storage tab, add an Upstash Redis store: Vercel
   adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
2. **Register an Enable Banking application** in the [Control Panel](https://enablebanking.com/cp/applications):
   - environment: Production;
   - let the page generate the key: it downloads `<application id>.pem`, keep it safe;
   - redirect URL: `https://<your site>/api/callback` (Enable Banking refuses `http://` and local addresses);
   - the privacy and terms links and the email are not checked in restricted mode.
3. **Activate it by linking your accounts**: "Activate by linking accounts" in the Control Panel, log in to Revolut and
   link every account you want to see. The application can then read those accounts, and only those.
4. **Set the variables** in Vercel (see `.env.example`):
   - `OWNER_KEY` and `CRON_SECRET`: two long random strings (`openssl rand -hex 32`);
   - `ENABLE_BANKING_APP_ID`: the application id;
   - `ENABLE_BANKING_PRIVATE_KEY`: the content of the `.pem` file;
   - `BANK_COUNTRY`: the country Enable Banking lists your Revolut under, like `FR` (default) or `SE`. Another bank
     works too: set `BANK_NAME` to its name as Enable Banking lists it;
   - `ENABLE_BANKING_REDIRECT_URL`: `https://<your site>/api/callback`. Production would find it alone, but with it
     set, a local copy pulled with `vercel env pull` sends the bank back to the site too.
5. **Connect**: redeploy, open `https://<your site>/#owner=<OWNER_KEY>` once and click Connect Revolut. Revolut asks
   you to approve in its app, then sends you back.

Owner mode is a cookie: the page sends the key to `POST /api/login` once, and the server answers with an HttpOnly,
Secure cookie that lasts a year (derived from `OWNER_KEY`, so changing the key signs every browser out). Cookies set
by the server keep their lifetime in Safari, unlike the page's own storage, which Safari clears after 7 days without a
visit. Each browser needs the key once: the `#owner=` address, or the Owner key link at the bottom of the page. Leave
owner view, at the bottom too, ends it.

The first sync runs right after you connect and fetches as far back as Revolut allows: many banks give the full
history only in that first hour. Then a sync runs every day at 05:00 UTC (Vercel Cron, `vercel.json`) and each time
you open the page, when the last one is more than 6 hours old. For older history, import statements: where they
overlap the bank's history, the bank's rows win.

The access lasts as long as the bank allows (often 180 days). After that the page offers to reconnect. Banks allow a
few background syncs a day (often 4); syncs you start from the page do not count against that.

## How it works

- `api/`: Vercel functions. `login` and `logout` start and end owner mode, `connect` starts the bank authorization, `callback` takes the bank's answer and runs the
  first sync, `sync` runs a sync (the daily cron or the owner's page), `data` returns the owner's transactions, `rules`
  saves a category picked for a store, `categories` saves the categories changed or added, `merges` merges or
  separates stores, `import` saves the owner's statement rows, `disconnect` ends the access.
  `_lib/bank.ts` talks to Enable Banking: requests are signed with the application's key (an RS256 token made with
  `node:crypto`, no library).
- Redis keys, all `tillroll:*`: the bank session, the booked transactions by id, the pending ones from the last sync,
  the category picked per store, the categories changed or added, the stores merged and the time of the last sync.
- `src/`: the React page. `statement.ts` reads the Revolut files, `stores.ts` and `categories.ts` name and sort the
  payments, `report.ts` builds the totals, the chart series and the insights, `sample.ts` makes the sample data.
- Visitors' data never reaches the server: no route accepts it without the owner's cookie (or the key).

## Develop

```sh
npm install
npm run dev   # http://127.0.0.1:5192, serves api/ too (local-api.ts)
```

The visitor side needs nothing else. For the owner side, pull the variables with
`vercel env pull .env.local --environment=production` and open `http://127.0.0.1:5192/#owner=<OWNER_KEY>`. Local and
production share the Redis store, so they show the same data. Enable Banking only sends the bank's answer to an https
address: Connect Revolut from local goes through the production callback and lands on the site.
Before a commit: `npm run format`, `npm run lint` and `npm run build`.
