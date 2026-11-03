import assert from "node:assert/strict";
import { looksComplete } from "../js/report.js";

assert.equal(looksComplete("今週は順調でした。"), true);
assert.equal(looksComplete("来週も頑張りましょう！"), true);
assert.equal(looksComplete("社長命令「なる"), false);
assert.equal(looksComplete("途中で切れた文章"), false);
assert.equal(looksComplete(""), false);
console.log("REPORT TESTS OK");

// --- M9：本音の分割と話者選定 ---
import { splitHonne, pickCommentator } from "../js/report.js";
const sp = splitHonne("本文です。【本音】高嶺 澪：正直しんどいです。");
assert.equal(sp.text, "本文です。");
assert.ok(sp.honne.startsWith("高嶺 澪"));
assert.equal(splitHonne("本文だけです。").honne, "");
const picked = pickCommentator([
  { name: "a", hp: 90, faith: 50 },
  { name: "b", hp: 10, faith: 20 },
]);
assert.equal(picked.name, "b");
