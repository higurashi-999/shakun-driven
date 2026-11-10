import assert from "node:assert/strict";
import { installBrowserStubs, click, elements, makeFixture } from "./smoke-helper.mjs";

// M17.2 回帰テスト：1on1の会話ログがLINE風（社員の吹き出し横に顔写真アバター）で描画されること
installBrowserStubs(makeFixture("white"));
await import("../js/app.js");

click("btn-continue");
click("btn-interview");
click("iv-emp-emp-1"); // 高嶺 澪との1on1を開始

const log = elements.get("iv-log");
assert.equal(log.children.length, 1, "開始直後は相手の第一声だけ");
const opening = log.children[0];
assert.equal(opening.className, "chat-row emp");
assert.equal(opening.children.length, 2, "社員の行はアバター＋吹き出し");
assert.equal(opening.children[0].className, "chat-av", "先頭は顔写真アバター");
assert.ok(opening.children[0].src.startsWith("data:image/webp"), "アバターにキャラ絵が入ること");
assert.equal(opening.children[1].className, "chat-bubble");

// 発言を送ると、社長（右・吹き出しのみ）と相手（アバター付き）の行が増える
globalThis.document.getElementById("iv-response").value = "いつもありがとう。調子はどうですか";
click("btn-iv-send");
for (let i = 0; i < 20 && log.children.length < 3; i++) await new Promise((r) => setTimeout(r, 25));
assert.equal(log.children.length, 3, "社長の発言と相手の返答が追加されること");
assert.equal(log.children[1].className, "chat-row me");
assert.equal(log.children[1].children.length, 1, "社長の行は吹き出しのみ");
assert.equal(log.children[2].className, "chat-row emp");
assert.equal(log.children[2].children[0].className, "chat-av", "返答にもアバターが付くこと");
console.log("SMOKE INTERVIEW OK");
