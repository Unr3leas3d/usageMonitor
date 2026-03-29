import test from "node:test";
import assert from "node:assert/strict";

import { describeClaudeBridgeIssue } from "../src/collectors/claude.js";

test("describeClaudeBridgeIssue reports outdated Claude versions", () => {
  const issue = describeClaudeBridgeIssue({
    ordered: [
      {
        version: "2.1.79",
        rate_limits: null
      }
    ]
  });

  assert.match(issue, /2\.1\.79/);
  assert.match(issue, /2\.1\.80\+/);
});

test("describeClaudeBridgeIssue stays quiet once rate limits exist", () => {
  const issue = describeClaudeBridgeIssue({
    ordered: [
      {
        version: "2.1.80",
        rate_limits: {
          five_hour: { used_percentage: 12 }
        }
      }
    ]
  });

  assert.equal(issue, null);
});
