import assert from "node:assert/strict";
import { installBrowserStubs, click, elements } from "./smoke-helper.mjs";

// 新規開始フロー：モードが state に保存され、社長室に表示されること（M11：モード未保存バグの回帰テスト）
installBrowserStubs(null);
await import("../js/app.js");

click("btn-new");
click("mode-btn-black");
assert.equal(elements.get("screen-office").classList.contains("active"), true);
assert.equal(elements.get("st-mode").textContent, "ブラック", "選択したモードが表示されること");
assert.equal(elements.get("st-risk-wrap").classList.contains("hidden"), true, "ブラックでは告発リスクを隠すこと");
console.log("SMOKE NEWGAME OK");
