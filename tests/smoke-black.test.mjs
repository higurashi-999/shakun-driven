import assert from "node:assert/strict";
import { installBrowserStubs, click, elements, makeFixture } from "./smoke-helper.mjs";

installBrowserStubs(makeFixture("black"));
await import("../js/app.js");

click("btn-continue");
assert.equal(elements.get("emp-list").children.length, 2, "社員カードが2人分描画されること");
const mood = elements.get("report-mood").innerHTML;
assert.ok(mood.includes("社員の様子"), "社員の様子ラベルがあること");
assert.ok(!mood.includes("退職圏"), "ブラックでは疲労ベースの状態ワードを出さないこと");
assert.ok(!mood.includes("😵") && !mood.includes("😩"), "ブラックでは表情を出さないこと");
console.log("SMOKE BLACK OK");
