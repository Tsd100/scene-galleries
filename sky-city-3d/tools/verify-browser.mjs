import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const artifactsDir = path.join(projectRoot, 'artifacts');
const profileRoot = path.join(projectRoot, '.browser-profiles');
const targetUrl = process.env.SCENE_URL ?? 'http://127.0.0.1:4400';
const browsers = [
  { name: 'chrome', executable: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9444 },
  { name: 'edge', executable: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', port: 9445 },
];

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const invariant = (condition, message) => { if (!condition) throw new Error(message); };

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.counter = 0;
    this.pending = new Map();
    this.events = new Map();
  }
  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else {
        for (const listener of this.events.get(message.method) ?? []) listener(message.params);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.counter;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, listener) {
    const listeners = this.events.get(method) ?? [];
    listeners.push(listener);
    this.events.set(method, listeners);
  }
  close() { this.socket.close(); }
}

async function waitForJson(port, route = '/json/list') {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${route}`);
      if (response.ok) return response.json();
    } catch {}
    await wait(125);
  }
  throw new Error(`CDP port ${port} did not become ready`);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

async function waitForExpression(cdp, expression, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(cdp, `Boolean(${expression})`)) return;
    await wait(150);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function screenshot(cdp, filename) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await writeFile(path.join(artifactsDir, filename), Buffer.from(result.data, 'base64'));
}

async function runBrowser(browser) {
  const profile = path.join(profileRoot, `${browser.name}-${Date.now()}`);
  await mkdir(profile, { recursive: true });
  const child = spawn(browser.executable, [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    `--remote-debugging-port=${browser.port}`,
    `--user-data-dir=${profile}`,
    '--window-size=1440,900',
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  let cdp;
  const exceptions = [];
  const failedRequests = [];
  const requestedUrls = [];
  try {
    const pages = await waitForJson(browser.port);
    const page = pages.find((entry) => entry.type === 'page');
    invariant(page, `${browser.name}: no page target`);
    cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.connect();
    cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => exceptions.push(exceptionDetails.text));
    cdp.on('Network.loadingFailed', (event) => failedRequests.push(`${event.errorText}: ${event.requestId}`));
    cdp.on('Network.requestWillBeSent', ({ request }) => requestedUrls.push(request.url));
    await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Network.enable')]);
    await cdp.send('Page.navigate', { url: targetUrl });
    await waitForExpression(cdp, 'window.__SKY_CITY__?.ready === true');

    const initial = await evaluate(cdp, '({ state: window.__SKY_CITY__.state, metrics: window.__SKY_CITY__.metrics, areas: window.__SKY_CITY__.areas, uuid: window.__SKY_CITY__.worldRootUuid, errors: window.__SKY_CITY__.errors })');
    invariant(initial.areas.join('') === 'ABCDEFGH', `${browser.name}: expected all eight areas`);
    invariant(initial.metrics.areaCount === 8, `${browser.name}: metrics do not report eight areas`);
    invariant(initial.metrics.meshes > 250, `${browser.name}: scene detail count is unexpectedly low`);
    invariant(initial.metrics.instances > 100, `${browser.name}: instancing is unexpectedly low`);
    invariant(initial.errors.length === 0, `${browser.name}: app errors: ${initial.errors.join('; ')}`);
    await wait(900);
    await screenshot(cdp, `${browser.name}-desktop.png`);

    const beforeOverview = initial.state.player.position;
    await evaluate(cdp, 'window.__SKY_CITY__.openOverview()');
    await wait(350);
    const overview = await evaluate(cdp, 'window.__SKY_CITY__.state');
    invariant(overview.mode === 'overview', `${browser.name}: overview did not open`);
    await screenshot(cdp, `${browser.name}-overview.png`);
    await evaluate(cdp, 'window.__SKY_CITY__.closeOverview()');
    await wait(200);
    const afterOverview = await evaluate(cdp, 'window.__SKY_CITY__.state');
    invariant(JSON.stringify(afterOverview.player.position) === JSON.stringify(beforeOverview), `${browser.name}: overview did not restore player position`);
    const expectedCameraY = afterOverview.player.position[1] + 2.35;
    invariant(Math.abs(afterOverview.cameraPosition[0] - afterOverview.player.position[0]) < 0.01 && Math.abs(afterOverview.cameraPosition[1] - expectedCameraY) < 0.01 && Math.abs(afterOverview.cameraPosition[2] - afterOverview.player.position[2]) < 0.01, `${browser.name}: overview did not snap camera back to player`);
    invariant(initial.uuid === await evaluate(cdp, 'window.__SKY_CITY__.worldRootUuid'), `${browser.name}: world root changed across overview`);

    invariant(await evaluate(cdp, 'window.__SKY_CITY__.routeToArea("G")'), `${browser.name}: lower hall route was rejected`);
    await wait(350);
    const moving = await evaluate(cdp, 'window.__SKY_CITY__.state.player.routeActive');
    invariant(moving, `${browser.name}: click route did not start`);
    await evaluate(cdp, 'window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", bubbles: true }))');
    await wait(100);
    const afterManual = await evaluate(cdp, 'window.__SKY_CITY__.state');
    invariant(!afterManual.player.routeActive, `${browser.name}: WASD did not cancel route`);
    await evaluate(cdp, 'window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW", bubbles: true }))');

    await evaluate(cdp, 'window.__SKY_CITY__.routeToArea("C")');
    await wait(160);
    const beforeFreeze = await evaluate(cdp, 'window.__SKY_CITY__.state.player.position');
    await evaluate(cdp, 'Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange"))');
    await wait(450);
    await evaluate(cdp, 'Object.defineProperty(document, "hidden", { value: false, configurable: true }); document.dispatchEvent(new Event("visibilitychange"))');
    const afterFreeze = await evaluate(cdp, 'window.__SKY_CITY__.state.player.position');
    invariant(Math.hypot(...afterFreeze.map((value, index) => value - beforeFreeze[index])) < 0.01, `${browser.name}: player moved while page was frozen`);
    await evaluate(cdp, 'window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", bubbles: true })); window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW", bubbles: true }))');

    await evaluate(cdp, 'window.__SKY_CITY__.setReducedMotionForTest(true)');
    invariant(await evaluate(cdp, 'window.__SKY_CITY__.state.reducedMotion') === true, `${browser.name}: reduced motion did not apply`);
    await evaluate(cdp, 'window.__SKY_CITY__.setReducedMotionForTest(false)');

    const mainRoute = ['dock','dock-north','bridge-south','bridge-crown','gate','gate-stairs','courtyard-south','courtyard','root-walk','arcade-west','arcade-north','arcade-east','garden-entry','garden','robot','tower-entry','tower-stair-1','tower-stair-2','tower-lookout','tower-west-ramp','north-causeway-east','north-causeway-west','wall-north','wall-mid','wall-south','wall-return','dock-west','dock'];
    const branchRoute = ['arcade-west','ruin-stairs-top','lower-landing','lower-hall','lower-window'];
    const mainWalk = await evaluate(cdp, `window.__SKY_CITY__.walkPathForTest(${JSON.stringify(mainRoute)})`);
    invariant(mainWalk.complete, `${browser.name}: main loop did not complete`);
    for (const area of ['A','B','C','D','E','F','H']) invariant(mainWalk.areas.includes(area), `${browser.name}: main loop missed area ${area}`);
    const branchWalk = await evaluate(cdp, `window.__SKY_CITY__.walkPathForTest(${JSON.stringify(branchRoute)})`);
    invariant(branchWalk.complete, `${browser.name}: branch route did not complete`);
    for (const area of ['D','G']) invariant(branchWalk.areas.includes(area), `${browser.name}: branch route missed area ${area}`);
    if (browser.name === 'chrome') await screenshot(cdp, 'chrome-interior.png');
    const branchExit = await evaluate(cdp, 'window.__SKY_CITY__.walkPathForTest(["lower-window","wall-mid"])');
    invariant(branchExit.complete && branchExit.areas.includes('H'), `${browser.name}: branch did not exit through area H`);
    invariant(initial.uuid === await evaluate(cdp, 'window.__SKY_CITY__.worldRootUuid'), `${browser.name}: world root changed while walking routes`);

    await evaluate(cdp, 'window.__SKY_CITY__.goToWaypointForTest("dock")');

    const viewports = [[1440, 900, false], [1920, 1080, false], [768, 1024, true], [390, 844, true]];
    for (const [width, height, mobile] of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
      await wait(120);
      const layout = await evaluate(cdp, '({ dock: document.querySelector(".action-dock").getBoundingClientRect().toJSON(), map: document.querySelector(".map-panel").getBoundingClientRect().toJSON(), viewport: [innerWidth, innerHeight] })');
      invariant(layout.dock.left >= 0 && layout.dock.right <= width && layout.dock.bottom <= height, `${browser.name}: action dock overflows ${width}x${height}`);
      invariant(layout.map.left >= 0 && layout.map.right <= width && layout.map.bottom <= height, `${browser.name}: map overflows ${width}x${height}`);
      if (width === 390) await screenshot(cdp, `${browser.name}-mobile.png`);
    }

    const remote = requestedUrls.filter((url) => !url.startsWith('http://127.0.0.1:4400') && !url.startsWith('data:') && !url.startsWith('blob:') && !url.startsWith('devtools:'));
    invariant(remote.length === 0, `${browser.name}: remote resources requested: ${remote.join(', ')}`);
    invariant(failedRequests.length === 0, `${browser.name}: failed requests: ${failedRequests.join('; ')}`);
    invariant(exceptions.length === 0, `${browser.name}: runtime exceptions: ${exceptions.join('; ')}`);

    return { browser: browser.name, metrics: initial.metrics, walkedMainLoop: true, walkedBranchRoute: true, visitedAreas: 8, screenshots: browser.name === 'chrome' ? 4 : 3, remoteRequests: remote.length, failures: 0 };
  } finally {
    cdp?.close();
    child.kill();
  }
}

await mkdir(artifactsDir, { recursive: true });
await mkdir(profileRoot, { recursive: true });
const results = [];
for (const browser of browsers) results.push(await runBrowser(browser));
await writeFile(path.join(artifactsDir, 'browser-verification.json'), JSON.stringify({ targetUrl, testedAt: new Date().toISOString(), results }, null, 2));
console.log(JSON.stringify(results, null, 2));
