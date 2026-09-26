/**
 * sse-502-probe: checks that the price stream recovers after its reconnect is answered with 502.
 *
 * Puts an HTTP proxy in front of the app, drops the stream, answers every stream request with 502
 * for a few seconds, then lets it through again. Passes when the status dot returns to LIVE, prices
 * move again, and no more than one EventSource was ever live at once.
 *
 * Usage (from the repo root, app running): node test/sse-502-probe.mjs [app-url]
 */
import http from "node:http";
import { chromium } from "@playwright/test";

const target = new URL(process.argv[2] ?? "http://127.0.0.1:8000");
const STREAM = "/api/stream/prices";
const STATUS = '[data-testid="connection-status"]';
const TIMEOUT = 15_000;

const streams = new Set();
let failing = false;
let count502 = 0;

const proxy = http.createServer((req, res) => {
  const isStream = req.url.startsWith(STREAM);
  if (isStream && failing) {
    count502++;
    res.writeHead(502, { "content-type": "text/plain" });
    return res.end("bad gateway");
  }
  const upstream = http.request(
    { host: target.hostname, port: target.port, method: req.method, path: req.url, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => res.destroy());
  req.pipe(upstream);
  if (isStream) {
    streams.add(res);
    res.on("close", () => {
      streams.delete(res);
      upstream.destroy();
    });
  }
});

/** Start answering the stream with 502 and cut the open streams so the browser retries into it. */
function fail() {
  failing = true;
  streams.forEach((res) => res.destroy());
}

function restore() {
  failing = false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll fn until it returns true, or throw after TIMEOUT. */
async function until(fn) {
  for (const end = Date.now() + TIMEOUT; Date.now() < end; await sleep(200)) if (await fn()) return;
  throw new Error("timeout");
}

await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.addInitScript(() => {
  window.__es = [];
  window.__maxLive = 0;
  window.EventSource = class extends window.EventSource {
    constructor(...args) {
      super(...args);
      window.__es.push(this);
    }
  };
  setInterval(() => {
    const live = window.__es.filter((es) => es.readyState !== 2).length;
    window.__maxLive = Math.max(window.__maxLive, live);
  }, 100);
});

const waitStatus = (s) => page.waitForSelector(`${STATUS}[data-status="${s}"]`, { timeout: TIMEOUT });
const tsla = () => page.textContent('[data-testid="watchlist-price-TSLA"]');

let stage = "connect";
let code = 0;
try {
  await page.goto(`http://127.0.0.1:${proxy.address().port}/`);
  await waitStatus("connected");
  await until(async () => /\d/.test((await tsla()) ?? ""));

  stage = "outage";
  fail();
  await waitStatus("disconnected");

  stage = "hold";
  await sleep(5_000);

  stage = "recover";
  restore();
  await waitStatus("connected");

  stage = "prices";
  const before = await tsla();
  await until(async () => (await tsla()) !== before);

  stage = "single";
  const [created, maxLive] = await page.evaluate(() => [window.__es.length, window.__maxLive]);
  if (maxLive !== 1 || created < 2 || count502 < 2) throw new Error("single");
  console.log(`sse-502-probe: PASS created=${created} maxLive=${maxLive} 502s=${count502}`);
} catch {
  const status = await page.getAttribute(STATUS, "data-status").catch(() => "none");
  const [created, maxLive] = await page.evaluate(() => [window.__es.length, window.__maxLive]).catch(() => [0, 0]);
  console.log(`sse-502-probe: FAIL stage=${stage} status=${status} created=${created} maxLive=${maxLive} 502s=${count502}`);
  code = 1;
} finally {
  await browser.close();
  streams.forEach((res) => res.destroy());
  proxy.closeAllConnections();
  proxy.close();
}
process.exit(code);
