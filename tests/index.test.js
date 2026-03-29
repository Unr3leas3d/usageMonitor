import test from "node:test";
import assert from "node:assert/strict";

import { parseMaxAge } from "../src/index.js";

test("parseMaxAge returns 1500 with no flags", () => {
  assert.equal(parseMaxAge([]), 1_500);
});

test("parseMaxAge parses --max-age=3000", () => {
  assert.equal(parseMaxAge(["--max-age=3000"]), 3_000);
});

test("parseMaxAge returns default for invalid --max-age", () => {
  assert.equal(parseMaxAge(["--max-age=abc"]), 1_500);
});

test("parseMaxAge returns 0 for --no-cache", () => {
  assert.equal(parseMaxAge(["--no-cache"]), 0);
});

test("parseMaxAge returns 0 for --max-age=0", () => {
  assert.equal(parseMaxAge(["--max-age=0"]), 0);
});
