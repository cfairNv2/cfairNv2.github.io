import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { decodeLevel, handleRequest } from "../worker/index.mjs";

// Original game file for 452053, retrieved directly from its public storage.
const example = "eNpj4CrOTM9LLCktSsxhGAXEAU4GQXzS7AxseLULjoYgHQCTnZadGgOjhw6QzWin5WaEiD4nHSZ3HQY3PQZXAwY3LQZXTQZXNQY3DQZ3LSzmAAC2jAqe";

test("original level decodes to the game's low-digit-first import format", async () => {
  const value = await decodeLevel(example);
  assert.match(value, /^%signatural#[0-9a-f]{1580}#$/);
  // First player's original byte coordinates are 0x3e, 0x2a.
  assert.equal(value.split("#")[1].slice(1434, 1446), "0020e3a2e362");
});

function levelFile(title, map = Buffer.alloc(4 + 31 * 23 + 18 * 2)) {
  const name = Buffer.from(title);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(name.length);
  return deflateSync(Buffer.concat([length, name, map])).toString("base64");
}

test("UTF-8 titles and unusual delimiters produce a single import string", async () => {
  const result = await decodeLevel(levelFile("café #1\nmap"));
  assert.match(result, /^%café ＃1 map#[0]+#$/);
  assert.equal(result.split("#").length, 3);
});

test("invalid files, missing tiles, truncated entities and trailing bytes fail", async () => {
  for (const value of ["", "<html>error</html>", "AAAA", levelFile("test", Buffer.alloc(4))]) {
    await assert.rejects(() => decodeLevel(value));
  }
  const missingEntity = Buffer.alloc(4 + 31 * 23 + 18 * 2);
  missingEntity.writeUInt16BE(1, 4 + 31 * 23);
  await assert.rejects(() => decodeLevel(levelFile("bad", missingEntity)));
  await assert.rejects(() => decodeLevel(levelFile("bad", Buffer.alloc(4 + 31 * 23 + 18 * 2 + 1))));
});

const request = (path = "/level-data?l=452053", options) => new Request(`https://lookup.example${path}`, options);

test("only valid six-digit queries reach the original storage URL", async () => {
  const urls = [];
  const dependencies = { fetch: async (url) => { urls.push(url); return new Response(example); } };
  for (const id of ["", "12345", "1234567", "abcdef", "../foo"]) {
    assert.equal((await handleRequest(request(`/level-data?l=${id}`), {}, {}, dependencies)).status, 400);
  }
  const response = await handleRequest(request(), {}, {}, dependencies);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /^%signatural#/);
  assert.deepEqual(urls, ["https://s3.amazonaws.com/bucket.thewayoftheninja.org/452053.txt"]);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://cfairnv2.github.io");
});

test("leading zeroes are retained in original storage requests", async () => {
  let url;
  await handleRequest(request("/level-data?l=001234"), {}, {}, {
    fetch: async (value) => { url = value; return new Response(example); },
  });
  assert.equal(url, "https://s3.amazonaws.com/bucket.thewayoftheninja.org/001234.txt");
});

test("missing levels, rate limiting and upstream failures never return import data", async () => {
  for (const [upstream, expected] of [[404, 404], [403, 404], [429, 429], [500, 502]]) {
    const response = await handleRequest(request(), {}, {}, {
      fetch: async () => new Response("error", { status: upstream }),
    });
    assert.equal(response.status, expected);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
  assert.equal((await handleRequest(request(), {}, {}, {
    fetch: async () => new Response("<html>error</html>"),
  })).status, 502);
});

test("origin, method and path restrictions run before upstream fetch", async () => {
  const dependencies = { fetch: () => { throw new Error("Unexpected upstream request"); } };
  assert.equal((await handleRequest(request("/anything"), {}, {}, dependencies)).status, 404);
  assert.equal((await handleRequest(request(undefined, { method: "POST" }), {}, {}, dependencies)).status, 405);
  assert.equal((await handleRequest(request(undefined, { headers: { Origin: "https://other.example" } }), {}, {}, dependencies)).status, 403);
  assert.equal((await handleRequest(request(undefined, { method: "OPTIONS", headers: { Origin: "https://cfairnv2.github.io" } }), {}, {}, dependencies)).status, 204);
});

test("cached results avoid a second original-server request", async () => {
  const data = new Map();
  const pending = [];
  let fetches = 0;
  const dependencies = {
    fetch: async () => { fetches++; return new Response(example); },
    cache: {
      match: async (key) => data.get(key.url)?.clone(),
      put: async (key, response) => { data.set(key.url, response); },
    },
  };
  const context = { waitUntil: (promise) => pending.push(promise) };
  const first = await handleRequest(request(), {}, context, dependencies);
  await Promise.all(pending);
  const second = await handleRequest(request("/level-data?unused=1&l=452053"), {}, context, dependencies);
  assert.equal(await first.text(), await second.text());
  assert.equal(fetches, 1);
});
