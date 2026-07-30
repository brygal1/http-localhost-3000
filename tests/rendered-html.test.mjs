import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the ShiftAhead primary experience", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>ShiftAhead<\/title>/i);
  assert.match(html, /Safe to Spend Today/i);
  assert.match(html, /Rent Runway/i);
  assert.match(html, /Income Smoothing Wallet/i);
  assert.match(html, /AI Cashflow Copilot/i);
  assert.match(html, /Can I take tomorrow off/i);
  assert.match(html, /Research atlas/i);
});

test("keeps the research atlas available", async () => {
  const response = await render("/research");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Daily Earnings Atlas/i);
  assert.match(html, /Open ShiftAhead/i);
});

test("ships curated ShiftAhead sample data", async () => {
  const raw = await readFile(
    new URL("../app/shiftahead-data.json", import.meta.url),
    "utf8",
  );
  const data = JSON.parse(raw);
  assert.equal(data.defaultWorkerId, "W-0011");
  assert.ok(data.workers.length >= 5);
  assert.ok(data.workers.some((worker) => worker.id === "W-0011"));
});
