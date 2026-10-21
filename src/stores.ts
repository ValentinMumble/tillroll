/**
 * A store name from the bank's text: "SUMUP *CAFE DU COIN 75011" and "Cafe du coin" become one store. The key,
 * lowercase without accents, groups the payments and holds the category picked by hand.
 */

/** Brands whose bank text varies a lot: the first match names the store. */
const BRANDS: [RegExp, string][] = [
  [/uber\s*\*?\s*eats/i, 'Uber Eats'],
  [/\buber\b/i, 'Uber'],
  [/amzn|amazon/i, 'Amazon'],
  [/apple\.com|itunes|apple services/i, 'Apple'],
  [/google\s*\*|google play|google one/i, 'Google'],
  [/netflix/i, 'Netflix'],
  [/spotify/i, 'Spotify'],
  [/deliveroo/i, 'Deliveroo'],
  [/airbnb/i, 'Airbnb'],
  [/booking\.com/i, 'Booking.com'],
  [/sncf/i, 'SNCF'],
  [/ryanair/i, 'Ryanair'],
  [/easyjet/i, 'easyJet'],
  [/mcdo(nald)?/i, "McDonald's"],
  [/strava/i, 'Strava'],
  [/eurail|interrail/i, 'Eurail'],
];

/**
 * Payment apps that put their name before the store's: "SUMUP *CAFE DU COIN", "SUM*ADDU MAMMA" (cut by the bank),
 * "SUNDAY*LA FELICITA" (restaurant bills), "TRIBEE*", "LSP*LE BATEAU-LAVOIR" (Lightspeed), and Shopify's "SP " and
 * HiPay's "HPY " with no star.
 */
const PROCESSOR =
  /^((sumup|sum|sq|zettle|izettle|paypal|pp|sp|stripe|lydia|zen|mollie|sunday|tribee|payplug|lyf|lsp)\s*[*_]+|(sp|hpy)\s+(?=\S))\s*/i;

/**
 * A French bank's card payment around the store's name: "CB CAFE POP FACT 270826 378902******7" (the day it was
 * paid, then the card). The card's own statement says "CAFE POP": both make one store.
 */
const CARD_PREFIX = /^CB\s+(?=\S)/;
const CARD_SUFFIX = /\s+FACT\b.*$/i;
const TRANSFER_WORDS = /^(to|from|payment from|transfer (to|from)|virement (à|a|de|vers)|paiement à)\s+/i;

/** Short all-caps names that are acronyms, not words: they stay as they are. */
const ACRONYMS = new Set(['EDF', 'GDF', 'RATP', 'SNCF', 'UGC', 'ATM', 'TAN', 'TCL', 'MK2', 'G20', 'H&M', 'IKEA']);

function titleCase(text: string) {
  return text.replace(/[\p{L}\d&]+/gu, word => {
    // A known acronym (EDF, RATP) or a short word with no vowel (SFR, KFC): keep the capitals.
    if (ACRONYMS.has(word) || (word.length <= 4 && !/[AEIOUY]/.test(word))) return word;
    return word.charAt(0) + word.slice(1).toLowerCase();
  });
}

export function storeName(description: string) {
  const text = description.replace(/\s+/g, ' ').trim();
  for (const [pattern, name] of BRANDS) if (pattern.test(text)) return name;
  const name = text
    .replace(CARD_PREFIX, '')
    .replace(CARD_SUFFIX, '')
    .replace(PROCESSOR, '')
    .replace(TRANSFER_WORDS, '')
    // Order numbers, terminal ids and postcodes after the name.
    .replace(/\*.*$/, '')
    .replace(/\s+[#\d][\d\s#/.-]{3,}$/, '')
    .replace(/\.(com|fr|de|es|it|nl|se|eu|co\.uk|co)$/i, '')
    .trim();
  const kept = name || text;
  const cased = kept === kept.toUpperCase() && /\p{Lu}/u.test(kept) ? titleCase(kept) : kept;
  // "le Narcisse" after "SumUp *": a name starts with a capital.
  return cased.charAt(0).toUpperCase() + cased.slice(1);
}

export function storeKey(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
