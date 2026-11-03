import assert from "node:assert/strict";
import { looksComplete } from "../js/report.js";

assert.equal(looksComplete("今週は順調でした。"), true);
assert.equal(looksComplete("来週も頑張りましょう！"), true);
assert.equal(looksComplete("布告「なる"), false);
assert.equal(looksComplete("途中で切れた文章"), false);
assert.equal(looksComplete(""), false);
console.log("REPORT TESTS OK");
