// Keeps the app's own loading screen (its header, tab bar and grey outline, see OverviewSkeleton) in
// src/loading-frame.html, which an owner's page shows before its script runs (see index.html). Run it after a change
// to the header, the tab bar or the skeleton: `npm run build`, then `node design/render-loading-frame.mjs`, then build
// again. It needs Google Chrome (macOS), serves dist/ with the owner's data never coming, and reads what React draws.
import {spawn} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {extname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
// An iPhone's screen in points, at 3 pixels each, as on the phone the frame is shown on.
const SCREEN = {width: 402, height: 874, scale: 3};

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

/** The file under dist/ a request asks for, if there is one. */
function fileFor(pathname) {
  const file = join(dist, pathname === '/' ? 'index.html' : pathname);
  try {
    return file.startsWith(dist) && statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

// The built app, in owner mode (the cookie the server sets at sign-in), whose data never comes: it stays on its
// loading screen. No service worker, so each page load reads dist/ as it is.
const waiting = [];
const server = createServer((request, response) => {
  const {pathname} = new URL(request.url, 'http://localhost');
  if (pathname.startsWith('/api/')) {
    waiting.push(response);
    return;
  }
  const file = pathname === '/sw.js' ? null : fileFor(pathname);
  if (!file) {
    response.writeHead(404).end();
    return;
  }
  const headers = {'content-type': TYPES[extname(file)] ?? 'application/octet-stream'};
  if (pathname === '/') headers['set-cookie'] = 'tillroll_owner=1; Path=/';
  response.writeHead(200, headers).end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

// Chrome, driven over a pipe with the DevTools protocol: messages end with a zero byte.
const profile = mkdtempSync(join(tmpdir(), 'tillroll-frame-'));
const chrome = spawn(
  CHROME,
  ['--headless', '--remote-debugging-pipe', `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars'],
  {stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe']},
);
const calls = new Map();
let lastId = 0;
let received = '';
chrome.stdio[4].setEncoding('utf8');
chrome.stdio[4].on('data', chunk => {
  received += chunk;
  for (let end = received.indexOf('\0'); end >= 0; end = received.indexOf('\0')) {
    const message = JSON.parse(received.slice(0, end));
    received = received.slice(end + 1);
    const call = calls.get(message.id);
    if (!call) continue;
    calls.delete(message.id);
    if (message.error) call.reject(new Error(`${call.method}: ${message.error.message}`));
    else call.resolve(message.result);
  }
});

/** Sends a DevTools command, to the browser or to one page's session. */
function send(method, params = {}, sessionId) {
  lastId += 1;
  const id = lastId;
  chrome.stdio[3].write(`${JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})})}\0`);
  return new Promise((resolve, reject) => calls.set(id, {method, resolve, reject}));
}

const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

/** Waits until an expression is true in the tab. */
async function until(tab, expression) {
  for (let tries = 0; tries < 100; tries += 1) {
    const {result} = await tab('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    if (result.value) return;
    await pause(100);
  }
  throw new Error(`Never true: ${expression}`);
}

/** The loading screen's markup as React draws it, not the copy the page opens on (which may be out of date). */
async function loadingFrame() {
  const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
  const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true});
  const tab = (method, params) => send(method, params, sessionId);
  await tab('Emulation.setDeviceMetricsOverride', {...SCREEN, deviceScaleFactor: SCREEN.scale, mobile: true});
  await tab('Page.navigate', {url: origin});
  // React's nodes hold its fiber.
  await until(
    tab,
    "[...document.querySelectorAll('.skeleton-view')].some(view => Object.keys(view).some(key => key.startsWith('__reactFiber')))",
  );
  const {result} = await tab('Runtime.evaluate', {
    expression: "document.getElementById('root').innerHTML",
    returnByValue: true,
  });
  await send('Target.closeTarget', {targetId});
  return result.value;
}

try {
  writeFileSync(join(root, 'src', 'loading-frame.html'), `${await loadingFrame()}\n`);
  console.log('src/loading-frame.html');
} finally {
  // Its profile goes once it has quit, not while it still writes there.
  await new Promise(resolve => {
    chrome.once('exit', resolve);
    chrome.kill();
  });
  for (const response of waiting) response.destroy();
  server.close();
  rmSync(profile, {recursive: true, force: true});
}
