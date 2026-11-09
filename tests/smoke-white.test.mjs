import assert from "node:assert/strict";
import { installBrowserStubs, click, elements, makeFixture } from "./smoke-helper.mjs";

installBrowserStubs(makeFixture("white"));
await import("../js/app.js");

click("btn-continue"); // 社長室の描画（週報・社員の様子・目標パネルを含む）
assert.equal(elements.get("emp-list").children.length, 2, "社員カードが2人分描画されること");
const mood = elements.get("report-mood").innerHTML;
assert.ok(mood.includes("社員の様子"), "社員の様子ラベルがあること");
assert.ok(mood.includes("退職圏"), "疲労90の社員が退職圏と表示されること");
assert.ok(elements.get("week-report").textContent.includes("月報テキスト"), "月報本文が表示されること");

click("btn-to-ledger"); // 台帳の描画
click("btn-back-from-ledger");

// 1on1：相手選び画面が描画できる（M10）
click("btn-interview");
assert.equal(elements.get("screen-interview").classList.contains("active"), true);
assert.equal(elements.get("iv-picker").children.length, 2, "1on1の相手選びに2人出る");
assert.equal(elements.get("iv-main").classList.contains("hidden"), true);
console.log("SMOKE WHITE OK");
