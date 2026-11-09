import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {captureOwnerKey} from './owner';

// A page opened before a deploy asks for a file the new deploy no longer has (the trips map's): reload to get the new
// ones, rather than leave it blank. Not twice in a row, so a file that is really missing cannot start a reload loop.
const RELOADED_AT = 'tillroll.reloaded-for-deploy-at';
const RELOAD_GAP_MS = 10_000;

/** Reloads the page for a new deploy, unless it just did. False when it did not. */
function reloadForDeploy() {
  try {
    if (Date.now() - Number(sessionStorage.getItem(RELOADED_AT) ?? 0) < RELOAD_GAP_MS) return false;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

window.addEventListener('vite:preloadError', event => {
  if (reloadForDeploy()) event.preventDefault();
});

// An app on a phone's home screen can sit in memory for days and come back as it was, on an old deploy. Each time it
// comes back to the front (at most once a minute), it asks for the page and reloads when the page names another build
// than the one running. Not while working locally: there is no build then.
const RUNNING_BUILD = import.meta.url.match(/\/assets\/index-[^/]+\.js/)?.[0] ?? null;
const BUILD_CHECK_GAP_MS = 60_000;
let checkedBuildAt = 0;
document.addEventListener('visibilitychange', async () => {
  if (RUNNING_BUILD === null || document.visibilityState !== 'visible') return;
  if (Date.now() - checkedBuildAt < BUILD_CHECK_GAP_MS) return;
  checkedBuildAt = Date.now();
  try {
    const page = await (await fetch('/', {cache: 'no-store'})).text();
    const live = page.match(/\/assets\/index-[^"']+\.js/)?.[0];
    if (live && live !== RUNNING_BUILD) reloadForDeploy();
  } catch {
    // Offline: the next return to the front tries again.
  }
});

// Before the app reads its data: #owner=... switches this browser to the owner's synced account.
captureOwnerKey();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
