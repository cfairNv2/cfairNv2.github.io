const SOURCE = "https://s3.amazonaws.com/bucket.thewayoftheninja.org/";
const MAX_COMPRESSED_TEXT = 256 * 1024;
const MAX_LEVEL_BYTES = 1024 * 1024;
const STRUCT_SIZES = [2, 2, 2, 4, 3, 5, 5, 3, 3, 4, 4, 4, 4, 2, 2, 2, 2, 3];

async function readLimited(stream, limit) {
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Level file is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function decodeLevel(encoded) {
  const base64 = encoded.trim();
  if (!base64 || base64.length > MAX_COMPRESSED_TEXT || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error("Invalid level file.");
  }
  const compressed = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate"));
  const bytes = await readLimited(stream, MAX_LEVEL_BYTES);
  if (bytes.length < 2) throw new Error("Incomplete level title.");
  // Flash ByteArray.readUTF: a big-endian byte length followed by UTF-8.
  const titleLength = (bytes[0] << 8) | bytes[1];
  const mapOffset = 2 + titleLength;
  if (mapOffset > bytes.length) throw new Error("Incomplete level title.");
  const title = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(2, mapOffset));
  // Keep the two import delimiters unambiguous even in unusual level titles.
  const importTitle = title.replace(/#/g, "＃").replace(/[\r\n]/g, " ");
  const map = bytes.subarray(mapOffset);
  let offset = 4 + 31 * 23; // Four header bytes and the tile grid.
  for (const stride of STRUCT_SIZES) {
    if (offset + 2 > map.length) throw new Error("Incomplete level data.");
    const count = (map[offset] << 8) | map[offset + 1];
    offset += 2 + count * stride;
    if (offset > map.length) throw new Error("Incomplete level entities.");
  }
  if (offset !== map.length) throw new Error("Unexpected level data.");
  // N v2 writes the low hex digit first for each byte (0x2a becomes 'a2').
  const digits = "0123456789abcdef";
  const data = Array.from(map, (byte) => digits[byte & 15] + digits[byte >> 4]).join("");
  return `%${importTitle}#${data}#`;
}

export async function handleRequest(request, env = {}, ctx = {}, dependencies = {}) {
  const allowedOrigin = env.ALLOWED_ORIGIN || "https://cfairnv2.github.io";
  const origin = request.headers.get("Origin");
  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
  };
  const reply = (body, status, extra = {}) => new Response(body, {
    status, headers: { ...headers, "Cache-Control": "no-store", ...extra },
  });
  if (origin && origin !== allowedOrigin) return reply("Origin not allowed.", 403);
  if (request.method === "OPTIONS") return reply(null, 204);
  if (request.method !== "GET") return reply("Method not allowed.", 405, { Allow: "GET, OPTIONS" });
  const url = new URL(request.url);
  if (url.pathname !== "/level-data") return reply("Not found.", 404);
  const levelId = url.searchParams.get("l");
  if (!/^[0-9]{6}$/.test(levelId || "")) return reply("Enter exactly 6 digits.", 400);
  // Canonical cache keys and a fixed upstream prevent arbitrary URL proxying.
  const cacheKey = new Request(`${url.origin}/level-data?l=${levelId}`);
  const cache = dependencies.cache ?? globalThis.caches?.default;
  try {
    const cached = await cache?.match(cacheKey);
    if (cached) return cached;
    const upstreamFetch = dependencies.fetch || fetch;
    const response = await upstreamFetch(`${SOURCE}${levelId}.txt`, {
      signal: AbortSignal.timeout(12000), redirect: "manual",
    });
    if (response.status === 404 || response.status === 403) return reply("Level not found.", 404);
    if (response.status === 429) return reply("Please try again shortly.", 429, { "Retry-After": "30" });
    if (!response.ok || !response.body) {
      console.warn("Level source request failed:", response.status);
      return reply("Level service unavailable.", 502);
    }
    const encoded = new TextDecoder().decode(await readLimited(response.body, MAX_COMPRESSED_TEXT));
    const value = await decodeLevel(encoded);
    const result = reply(value, 200, { "Cache-Control": "public, max-age=300" });
    if (cache && ctx.waitUntil) ctx.waitUntil(cache.put(cacheKey, result.clone()));
    return result;
  } catch (error) {
    console.warn("Level lookup failed:", error.message);
    return reply("Level service unavailable. Please try again.", 502);
  }
}

export default { fetch: handleRequest };
