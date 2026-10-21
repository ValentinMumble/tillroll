/**
 * Owner mode lives in a cookie the server sets (see /api/login), so it lasts a year in each browser. The key itself
 * only passes through: from a /#owner=<OWNER_KEY> address, or typed in the footer's Owner key link (an iPhone
 * home-screen app has its own cookies, apart from Safari's, and no address bar), it waits here until the page signs
 * in with it. Earlier versions kept the key here for good: the page signs in with that one too.
 */
const KEY = 'tillroll.owner';
const HINT = 'tillroll_owner=1';

/** The key waiting to be turned into a cookie, if any. */
export function pendingOwnerKey() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function keepOwnerKey(key: string) {
  try {
    localStorage.setItem(KEY, key);
    return true;
  } catch {
    return false;
  }
}

export function forgetOwnerKey() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}

/** This browser is in owner mode, or about to be. */
export function isOwnerBrowser() {
  return document.cookie.split(/;\s*/).includes(HINT) || Boolean(pendingOwnerKey());
}

/** Keeps the key from a #owner=... address and takes it out of the address bar. */
export function captureOwnerKey() {
  const match = /^#owner=(.+)$/.exec(window.location.hash);
  if (!match) return;
  keepOwnerKey(decodeURIComponent(match[1]));
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}
