/**
 * The site owner sees their own bank account. The owner opens the site once as /#owner=<OWNER_KEY>: the key is kept
 * in this browser and sent with each request, and the server checks it.
 */
const KEY = 'tillroll.owner'

export function ownerKey() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function forgetOwnerKey() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing stored.
  }
}

/**
 * Keeps a key typed by hand. An iPhone home-screen app has its own storage, apart from Safari's, and no address bar
 * for a #owner=... link: the footer asks for the key there.
 */
export function rememberOwnerKey(key: string) {
  try {
    localStorage.setItem(KEY, key)
    return true
  } catch {
    return false
  }
}

/** Keeps the key from a #owner=... address and takes it out of the address bar. */
export function captureOwnerKey() {
  const match = /^#owner=(.+)$/.exec(window.location.hash)
  if (!match) return
  try {
    localStorage.setItem(KEY, decodeURIComponent(match[1]))
  } catch {
    // Storage blocked: owner mode lasts until the next reload.
  }
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}
