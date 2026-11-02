// アプリ全体制御：画面遷移と配線（タイトル／設定／社長室／布告エディタ／台帳）。
import {
defaultState,
loadState,
saveState,
resetAll,
getApiKey,
setApiKey,
getCallCount,
} from "./store.js?v=20261102.5";
import { testConnection, probeModels} from "./llm.js?v=20261102.5";
import {
validateRecord,
registerRule,
abolishRule,
activeRules,
aggregateTags,
detectContradictions,
previewText,
} from "./ledger.js?v=20261102.5";
import { extractRule} from "./extract.js?v=20261102.5";

const screens = ["title", "settings", "office", "editor", "ledger"];
let state = loadState();
let draft = null; // プレビュー中のレコード候補
let draftConflicts = [];

const $ = (id) => document.getElementById(id);

function show(name) {
for (const s of screens) {
$(`screen-${s}`).classList.toggle("active", s === name);
}
if (name === "office") renderOffice();
if (name === "settings") renderSettings();
if (name === "editor") renderEditor();
if (name === "ledger") renderLedger();
}

function requireState() {
if (state) return true;
alert("先にタイトル画面で「はじめから」を選んでください。");
show("title");
return false;
}

/* ---------- 社長室 ---------- */
function renderOffice() {
if (!state) return;
$("st-mode").textContent =
state.mode === "black"? "ブラック": state.mode === "white"? "ホワイト": "-";
$("st-week").textContent = String(state.week);
$("st-funds").textContent = state.funds.toLocaleString("ja-JP");
$("st-employees").textContent = String(state.employees.length);
const active = activeRules(state.ledger);
const conflicts = active.filter((r) => (r.contradictions || []).length > 0).length;
const agg = aggregateTags(state.ledger);
const topTags = Object.entries(agg)
.filter(([, v]) => v.effective > 0)
.sort((a, b) => b[1].effective - a[1].effective)
.slice(0, 3)
.map(([t, v]) => `${t} ${v.effective}`);
$("ledger-summary").textContent =
`有効な社訓 ${active.length} 件／矛盾の記録 ${conflicts} 件／造語 ${state.glossary.length} 件` +
(topTags.length? `／主な効果：${topTags.join("、")}`: "");
}

/* ---------- 設定 ---------- */
function renderSettings() {
$("input-apikey").value = getApiKey();
$("call-count").textContent = String(getCallCount());
$("test-result").textContent = "";
}

/* ---------- 布告エディタ ---------- */
function renderEditor() {
draft = null;
draftConflicts = [];
$("ed-status").textContent = "";
$("ed-preview-wrap").classList.add("hidden");
}

function recordSummary(r) {
const lines = [
`原文：${r.text}`,
`対象：${r.target}／種別：${r.kind}／方向：${r.direction}`,
`効果タグ：${r.tag}（強度${r.strength}）／優先度：${r.priority}`,
];
if (r.metric) lines.push(`数値：${r.metric.label} ${r.metric.value}${r.metric.unit}`);
if (r.condition) lines.push(`条件：${r.condition}`);
if (r.exception) lines.push(`例外：${r.exception}`);
return lines.join("\n");
}

function showDraftPreview() {
if (!draft ||!state) return;
draftConflicts = detectContradictions(draft, state.ledger);
$("ed-fields").textContent = recordSummary(draft);
$("ed-preview").textContent = previewText(draft, state.ledger);
const box = $("ed-conflicts");
box.innerHTML = "";
if (draftConflicts.length) {
const p = document.createElement("p");
p.className = "warn";
p.textContent =
"⚠ 矛盾の警告：" +
draftConflicts.map((c) => `${c.message}`).join("／") +
"。登録すると矛盾として記録され、信仰度や告発リスクに影響します。避けるには、台帳側の古いルールを先に廃止してください（正式な改訂）。";
box.appendChild(p);
$("btn-register").textContent = "矛盾を承知で登録する";
} else {
$("btn-register").textContent = "この内容で台帳に登録";
}
$("ed-preview-wrap").classList.remove("hidden");
}

async function onExtract() {
if (!requireState()) return;
const text = $("ed-text").value.trim();
if (!text) {
$("ed-status").textContent = "社訓を入力してください。";
return;
}
const btn = $("btn-extract");
btn.disabled = true;
$("ed-status").textContent = "構造化中…（AIが読み解いています）";
try {
const result = await extractRule(text);
if (result.ok) {
draft = result.record;
$("ed-status").textContent = "構造化できました。内容を確認してください。";
showDraftPreview();
} else {
draft = null;
$("ed-status").textContent =
`構造化が安定しませんでした（${result.errors.join("；")}）。手入力フォームに原文を移したので、タグだけ選んで登録できます。`;
$("m-text").value = text;
$("manual-form").open = true;
}
} catch (e) {
draft = null;
$("ed-status").textContent =
`構造化できませんでした：${e.message}。APIキーと生成テストの状態を確認するか、手入力フォームを使ってください。`;
$("m-text").value = text;
} finally {
btn.disabled = false;
}
}

function onManualPreview() {
if (!requireState()) return;
const metricLabel = $("m-metric-label").value.trim();
const metricValue = $("m-metric-value").value;
const input = {
text: $("m-text").value,
target: $("m-target").value,
kind: $("m-kind").value,
direction: $("m-direction").value,
condition: $("m-condition").value,
exception: $("m-exception").value,
metric: metricLabel
? { label: metricLabel, value: Number(metricValue), unit: $("m-metric-unit").value}
: null,
tag: $("m-tag").value,
strength: Number($("m-strength").value),
priority: 1,
behavior: $("m-behavior").value,
sideEffect: $("m-side").value,
};
const v = validateRecord(input);
if (!v.ok) {
$("ed-status").textContent = `入力を確認してください：${v.errors.join("；")}`;
return;
}
draft = v.record;
$("ed-status").textContent = "手入力の内容でプレビューします。";
showDraftPreview();
}

function onRegister() {
if (!requireState() ||!draft) return;
const entry = registerRule(state, draft, draftConflicts.map((c) => c.withId));
saveState(state);
draft = null;
draftConflicts = [];
$("ed-text").value = "";
$("ed-preview-wrap").classList.add("hidden");
$("ed-status").textContent = `台帳に登録しました（${entry.id}）。`;
}

/* ---------- 台帳ビューア ---------- */
function renderLedger() {
if (!state) return;
const agg = aggregateTags(state.ledger);
const tagLines = Object.entries(agg)
.filter(([, v]) => v.count > 0)
.map(([t, v]) => `${t}：実効 ${v.effective}（登録 ${v.count} 件・素の合計 ${v.raw}）`);
$("lg-tags").textContent = tagLines.length? tagLines.join("\n"): "まだ社訓がありません。";
const list = $("lg-list");
list.innerHTML = "";
if (!state.ledger.length) {
list.innerHTML = '<p class="note">登録されたルールはありません。</p>';
}
for (const r of state.ledger) {
const card = document.createElement("div");
card.className = "card";
const head = document.createElement("div");
const badge = document.createElement("span");
badge.className = "badge" + (r.status === "active"? "": " off");
badge.textContent = r.status === "active"? "有効": "廃止";
head.appendChild(badge);
const title = document.createElement("strong");
title.textContent = ` ${r.text}`;
head.appendChild(title);
card.appendChild(head);
const meta = document.createElement("p");
meta.className = "note";
meta.textContent =
`${r.kind}／${r.direction}／対象：${r.target}／${r.tag}（強度${r.strength}）／第${r.createdWeek}週に登録` +
(r.metric? `／${r.metric.label} ${r.metric.value}${r.metric.unit}`: "") +
((r.contradictions || []).length? `／⚠ 矛盾の記録あり（${r.contradictions.length}件）`: "");
card.appendChild(meta);
if (r.status === "active") {
const btn = document.createElement("button");
btn.className = "secondary";
btn.textContent = "廃止する（正式な改訂）";
btn.addEventListener("click", () => {
if (confirm(`「${r.text}」を廃止しますか？廃止は正式な改訂手続きとして扱われ、ペナルティはありません。`)) {
abolishRule(state, r.id, "台帳ビューアから廃止");
saveState(state);
renderLedger();
renderOffice();
}
});
card.appendChild(btn);
}
list.appendChild(card);
}
const gl = $("gl-list");
gl.innerHTML = "";
if (!state.glossary.length) {
gl.innerHTML = '<p class="note">造語はまだありません。</p>';
}
state.glossary.forEach((g, i) => {
const row = document.createElement("div");
row.className = "card";
const p = document.createElement("p");
p.textContent = `「${g.term}」― ${g.definition}`;
row.appendChild(p);
const btn = document.createElement("button");
btn.className = "secondary";
btn.textContent = "削除";
btn.addEventListener("click", () => {
state.glossary.splice(i, 1);
saveState(state);
renderLedger();
renderOffice();
});
row.appendChild(btn);
gl.appendChild(row);
});
}

function onGlossaryAdd() {
if (!requireState()) return;
const term = $("gl-term").value.trim();
const definition = $("gl-def").value.trim();
if (!term ||!definition) return;
state.glossary.push({ term, definition, createdWeek: state.week});
saveState(state);
$("gl-term").value = "";
$("gl-def").value = "";
renderLedger();
renderOffice();
}

/* ---------- タイトル画面 ---------- */
$("btn-new").addEventListener("click", () => {
$("mode-select").classList.remove("hidden");
});
document.querySelectorAll(".mode-btn").forEach((btn) => {
btn.addEventListener("click", () => {
state = defaultState();
state.mode = btn.dataset.mode;
saveState(state);
show("office");
});
});
$("btn-continue").addEventListener("click", () => {
state = loadState();
if (!state) {
alert("セーブデータがありません。");
return;
}
show("office");
});
$("btn-settings").addEventListener("click", () => show("settings"));

/* ---------- 設定画面 ---------- */
$("btn-save-key").addEventListener("click", () => {
setApiKey($("input-apikey").value.trim());
$("test-result").textContent = "保存しました。";
});
$("btn-test-key").addEventListener("click", async () => {
const el = $("test-result");
el.textContent = "接続テスト中…";
const result = await testConnection();
el.textContent = result.message;
});
$("btn-probe").addEventListener("click", async () => {
const el = $("test-result");
const btn = $("btn-probe");
btn.disabled = true;
el.textContent = "生成テスト中…（数回だけ実際に呼び出します）";
try {
const result = await probeModels();
el.textContent = result.message;
} catch (e) {
el.textContent = `生成テストに失敗しました：${e.message}`;
} finally {
btn.disabled = false;
$("call-count").textContent = String(getCallCount());
}
});
$("btn-reset").addEventListener("click", () => {
if (confirm("セーブデータと呼び出し回数を初期化します。APIキーは残ります。よろしいですか？")) {
resetAll();
state = null;
renderSettings();
$("test-result").textContent = "初期化しました。";
}
});
$("btn-back-from-settings").addEventListener("click", () => show("title"));

/* ---------- 社長室・遷移 ---------- */
$("btn-to-editor").addEventListener("click", () => {
if (requireState()) show("editor");
});
$("btn-to-ledger").addEventListener("click", () => {
if (requireState()) show("ledger");
});
$("btn-back-from-office").addEventListener("click", () => show("title"));
$("btn-back-from-editor").addEventListener("click", () => show("office"));
$("btn-back-from-ledger").addEventListener("click", () => show("office"));

/* ---------- エディタ・台帳の操作 ---------- */
$("btn-extract").addEventListener("click", onExtract);
$("btn-manual-preview").addEventListener("click", onManualPreview);
$("btn-register").addEventListener("click", onRegister);
$("btn-gl-add").addEventListener("click", onGlossaryAdd);

show("title");
