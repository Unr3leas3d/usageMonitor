import test from "node:test";
import assert from "node:assert/strict";

import { compareSemver, formatUsageWindowLabel, parseElapsedToMs } from "../src/utils.js";

test("parseElapsedToMs handles mm:ss", () => {
  assert.equal(parseElapsedToMs("17:00"), 17 * 60 * 1000);
});

test("parseElapsedToMs handles dd-hh:mm:ss", () => {
  assert.equal(parseElapsedToMs("01-08:54:35"), (((24 + 8) * 60 + 54) * 60 + 35) * 1000);
});

test("formatUsageWindowLabel renders known windows", () => {
  assert.equal(formatUsageWindowLabel(300), "5h");
  assert.equal(formatUsageWindowLabel(10080), "7d");
  assert.equal(formatUsageWindowLabel(90), "90m");
});

test("compareSemver orders dot versions numerically", () => {
  assert.equal(compareSemver("2.1.79", "2.1.80") < 0, true);
  assert.equal(compareSemver("2.1.80", "2.1.80"), 0);
  assert.equal(compareSemver("2.2", "2.1.99") > 0, true);
});
