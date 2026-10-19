const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const protectedFiles = {
  "app/globals.css": "868634904379b8a0b3550e8fed9f498c030c77a6bc28568bf901c12f677347e2",
  "app/home/page.tsx": "e5aaa3f2ad512c1b3d889351da19e96996eb560d9c7203b8a9766fb1bc0d7433",
  "app/home/home.css": "0c9ceb9b8af5d43303b678df30c6dceae1a4b318beb46b4496e7e6d3edc19009",
  "components/home-workspace.tsx": "9e255e751e8428f2776778ce5685c6dc7626b322cbf75152f3054f7c56037729",
  "components/operational-home.tsx": "63b67f35b5e6dc1ddf401731dae621c7b8d36e40e341a1ab0b6b0557b5413a16",
  "components/prototype-shell.tsx": "90689bfd8feb8c709223d7e95340e782348f6d2650380c774b69285de31eeb77",
  "components/setup-state.tsx": "b20b4a3abb6e2209f87582010a056b8a9990a4f2661a4cc5e5069e497696aac6",
  "lib/home-state.ts": "33e3d18befe2cb9b1914fe74ab80919d7335673456dc00da85a41b4f3a77acd4",
  "lib/home-summary.ts": "a3a5881cfd801ccca9d85104bea7137dad89423679cb9f326d0ccf827ed51ca0",
  "lib/demo-leads.ts": "1f1fc505c7708a700be47800d722b94d6ae3117ff9adc268473e7b3b59fd0538",
};

for (const [file, expected] of Object.entries(protectedFiles)) {
  const actual = createHash("sha256").update(readFileSync(join(root, file))).digest("hex");
  assert.equal(actual, expected, `${file} changed. Review with the Founder before updating the protected Home baseline.`);
}

// Approved integration baseline: the Founder's latest Home, not our older base.
console.log(`PASS: ${Object.keys(protectedFiles).length} protected Home files match Founder baseline 2072305`);
