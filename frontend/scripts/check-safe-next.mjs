// Run: node scripts/check-safe-next.mjs (Node 22.6+ strips the TypeScript types).
import assert from "node:assert/strict";
import { safeNext } from "../lib/safe-next.ts";

const o = "https://irec.example";
const lands = next => new URL(safeNext(next, o)); // where window.location.assign() would take the browser
for (const ok of ["/leads?lead=42", "/home#x", "/%2F/evil.com"]) assert.equal(safeNext(ok, o), o + ok, ok);
for (const evil of [
  null, "", "//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)",
  "/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/.//evil.com", "/a/..//evil.com", "/%2e//evil.com",
]) {
  assert.equal(lands(evil).origin, o, JSON.stringify(evil));
}
console.log("safeNext: every result stays on", o);
