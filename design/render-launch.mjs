// Renders the iOS launch images, public/launch-light.png and public/launch-dark.png: the app's own loading screen (its
// header, tab bar and grey outline, see OverviewSkeleton) as the iPhone 16 Pro shows it from the home screen, so the
// app takes over from the image without a jump. Run it after `npm run build`, with Google Chrome installed (macOS):
// `node design/render-launch.mjs`. It serves dist/ with the owner's data never coming, and screenshots the page.
import {spawn} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {extname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
// The iPhone 16 Pro's screen in points, at 3 pixels each. The home-screen app's page starts under the status bar
// (index.html asks for the default one) and runs under the home bar, which its safe area leaves free.
const SCREEN = {width: 402, height: 874, scale: 3};
const STATUS_BAR = 62;
const HOME_BAR = 34;

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
const profile = mkdtempSync(join(tmpdir(), 'tillroll-launch-'));
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

/** A new tab, with a function sending commands to it. */
async function openTab(width, height) {
  const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
  const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true});
  const tab = (method, params) => send(method, params, sessionId);
  await tab('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: SCREEN.scale, mobile: true});
  return {tab, close: () => send('Target.closeTarget', {targetId})};
}

/** Waits until an expression is true in the tab. */
async function until(tab, expression) {
  for (let tries = 0; tries < 100; tries += 1) {
    const {result} = await tab('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    if (result.value) return;
    await pause(100);
  }
  throw new Error(`Never true: ${expression}`);
}

/** The loading screen in light or dark, as a PNG in base64, with the page colour around it. */
async function loadingScreen(theme) {
  const {tab, close} = await openTab(SCREEN.width, SCREEN.height - STATUS_BAR);
  await tab('Emulation.setSafeAreaInsetsOverride', {insets: {bottom: HOME_BAR}});
  await tab('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 5});
  // Still, as a screenshot is: no pulse.
  await tab('Emulation.setEmulatedMedia', {
    features: [
      {name: 'prefers-color-scheme', value: theme},
      {name: 'prefers-reduced-motion', value: 'reduce'},
    ],
  });
  // Opened from the home screen, as isHomeScreenApp tells it.
  await tab('Page.addScriptToEvaluateOnNewDocument', {
    source: "Object.defineProperty(navigator, 'standalone', {value: true});",
  });
  await tab('Page.navigate', {url: origin});
  await until(tab, "document.querySelector('.skeleton-view') !== null && document.fonts.ready.then(() => true)");
  const {data} = await tab('Page.captureScreenshot', {format: 'png'});
  const {result} = await tab('Runtime.evaluate', {
    expression: 'getComputedStyle(document.body).backgroundColor',
    returnByValue: true,
  });
  await close();
  return {screen: data, page: result.value};
}

/** The whole screen: the status bar's band in the page colour, then the page. */
async function launchImage({screen, page}) {
  const {tab, close} = await openTab(SCREEN.width, SCREEN.height);
  const {frameTree} = await tab('Page.getFrameTree');
  await tab('Page.setDocumentContent', {
    frameId: frameTree.frame.id,
    html: `<meta name="viewport" content="width=device-width"><body style="margin: 0; background: ${page}"><img style="display: block; width: ${SCREEN.width}px; margin-top: ${STATUS_BAR}px" src="data:image/png;base64,${screen}"></body>`,
  });
  await until(tab, 'document.images[0].decode().then(() => true)');
  const {data} = await tab('Page.captureScreenshot', {format: 'png'});
  await close();
  return data;
}

try {
  for (const theme of ['light', 'dark']) {
    const image = await launchImage(await loadingScreen(theme));
    writeFileSync(join(root, 'public', `launch-${theme}.png`), Buffer.from(image, 'base64'));
    console.log(`public/launch-${theme}.png`);
  }
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
