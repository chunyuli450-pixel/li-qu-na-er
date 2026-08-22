import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the 李去哪儿 application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>李去哪儿｜旅行路线规划<\/title>/);
  assert.match(html, /正在翻开你的旅行手账/);
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /apple-mobile-web-app-title/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("keeps mobile itinerary controls and route styling in the product source", async () => {
  const [page, css, layout, manifestText] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
  ]);

  assert.match(page, /startPointerSort/);
  assert.match(page, /onPointerMove=\{updatePointerSort\}/);
  assert.match(page, /drawer-add-trip/);
  assert.match(page, /panel-collapsed/);
  assert.match(page, /routeLineStyles/);
  assert.match(page, /route-swatch subway/);

  assert.match(css, /\.drawer-collapsed \.itinerary-panel/);
  assert.match(css, /\.drawer-expanded \.itinerary-panel/);
  assert.match(css, /touch-action:\s*none/);
  assert.match(css, /--route-transit:\s*#e3ad24/);
  assert.match(css, /\.route-legend/);
  assert.match(css, /\.trip-switcher \{ display:\s*flex/);

  assert.match(layout, /李去哪儿/);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
});
