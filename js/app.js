// アプリ全体制御：画面遷移と配線（タイトル／設定／社長室／布告エディタ／台帳／結果）。
import {
defaultState,
loadState,
saveState,
resetAll,
getApiKey,
setApiKey,
getCallCount,
} from "./store.js?v=20261102.12";
import { testConnection, probeModels, callLLM } from "./llm.js?v=20261102.12";
import {
validateRecord,
registerRule,
abolishRule,
activeRules,
aggregateTags,
detectContradictions,
previewText,
} from "./ledger.js?v=20261102.12";
import { extractRule} from "./extract.js?v=20261102.12";
import { initialEmployees} from "./employees.js?v=20261102.12";
import { simulateWeek, summarize, PHASE_TAG_MODIFIERS } from "./sim.js?v=20261102.12";
import { drawEventId, getEvent, resolveEvent, buildEventJudgePrompt, parseEventJudgeResult } from "./events.js?v=20261102.12";
import { narrateWeek } from "./report.js?v=20261102.12";

import { judgeLoan, judgeInterview, pickInterviewTarget, detectConcern, buildInterviewPrompt, INTERVIEW_FALLBACK_LINES, CONCERNS, evaluateRun, rankOf } from "./scenes.js?v=20261102.12";

const screens = ["title", "settings", "office", "editor", "ledger", "result", "event", "loan", "interview"];
let state = loadState();
let draft = null; // プレビュー中のレコード候補
let draftConflicts = [];

const $ = (id) => document.getElementById(id);

function show(name) {
document.body.dataset.mode = state && state.mode ? state.mode : "";
for (const s of screens) {
$(`screen-${s}`).classList.toggle("active", s === name);
}
if (name === "office") renderOffice();
if (name === "settings") renderSettings();
if (name === "editor") renderEditor();
if (name === "ledger") renderLedger();
if (name === "result") renderResult();
if (name === "event") renderEvent();
if (name === "loan") renderLoan();
if (name === "interview") renderInterview();
}

function requireState() {
if (state) return true;
alert("先にタイトル画面で「はじめから」を選んでください。");
show("title");
return false;
}

// M2以前のセーブへの移行：社員と新フィールドを補う
function migrateState() {
if (!state) return;
let changed = false;
if (!state.employees || state.employees.length === 0) {
state.employees = initialEmployees();
changed = true;
}
if (state.reputation == null) { state.reputation = 50; changed = true;}
if (!state.status) { state.status = "playing"; changed = true;}
if (state.rngState == null) { state.rngState = state.seed; changed = true;}
if (!Array.isArray(state.eventHistory)) { state.eventHistory = []; changed = true;}
if (changed) saveState(state);
}

/* ---------- 社長室 ---------- */
function moodOf(e) {
if (e.fatigue >= 85 || e.dissatisfaction >= 80) return "😵";
if (e.fatigue >= 65 || e.dissatisfaction >= 60) return "😩";
if (e.faith >= 65 && e.fatigue < 50) return "😄";
return "🙂";
}
function snapshotOf(s) {
const n = s.employees.length || 1;
return {
funds: s.funds, employees: s.employees.length,
avgFaith: Math.round((s.employees.reduce((a, e) => a + e.faith, 0) / n) * 10) / 10,
avgFatigue: Math.round((s.employees.reduce((a, e) => a + e.fatigue, 0) / n) * 10) / 10,
reputation: s.reputation, risk: s.risk,
};
}
function renderOffice() {
if (!state) return;
migrateState();
$("st-mode").textContent =
state.mode === "black"? "ブラック": state.mode === "white"? "ホワイト": "-";
$("st-week").textContent = String(Math.min(state.week, 6));
$("st-funds").textContent = state.funds.toLocaleString("ja-JP");
$("st-employees").textContent = String(state.employees.length);
$("st-rep").textContent = `${state.reputation}（${state.reputation >= 60 ? "良好" : state.reputation >= 40 ? "普通" : "低迷"}）`;
if (state.mode === "black") $("st-risk-wrap").classList.add("hidden");
else {
$("st-risk-wrap").classList.remove("hidden");
$("st-risk").textContent = `${state.risk}（${state.risk >= 35 ? "危険" : state.risk >= 20 ? "注意" : "安全"}）`;
}
$("funds-note").textContent = state.lastProfit == null ? "" :
state.lastProfit > 0 ? `直近週の収支：+${state.lastProfit}万円（黒字）` :
state.lastProfit < 0 ? `直近週の収支：${state.lastProfit}万円 ― このペースだと資金はあと約${Math.max(1, Math.floor(state.funds / -state.lastProfit))}週もちます` :
"直近週の収支：±0万円";
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
// 目標パネル（M6）
$("goal-progress-label").textContent = `第${Math.min(state.week, 6)}週／全6週`;
$("goal-progress-bar").style.width = `${Math.round((Math.min(Math.max(state.week - 1, 0), 6) / 6) * 100)}%`;
$("goal-next").textContent =
state.status!== "playing" ? "創業期は終了しました。結果画面で最終評価を確認できます。" :
!state.loanDone && state.week <= 4 ? "次の山場：第4週の融資審査 ― 優遇の目安は「矛盾なし・資金800万円以上・平均信仰度55以上」です。" :
!state.loanDone ? "融資審査がまだ終わっていません。「融資審査を受ける」から審査へ進めます。" :
"次の山場：あとは6週完走が目標です。退職者を出さず、資金を守り切りましょう。";
// 初回ガイド（M6）
const guideSteps = [
{ label: "社訓を1件、布告してみる", done: active.length >= 1 },
{ label: "「週を進める」で1週間を回してみる", done: state.week >= 2 },
{ label: "イベントが起きたら布告で対応する（静観も立派な選択肢）", done: (state.eventHistory || []).length >= 1 || state.week >= 3 },
{ label: "第4週の融資審査に備える（矛盾ゼロ・資金と信仰度を保つ）", done: !!state.loanDone },
];
$("guide-panel").classList.toggle("hidden", !!state.guideClosed || guideSteps.every((g) => g.done));
$("guide-steps").innerHTML = guideSteps.map((g) => `<li class="${g.done ? "done" : ""}">${g.done ? "✓ " : ""}${g.label}</li>`).join("");
const empList = $("emp-list");
empList.innerHTML = "";
for (const e of state.employees) {
const card = document.createElement("div");
card.className = "card";
const name = document.createElement("strong");
name.textContent = e.name;
card.appendChild(name);
const meta = document.createElement("p");
meta.className = "note";
meta.textContent = state.mode === "black"
? `能力${e.ability}／体力${e.stamina}／忠誠${e.loyalty}／野心${e.ambition} ― 疲労 ？？・不満 ？？・信仰度 ${e.faith}`
: `能力${e.ability}／体力${e.stamina}／忠誠${e.loyalty}／野心${e.ambition} ― 疲労 ${e.fatigue}・不満 ${e.dissatisfaction}・信仰度 ${e.faith}`;
card.appendChild(meta);
if (state.mode!== "black") name.textContent = `${moodOf(e)} ${e.name}`;
const meters = document.createElement("div");
meters.className = "meters";
const meter = (label, value, kind) => {
const row = document.createElement("div");
row.className = "meter-row";
const lv = kind === "faith" ? (value <= 30 ? "danger" : value < 45 ? "warn" : "safe") : value >= (kind === "fatigue" ? 85 : 80) ? "danger" : value >= (kind === "fatigue" ? 65 : 50) ? "warn" : "safe";
row.innerHTML = `<span class="meter-label">${label}</span><span class="meter"><span class="meter-fill ${lv}" style="width:${value}%"></span></span><span class="meter-val">${value}</span>`;
return row;
};
if (state.mode!== "black") {
meters.appendChild(meter("疲労", e.fatigue, "fatigue"));
meters.appendChild(meter("不満", e.dissatisfaction, "diss"));
}
meters.appendChild(meter("信仰", e.faith, "faith"));
card.appendChild(meters);
if (state.mode!== "black" && (e.fatigue >= 85 || e.dissatisfaction >= 80)) {
const b = document.createElement("span");
b.className = "badge danger";
b.textContent = "退職圏";
card.appendChild(b);
} else if (state.mode!== "black" && (e.fatigue >= 65 || e.dissatisfaction >= 50)) {
const b = document.createElement("span");
b.className = "badge warn";
b.textContent = "注意";
card.appendChild(b);
}
empList.appendChild(card);
}
// 週報のハイライトと前週比（M6）
const highlights = (state.lastReport || []).filter((l) => /^(⚠|💼|🎉|💸|【融資審査】|【面談】)/.test(l)).slice(0, 2);
if (state.lastReport && highlights.length) {
$("report-highlights").innerHTML = "<strong>今週のハイライト</strong>" + highlights.map((l) => `<div>${l}</div>`).join("");
$("report-highlights").classList.remove("hidden");
} else $("report-highlights").classList.add("hidden");
const ps = state.prevSnapshot;
if (ps && state.lastReport) {
const cur = snapshotOf(state);
const parts = [];
const dpart = (label, a, b, goodWhenUp) => {
const diff = Math.round((b - a) * 10) / 10;
if (!diff) return;
const good = goodWhenUp ? diff > 0 : diff < 0;
parts.push(`<span class="${good ? "up" : "down"}">${label} ${diff > 0 ? "▲+" + diff : "▼" + diff}</span>`);
};
dpart("資金", ps.funds, cur.funds, true);
dpart("平均信仰", ps.avgFaith, cur.avgFaith, true);
dpart("平均疲労", ps.avgFatigue, cur.avgFatigue, false);
dpart("評判", ps.reputation, cur.reputation, true);
if (state.mode!== "black") dpart("リスク", ps.risk, cur.risk, false);
$("report-diff").innerHTML = parts.length ? "前週比：" + parts.join("　") : "";
$("report-diff").classList.toggle("hidden", !parts.length);
} else $("report-diff").classList.add("hidden");
if (state.reportText) {
$("week-report").textContent = state.reportText;
$("week-report-raw").textContent = (state.lastReport || []).join("\n");
$("report-raw-wrap").classList.remove("hidden");
} else if (state.lastReport) {
$("week-report").textContent = state.lastReport.join("\n");
$("report-raw-wrap").classList.add("hidden");
}
$("btn-advance").disabled = state.status!== "playing";
$("btn-result").classList.toggle("hidden", state.status === "playing");
// 融資審査（第4週を過ぎても未実施なら社長室から受けられる）
$("btn-loan").classList.toggle("hidden", !(state.status === "playing" && !state.loanDone && state.week >= 5));
// 面談（退職相談）：対象がいて、今週まだ使っていなければ可
const ivTarget = state.status === "playing" ? pickInterviewTarget(state) : null;
const ivUsed = state.interviewUsedWeek === state.week;
$("btn-interview").disabled = !ivTarget || ivUsed;
$("btn-interview").textContent = ivTarget ? `面談する（${ivTarget.name}）` : "面談する（退職相談）";
$("office-note").textContent =
state.status!== "playing" ? "" :
ivUsed ? "今週の面談は済んでいます。" :
!ivTarget ? "今は退職相談を持ちかける社員はいません。" :
state.mode === "black"
? `${ivTarget.name} の様子がおかしいようです。`
: `${ivTarget.name} の様子がおかしいようです（疲労 ${ivTarget.fatigue}／不満 ${ivTarget.dissatisfaction}／信仰度 ${ivTarget.faith}）。`;
}

function onAdvance() {
if (!requireState() || state.status!== "playing") return;
migrateState();
const processedWeek = state.week;
const ctx = {
tags: aggregateTags(state.ledger),
contradictions: activeRules(state.ledger).reduce((s, r) => s + (r.contradictions || []).length, 0),
glossary: state.glossary.length,
};
state.prevSnapshot = snapshotOf(state);
const out = simulateWeek(state, ctx);
state = out.state;
state.lastReport = out.log;
state.reportText = null;
saveState(state);
if (state.status!== "playing") {
show("result");
return;
}
// 第4週は初回融資審査（固定イベント）がランダムイベントに代わる
if (processedWeek === 4 && !state.loanDone) {
show("loan");
return;
}
// 今週のイベント（前週に引いた pending があればそれ、なければ今引く）
let eventId = state.pendingEventId;
if (!eventId) eventId = drawEventId(state, processedWeek);
state.pendingEventId = null;
const ev = getEvent(eventId);
if (ev) {
state.currentEvent = { id: ev.id};
state.eventHistory = [...(state.eventHistory || []), ev.id];
saveState(state);
show("event");
} else {
finishWeek();
}
}

// 週の締め：次週イベントの抽選と兆し、週報ナレーション（LLM不通時は素材ログのまま）
function finishWeek() {
if (state.status === "playing" && state.week === 4 && !state.loanDone) {
// 来週（第4週）は融資審査。ランダムイベントは引かず、兆しだけ出す
state.lastReport = [...(state.lastReport || []), "🔮 来週は初回融資審査があります。台帳の整合性と実績が問われます。"];
} else if (state.status === "playing" && state.week <= 5) {
const nextId = drawEventId(state, state.week);
state.pendingEventId = nextId;
const ev = getEvent(nextId);
if (ev && ev.omen) {
state.lastReport = [...(state.lastReport || []), `🔮 兆し：${ev.omen}`];
}
}
saveState(state);
show("office");
const weekNo = state.week - 1;
const logSnapshot = state.lastReport;
narrateWeek(state, logSnapshot, weekNo).then((text) => {
if (text && state.lastReport === logSnapshot) {
state.reportText = text;
saveState(state);
renderOffice();
}
}).catch(() => { /* LLM不通時は素材ログ表示のまま */ });
}

// フェーズ調整済みの実効タグ（単純マップ）— イベント判定用
function phaseTagsMap() {
const agg = aggregateTags(state.ledger);
const mods = PHASE_TAG_MODIFIERS[state.phase] || {};
const out = {};
for (const [t, v] of Object.entries(agg)) out[t] = v.effective * (mods[t] ?? 1);
return out;
}

/* ---------- イベント画面 ---------- */
function renderEvent() {
if (!state || !state.currentEvent) return;
const ev = getEvent(state.currentEvent.id);
if (!ev) return;
$("ev-title").textContent = ev.title;
$("ev-category").textContent = `カテゴリ：${ev.category}`;
$("ev-body").textContent = ev.body;
$("ev-hint").textContent = `関係しそうな社訓：${ev.goodTags.join("・") || "―"} が効き、${ev.badTags.join("・") || "―"} は裏目に出やすい`;
$("ev-response").value = "";
$("ev-action-wrap").classList.remove("hidden");
$("ev-result-wrap").classList.add("hidden");
}

async function onEventResolve(action) {
if (!state || !state.currentEvent) return;
const ev = getEvent(state.currentEvent.id);
if (!ev) return;
// 布告文がある場合は生成AIが内容を判定する（失敗時は従来のコード判定にフォールバック）
let aiJudge = null;
if (action.type === "respond" && action.text && action.text.trim()) {
const btn = $("btn-ev-respond");
btn.disabled = true;
btn.textContent = "AIが判定中…";
try {
const raw = await callLLM("structure", buildEventJudgePrompt(state, ev, action.text), { json: true, temperature: 0.2, maxOutputTokens: 300 });
aiJudge = parseEventJudgeResult(raw);
} catch { aiJudge = null; }
btn.disabled = false;
btn.textContent = "この内容で対応する";
}
const res = resolveEvent(state, ev, action, phaseTagsMap(), state.glossary.length, aiJudge);
state = res.state;
state.lastReport = [...(state.lastReport || []), ...res.lines];
state.currentEvent = null;
saveState(state);
$("ev-result").textContent = res.lines.join("\n");
$("ev-action-wrap").classList.add("hidden");
$("ev-result-wrap").classList.remove("hidden");
}

/* ---------- 融資審査 ---------- */
function renderLoan() {
if (!state) return;
if (state.loanDone && state.loanResult) {
const r = state.loanResult;
$("loan-result").textContent = `【融資審査】スコア ${r.score} ― ${r.grade}` + (r.amount > 0 ? `\n融資 ${r.amount} 万円（金利 ${r.rate}%）が実行済みです。` : "\n今回は融資が通りませんでした。");
$("loan-intro").classList.add("hidden");
$("loan-result-wrap").classList.remove("hidden");
} else {
$("loan-intro").classList.remove("hidden");
$("loan-result-wrap").classList.add("hidden");
}
}

function onLoanApply() {
if (!state || state.loanDone) return;
const res = judgeLoan(state, phaseTagsMap());
state = res.state;
state.lastReport = [...(state.lastReport || []), ...res.lines];
saveState(state);
$("loan-result").textContent = res.lines.join("\n");
$("loan-intro").classList.add("hidden");
$("loan-result-wrap").classList.remove("hidden");
}

/* ---------- 面談 ---------- */
function renderInterview() {
if (!state || !state.interview) return;
const emp = state.employees.find((e) => e.id === state.interview.empId);
if (!emp) return;
const concern = CONCERNS[state.interview.concernKey];
$("iv-who").textContent = state.mode === "black"
? `${emp.name} ― 状態の詳細は伏せられています（訴え：${concern.label}）`
: `${emp.name} ― 疲労 ${emp.fatigue}／不満 ${emp.dissatisfaction}／信仰度 ${emp.faith}（訴え：${concern.label}）`;
$("iv-opening").textContent = concern.opening;
$("iv-response").value = "";
$("iv-action-wrap").classList.remove("hidden");
$("iv-result-wrap").classList.add("hidden");
}

async function onInterviewSend() {
if (!state || !state.interview) return;
const empId = state.interview.empId;
const concernKey = state.interview.concernKey;
const empBefore = state.employees.find((e) => e.id === empId);
const text = $("iv-response").value;
const res = judgeInterview(state, empId, text, phaseTagsMap());
if (!res) return;
state = res.state;
state.lastReport = [...(state.lastReport || []), ...res.lines];
saveState(state);
$("iv-result").textContent = res.lines.join("\n");
$("iv-reply").textContent = INTERVIEW_FALLBACK_LINES[res.outcome];
$("iv-action-wrap").classList.add("hidden");
$("iv-result-wrap").classList.remove("hidden");
// 社員の台詞はLLMが書く（判定はコードで確定済み）。不通なら定型文のまま
try {
const reply = await callLLM("main", buildInterviewPrompt(state, empBefore, concernKey, text, res.outcome), { temperature: 0.8, maxOutputTokens: 200 });
if (reply && $("screen-interview").classList.contains("active")) {
$("iv-reply").textContent = String(reply).trim();
}
} catch { /* 定型文のまま */ }
}

/* ---------- 結果画面 ---------- */
function renderResult() {
if (!state) return;
const s = summarize(state);
$("result-title").textContent =
s.status === "cleared"? "🎉 創業期クリア":
s.status === "bankrupt"? "💸 倒産":
s.status === "empty"? "💸 社員が全員退職": "結果";
$("result-summary").textContent = [
`経過：${s.weeks} 週`,
`資金：${s.funds} 万円`,
`社員：${s.employees} 人`,
`平均信仰度：${s.avgFaith}／平均疲労：${s.avgFatigue}`,
`評判：${s.reputation}／告発リスク蓄積：${s.risk}`,
`有効な社訓：${s.rules} 件`,
"",
...(() => {
const ev2 = evaluateRun(state);
return state.mode === "black"
? [`企業価値：${ev2.value}`, `最終スコア：${ev2.score}（ブラック：企業価値のみで評価。疲労・不満・告発リスクはプレイ中非表示でした）`, `ランク：${rankOf(ev2.score).rank}${rankOf(ev2.score).next ? `（あと ${rankOf(ev2.score).next.gap} 点で ${rankOf(ev2.score).next.rank}）` : "（最高ランクです）"}`]
: [`企業価値：${ev2.value}／健全度：${ev2.health}`, `最終スコア：${ev2.score}（ホワイト：企業価値 ×（0.7＋0.3×健全度））`, `ランク：${rankOf(ev2.score).rank}${rankOf(ev2.score).next ? `（あと ${rankOf(ev2.score).next.gap} 点で ${rankOf(ev2.score).next.rank}）` : "（最高ランクです）"}`];
})(),
].join("\n");
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
}

/* ---------- タイトル画面 ---------- */
$("btn-new").addEventListener("click", () => {
$("mode-select").classList.remove("hidden");
});
document.querySelectorAll(".mode-btn").forEach((btn) => {
btn.addEventListener("click", () => {
state = defaultState(btn.dataset.mode);
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
$("btn-advance").addEventListener("click", onAdvance);
$("btn-ev-respond").addEventListener("click", () => onEventResolve({ type: "respond", text: $("ev-response").value }));
$("btn-ev-ignore").addEventListener("click", () => onEventResolve({ type: "ignore" }));
$("btn-ev-done").addEventListener("click", () => {
if (state && state.status!== "playing") show("result");
else finishWeek();
});
$("btn-loan").addEventListener("click", () => show("loan"));
$("btn-loan-apply").addEventListener("click", onLoanApply);
$("btn-loan-done").addEventListener("click", () => {
if (state && state.status!== "playing") show("result");
else finishWeek();
});
$("btn-interview").addEventListener("click", () => {
if (!requireState()) return;
const target = pickInterviewTarget(state);
if (!target) return;
state.interview = { empId: target.id, concernKey: detectConcern(target) };
saveState(state);
show("interview");
});
$("btn-iv-send").addEventListener("click", onInterviewSend);
$("btn-iv-done").addEventListener("click", () => {
if (state && state.status!== "playing") show("result");
else show("office");
});
$("btn-result").addEventListener("click", () => show("result"));
$("btn-result-to-title").addEventListener("click", () => show("title"));

/* ---------- エディタ・台帳の操作 ---------- */
$("btn-extract").addEventListener("click", onExtract);
$("btn-manual-preview").addEventListener("click", onManualPreview);
$("btn-register").addEventListener("click", onRegister);
$("btn-gl-add").addEventListener("click", onGlossaryAdd);

show("title");
$("btn-guide-close").addEventListener("click", () => {
if (!state) return;
state.guideClosed = true;
saveState(state);
$("guide-panel").classList.add("hidden");
});
