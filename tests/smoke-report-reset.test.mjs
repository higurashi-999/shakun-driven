import assert from "node:assert/strict";
import { installBrowserStubs, click, elements, makeFixture } from "./smoke-helper.mjs";

// M17.1 回帰テスト：新規ゲームで前セーブの月報が残らないこと、
// 社長室からタイトルへ戻るとメニューが初期状態になること
installBrowserStubs(makeFixture("white"));
await import("../js/app.js");

click("btn-continue");
assert.ok(elements.get("week-report").textContent.includes("月報テキスト"), "継続時は月報が表示されること");

click("btn-back-from-office");
assert.equal(elements.get("mode-select").classList.contains("hidden"), true, "タイトルへ戻るとモード選択が閉じていること");
assert.equal(elements.get("menu-main").classList.contains("hidden"), false, "タイトルへ戻るとメインメニューが出ていること");

click("btn-new");
click("mode-btn-white");
assert.equal(elements.get("screen-office").classList.contains("active"), true, "新規ゲームで社長室が開くこと");
assert.ok(elements.get("week-report").textContent.startsWith("まだ月を進めていません"), "新規ゲームでは月報欄が初期文に戻ること");
console.log("SMOKE REPORT RESET OK");
