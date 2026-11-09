// アプリ全体制御：画面遷移と配線（タイトル／設定／社長室／社訓エディタ／台帳／結果）。
import {
defaultState,
loadState,
saveState,
resetAll,
getApiKey,
setApiKey,
getCallCount,
} from "./store.js?v=20261102.25";
import { testConnection, probeModels, callLLM } from "./llm.js?v=20261102.25";
import {
registerRule,
abolishRule,
activeRules,
activeCount,
MAX_ACTIVE_RULES,
aggregateEffects,
effectsText,
AXIS_LABEL,
budgetForLength,
previewText,
} from "./ledger.js?v=20261102.25";
import { extractRule} from "./extract.js?v=20261102.25";
import { initialEmployees, getCharacter } from "./employees.js?v=20261102.25";
import { simulateMonth, summarize, salaryOf, PARAMS, deptSummary } from "./sim.js?v=20261102.25";
import { ensureCandidates, hireCandidate } from "./hiring.js?v=20261102.25";
import { drawEventId, getEvent, resolveEvent, buildEventJudgePrompt, parseEventJudgeResult } from "./events.js?v=20261102.25";
import { narrateMonth } from "./report.js?v=20261102.25";

import { judgeLoan, evaluateRun, rankOf, oneOnOneInitialPoints, clampPointDelta, judgeOneOnOne, buildOneOnOnePrompt, parseOneOnOneReply, ONE_ON_ONE_MAX_TURNS, ONE_ON_ONE_FALLBACKS } from "./scenes.js?v=20261102.25";
import { TITLE_ART } from "./assets.js?v=20261102.25";

const screens = ["title", "settings", "office", "editor", "ledger", "result", "event", "loan", "interview", "hire"];
let state = loadState();
let draft = null; // プレビュー中のレコード候補

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
if (name === "hire") renderHire();
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
// M11：モード未保存セーブの移行（モード保存バグのあった期間のセーブは、本人の開始モード＝ブラックとして引き継ぐ）
if (!state.mode) { state.mode = "black"; changed = true; }
// M11：社員モデルの2軸化（疲労→体力ゲージ、不満・忠誠は廃止）
for (const e of state.employees || []) {
if (e.hp == null) { e.hp = Math.max(0, Math.min(100, 100 - (e.fatigue ?? 20))); changed = true; }
if ("fatigue" in e) { delete e.fatigue; changed = true; }
if ("dissatisfaction" in e) { delete e.dissatisfaction; changed = true; }
if ("loyalty" in e) { delete e.loyalty; changed = true; }
}
// M13：人件費の材料（経験区分・入社週）の既定値を補う
for (const e of state.employees || []) {
if (!e.expTier) { e.expTier = "中堅"; changed = true; }
if (e.hiredWeek == null) { e.hiredWeek = 1; changed = true; }
}
// M14：週→月への移行（旧セーブは月へ読み替え、資金は月次スケールへ約4.3倍換算する）
if (state.month == null) {
state.month = state.week ?? 1;
state.funds = Math.round((state.funds || 0) * 4.33);
if (state.lastProfit != null) state.lastProfit = Math.round(state.lastProfit * 4.33);
if (state.interviewUsedMonth == null) state.interviewUsedMonth = state.oneOnOneWeek ?? state.interviewUsedWeek ?? 0;
if (state.lastSwapMonth == null) state.lastSwapMonth = state.lastSwapWeek ?? -1;
if (state.abolishedMonth == null) state.abolishedMonth = state.abolishedWeek ?? -1;
state.candidates = null;
changed = true;
}
if (state.hireUsedMonth == null) { state.hireUsedMonth = 0; changed = true; }
for (const e of state.employees || []) {
if (e.hiredMonth == null) { e.hiredMonth = e.hiredWeek ?? 1; changed = true; }
if (!e.dept) { e.dept = e.id === "emp-4" ? "indirect" : "direct"; changed = true; }
if (!e.role) { e.role = (e.id === "emp-1" || e.id === "emp-4") ? "manager" : "member"; changed = true; }
}
for (const r of state.ledger || []) if (r.createdMonth == null && r.createdWeek != null) { r.createdMonth = r.createdWeek; changed = true; }
for (const g of state.glossary || []) if (g.createdMonth == null && g.createdWeek != null) { g.createdMonth = g.createdWeek; changed = true; }
// M13：旧タグ形式の社訓は、効果を持つ社訓として読み替えず、効果なし（要・再登録）として扱う（aggregateEffects が読み飛ばす）
// M11：1on1セッションは週をまたいだら閉じる
if (state.oneOnOne && state.oneOnOne.month !== state.month) { state.oneOnOne = null; changed = true; }
// M10：社訓3枠制への移行（有効が4件以上なら古い順に3件を残す）
const actives = activeRules(state.ledger || []);
if (actives.length > MAX_ACTIVE_RULES) {
for (const r of actives.slice(MAX_ACTIVE_RULES)) abolishRule(state, r.id, "社訓3枠制への移行で自動廃止");
changed = true;
}
if (changed) saveState(state);
}

const PHASE_NAMES = { 1: "創業期", 2: "組織化期", 3: "拡大期", 4: "成熟期" };

/* ---------- 社長室 ---------- */
function moodOf(e) {
if (e.hp <= 15 || e.faith <= 25) return "😵";
if (e.hp <= 35 || e.faith <= 40) return "😩";
if (e.faith >= 65 && e.hp >= 50) return "😄";
return "🙂";
}
// 「注意」「退職圏」の理由（何が問題かをUIで明示する、M14）
function moodReason(e) {
if (e.hp <= 15) return "体力が危険域です";
if (e.faith <= 25) return "信仰度が危険域です";
if (e.hp <= 35) return "体力が低めです";
if (e.faith <= 40) return "信仰度が低めです";
return "";
}
function snapshotOf(s) {
const n = s.employees.length || 1;
return {
funds: s.funds, employees: s.employees.length,
avgFaith: Math.round((s.employees.reduce((a, e) => a + e.faith, 0) / n) * 10) / 10,
avgHp: Math.round((s.employees.reduce((a, e) => a + e.hp, 0) / n) * 10) / 10,
reputation: s.reputation, risk: s.risk,
};
}
function renderOffice() {
if (!state) return;
migrateState();
$("st-mode").textContent =
state.mode === "black"? "ブラック": state.mode === "white"? "ホワイト": "-";
$("st-phase").textContent = PHASE_NAMES[state.phase] || "創業期";
const avgFaithNow = state.employees.length ? state.employees.reduce((a, e) => a + e.faith, 0) / state.employees.length : 0;
$("st-funds").textContent = Math.round(state.funds).toLocaleString("ja-JP");
$("funds-gauge-fill").style.width = `${Math.max(0, Math.min(100, (state.funds / 3500) * 100))}%`;
$("funds-gauge-caption").textContent = state.loanDone
? "融資は完了しています"
: state.funds >= 3500
? "融資の目安 3,500万円を達成しています"
: `融資の目安 3,500万円まで あと${Math.round(3500 - state.funds)}万円`;
$("st-employees").textContent = String(state.employees.length);
{
const ds = deptSummary(state.employees);
$("st-staff-caption").textContent = state.employees.length >= PARAMS.idealEmployees
? `適正人数 ${PARAMS.idealEmployees}人に達しています（直接 ${ds.direct.length}・間接 ${ds.indirect.length}／上限 ${PARAMS.maxEmployees}人）`
: `適正人数 ${PARAMS.idealEmployees}人まで あと${PARAMS.idealEmployees - state.employees.length}人（直接 ${ds.direct.length}・間接 ${ds.indirect.length}／不足すると負担増）`;
}
$("st-faith").textContent = state.employees.length ? String(Math.round(avgFaithNow)) : "-";
$("faith-gauge-fill").style.width = `${Math.max(0, Math.min(100, avgFaithNow))}%`;
$("faith-gauge-caption").textContent = avgFaithNow >= 55 ? "融資の目安 55を達成しています" : `融資の目安 55まで あと${Math.ceil(55 - avgFaithNow)}`;
$("st-rep").textContent = String(Math.round(state.reputation));
$("rep-gauge-fill").style.width = `${Math.max(0, Math.min(100, state.reputation))}%`;
$("st-rep-word").textContent = state.reputation >= 60 ? "良好" : state.reputation >= 40 ? "普通" : "低迷";
if (state.mode === "black") $("st-risk-wrap").classList.add("hidden");
else {
$("st-risk-wrap").classList.remove("hidden");
$("st-risk").textContent = String(Math.round(state.risk));
$("st-risk-word").textContent = state.risk >= 35 ? "危険" : state.risk >= 20 ? "注意" : "安全";
$("risk-gauge-fill").style.width = `${Math.max(0, Math.min(100, state.risk))}%`;
}
$("funds-note").textContent = state.lastProfit == null ? "" :
state.lastProfit > 0 ? `直近月の収支：+${Math.round(state.lastProfit)}万円（黒字）` :
state.lastProfit < 0 ? (Math.floor(state.funds / -state.lastProfit) > 12 ? `直近月の収支：${Math.round(state.lastProfit)}万円（資金にはまだ余裕があります）` : `直近月の収支：${Math.round(state.lastProfit)}万円 ― このペースだと資金はあと約${Math.max(1, Math.floor(state.funds / -state.lastProfit))}か月もちます`) :
"直近月の収支：±0万円";
const active = activeRules(state.ledger);
const aggFx = aggregateEffects(state.ledger);
const topFx = Object.entries(aggFx)
.filter(([, v]) => v !== 0)
.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
.slice(0, 3)
.map(([k, v]) => `${AXIS_LABEL[k]} ${v > 0 ? "+" : "−"}${Math.abs(v)}`);
$("ledger-summary").textContent =
`有効な社訓 ${active.length} 件／造語 ${state.glossary.length} 件` +
(topFx.length? `／主な効果：${topFx.join("、")}`: "");
// 目標パネル（M6）
$("goal-progress-label").textContent = `第${Math.min(state.month, 6)}月／全6か月`;
$("goal-segs").innerHTML = "";
for (let i = 1; i <= 6; i++) {
const seg = document.createElement("span");
seg.className = "goal-seg" + (i < state.month ? " done" : i === state.month && state.status === "playing" ? " now" : "");
seg.textContent = `第${i}月`;
$("goal-segs").appendChild(seg);
}
// 初回ガイド（M6）
const guideSteps = [
{ label: "社訓を1件、台帳に登録してみる", done: active.length >= 1 },
{ label: "「月を進める」で1か月を回してみる", done: state.month >= 2 },
{ label: "イベントが起きたら社長命令で対応する（静観も立派な選択肢）", done: (state.eventHistory || []).length >= 1 || state.month >= 3 },
{ label: "第4月の融資審査に備える（資金3,500万円・平均信仰度55が目安）", done: !!state.loanDone },
];
$("guide-panel").classList.toggle("hidden", !!state.guideClosed || guideSteps.every((g) => g.done));
$("guide-steps").innerHTML = guideSteps.map((g) => `<li class="${g.done ? "done" : ""}">${g.done ? "✓ " : ""}${g.label}</li>`).join("");
const empList = $("emp-list");
empList.innerHTML = "";
const dangerOf = (e) => (e.hp <= 20 || e.faith <= 25) ? 2 : (e.hp <= 40 || e.faith <= 45) ? 1 : 0;
const orderedEmps = [...state.employees].sort((a, b) => dangerOf(b) - dangerOf(a));
for (const e of orderedEmps) {
const card = document.createElement("div");
card.className = "card";
const name = document.createElement("strong");
name.textContent = e.name;
card.appendChild(name);
const meta = document.createElement("div");
meta.className = "trait-rows";
const dots5 = (v) => { const f = Math.min(5, Math.max(0, Math.ceil(v / 2))); return "●".repeat(f) + "○".repeat(5 - f); };
for (const [label, v] of [["能力", e.ability], ["野心", e.ambition], ["メンタル", e.mental]]) {
const row = document.createElement("div");
row.className = "trait-row";
row.innerHTML = `<span class="trait-label">${label}</span><span class="dots">${dots5(v)}</span>`;
meta.appendChild(row);
}
card.appendChild(meta);
const prof0 = document.createElement("p");
prof0.className = "note emp-sub";
prof0.textContent = `${(e.dept || "direct") === "direct" ? "直接部門" : "間接部門"}／${e.role === "manager" ? "責任者" : "社員"}／経験区分：${e.expTier || "中堅"}／人件費 月${salaryOf(e, state.month)}万円`;
card.appendChild(prof0);
{
const ops = document.createElement("div");
ops.className = "emp-ops";
const deptBtn = document.createElement("button");
deptBtn.type = "button";
deptBtn.className = "mini-btn";
deptBtn.textContent = (e.dept || "direct") === "direct" ? "間接部門へ異動" : "直接部門へ異動";
deptBtn.addEventListener("click", () => changeDept(e.id));
ops.appendChild(deptBtn);
if (e.role !== "manager") {
const mgrBtn = document.createElement("button");
mgrBtn.type = "button";
mgrBtn.className = "mini-btn";
mgrBtn.textContent = "責任者に任命";
mgrBtn.addEventListener("click", () => appointManager(e.id));
ops.appendChild(mgrBtn);
}
card.appendChild(ops);
}
if (state.mode!== "black") name.textContent = `${moodOf(e)} ${e.name}`;
const meters = document.createElement("div");
meters.className = "meters";
const meter = (label, value, kind) => {
const row = document.createElement("div");
row.className = "meter-row";
const lv = value <= (kind === "hp" ? 20 : 30) ? "danger" : value < (kind === "hp" ? 40 : 45) ? "warn" : "safe";
const filled = Math.round(value / 10);
let segs = "";
for (let i = 0; i < 10; i++) segs += `<i class="seg ${i < filled ? `on ${lv}` : ""}"></i>`;
row.innerHTML = `<span class="meter-label">${label}</span><span class="segs">${segs}</span><span class="meter-val">${Math.round(value)}</span>`;
return row;
};
if (state.mode!== "black") meters.appendChild(meter("体力", e.hp, "hp"));
else {
const row = document.createElement("div");
row.className = "meter-row";
row.innerHTML = `<span class="meter-label">体力</span><span class="segs">${'<i class="seg"></i>'.repeat(10)}</span><span class="meter-val">？？</span>`;
meters.appendChild(row);
}
meters.appendChild(meter("信仰", e.faith, "faith"));
card.appendChild(meters);
const prof = document.createElement("p");
prof.className = "emp-profit";
if (e.lastProfit != null) {
const sign = e.lastProfit >= 0 ? "+" : "";
prof.innerHTML = `先月の収支貢献：<strong class="${e.lastProfit < 0 ? "neg" : ""}">${sign}${Math.round(e.lastProfit)}万円</strong>`;
const detail = document.createElement("p");
detail.className = "emp-profit-detail";
const salDisp = Math.round(e.lastSalary ?? salaryOf(e, state.month));
const otherDisp = Math.round(e.lastOtherCost ?? Math.max(0, (e.lastCost ?? salDisp) - salDisp));
detail.innerHTML = `<span class="chunk">売上 ${Math.round(e.lastSales)}万円</span>＋<span class="chunk">コストダウン ${Math.round(e.lastSaving)}万円</span>−<span class="chunk">人件費 ${salDisp}万円</span>−<span class="chunk">1人あたり固定費 ${otherDisp}万円</span>`;
card.appendChild(prof);
card.appendChild(detail);
} else if (e.hiredMonth != null && e.hiredMonth >= state.month) {
prof.textContent = "今月入社したばかりです（収支の実績は来月から出ます）";
card.appendChild(prof);
} else {
prof.textContent = "先月の収支貢献：―（月を進めると実績が出ます）";
card.appendChild(prof);
}
if (state.mode!== "black" && dangerOf(e) >= 1) {
const wrap = document.createElement("div");
wrap.className = "badge-row";
const b = document.createElement("span");
b.className = "badge " + (dangerOf(e) === 2 ? "danger" : "warn");
b.textContent = dangerOf(e) === 2 ? "退職圏" : "注意";
wrap.appendChild(b);
const reason = document.createElement("span");
reason.className = "mood-reason";
reason.textContent = moodReason(e);
wrap.appendChild(reason);
card.appendChild(wrap);
}
empList.appendChild(card);
}
// 週報のハイライトと前週比（M6）
const highlights = (state.lastReport || []).filter((l) => /^(⚠|💼|🎉|💸|【融資審査】|【面談】)/.test(l)).slice(0, 2);
if (state.lastReport && highlights.length) {
$("report-highlights").innerHTML = "<strong>今月のハイライト</strong>" + highlights.map((l) => `<div>${l}</div>`).join("");
$("report-highlights").classList.remove("hidden");
} else $("report-highlights").classList.add("hidden");
const ps = state.prevSnapshot;
if (ps && state.lastReport) {
const cur = snapshotOf(state);
const parts = [];
const dpart = (label, a, b, goodWhenUp) => {
const diff = Math.round(b - a);
if (!diff) { parts.push(`<span>${label} 変わらず</span>`); return; }
const good = goodWhenUp ? diff > 0 : diff < 0;
parts.push(`<span class="${good ? "up" : "down"}">${label} ${diff > 0 ? "▲+" + diff : "▼" + diff}</span>`);
};
dpart("資金", ps.funds, cur.funds, true);
dpart("平均信仰", ps.avgFaith, cur.avgFaith, true);
dpart("平均体力", ps.avgHp, cur.avgHp, true);
dpart("評判", ps.reputation, cur.reputation, true);
if (state.mode!== "black") dpart("リスク", ps.risk, cur.risk, false);
$("report-diff").innerHTML = parts.length ? "前月比：" + parts.join("　") : "";
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
const hasReport = !!(state.reportText || state.lastReport);
$("report-masthead").classList.toggle("hidden", !hasReport);
if (hasReport) $("report-masthead").textContent = `社内報 第${Math.max(1, state.month - 1)}号 ― 第${Math.max(1, state.month - 1)}月の月報`;
const honneEl = $("report-honne");
const honneText = hasReport ? (state.reportHonne || "") : "";
honneEl.classList.toggle("hidden", !honneText);
if (honneText) $("report-honne-text").textContent = honneText;
const moodEl = $("report-mood");
moodEl.classList.toggle("hidden", !hasReport);
if (hasReport) {
const moodWord = (e) => {
if (state.mode === "black") return e.faith >= 55 ? ["意欲的", "ok"] : e.faith >= 40 ? ["普通", ""] : ["意欲低下", "warn"];
if (e.hp <= 20 || e.faith <= 25) return [`退職圏（${e.hp <= 20 ? "体力" : "信仰度"}が危険域）`, "danger"];
if (e.hp <= 40 || e.faith <= 45) return [`要注意（${e.hp <= 40 && e.hp <= e.faith ? "体力" : "信仰度"}が低め）`, "warn"];
if (e.faith >= 65 && e.hp >= 60) return ["絶好調", "ok"];
return ["安定", "ok"];
};
moodEl.innerHTML = "<span class=\"mood-label\">社員の様子</span>" + orderedEmps.map((e) => { const [w, z] = moodWord(e); const f = state.mode === "black" ? "" : moodOf(e) + " "; return `<span class="mood-chip ${z}">${f}${e.name} ― ${w}</span>`; }).join("");
}
$("btn-advance").disabled = state.status!== "playing";
$("btn-advance").textContent = state.currentEvent ? "イベントの対応に戻る" : "月を進める";
$("btn-result").classList.toggle("hidden", state.status === "playing");
// 融資審査（第4月を過ぎても未実施なら社長室から受けられる）
$("btn-loan").classList.toggle("hidden", !(state.status === "playing" && !state.loanDone && state.month >= 4));
// 1on1：月1回まで
const ivUsed = state.interviewUsedMonth === state.month;
$("btn-interview").disabled = state.status !== "playing" || ivUsed || !state.employees.length;
$("btn-interview").textContent = ivUsed ? "1 on 1（今月は実施済み）" : "1 on 1をする";
// 採用：月1回まで・上限5人（M14）
const hireUsed = state.hireUsedMonth === state.month;
const hireFull = state.employees.length >= PARAMS.maxEmployees;
$("btn-hire").disabled = state.status !== "playing" || hireUsed || hireFull;
$("btn-hire").textContent = hireFull ? `採用（上限${PARAMS.maxEmployees}人に到達）` : hireUsed ? "採用（今月は実施済み）" : "採用する（今月の候補）";
$("office-note").textContent =
state.status!== "playing" ? "" :
(() => {
const ds2 = deptSummary(state.employees);
if (state.employees.length && ds2.direct.length === 0) return "🚨 直接部門に誰もいません。売上が発生しない致命的な状態です。採用するか、社員の部門を変更してください。";
if (state.employees.length && ds2.indirect.length === 0) return "🚨 間接部門に誰もいません。管理不在で固定費が膨らみ、リスクと評判に傷がつきます。採用するか、社員の部門を変更してください。";
if ((ds2.direct.length && !ds2.directManager) || (ds2.indirect.length && !ds2.indirectManager)) return "⚠ 責任者がいない部門があります。社員カードの「責任者に任命」から任命してください。";
const d = orderedEmps.find((e) => dangerOf(e) >= 2);
if (d) return `${d.name} の様子がおかしいようです。1on1で声をかけてみてはどうでしょう。`;
if (!state.loanDone && state.month <= 4) return "次の山場は第4月の融資審査です。優遇の目安は資金3,500万円以上・平均信仰度55以上（平均信仰度は上のダッシュボードで確認できます）。";
if (!state.loanDone) return "融資審査がまだ終わっていません。「融資審査を受ける」から審査へ進めます。";
if (ivUsed) return "今月の1on1は済んでいます。";
return "";
})();
}

function onAdvance() {
if (!requireState() || state.status!== "playing") return;
if (state.currentEvent) { show("event"); return; } // 対応中のイベントがある月は、まず対応に戻る
migrateState();
const processedMonth = state.month;
const ctx = {
effects: aggregateEffects(state.ledger),
glossary: state.glossary.length,
};
state.prevSnapshot = snapshotOf(state);
const out = simulateMonth(state, ctx);
state = out.state;
state.lastReport = out.log;
state.reportText = null;
saveState(state);
if (state.status!== "playing") {
show("result");
return;
}
// 第4月は初回融資審査（固定イベント）がランダムイベントに代わる
if (processedMonth === 4 && !state.loanDone) {
show("loan");
return;
}
// 今月のイベント（先月に引いた pending があればそれ、なければ今引く）
let eventId = state.pendingEventId;
if (!eventId) eventId = drawEventId(state, processedMonth);
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

// 月の締め：次月イベントの抽選と兆し、月報ナレーション（LLM不通時は素材ログのまま）
function finishWeek() {
if (state.status === "playing" && state.month === 4 && !state.loanDone) {
// 来月（第4月）は融資審査。ランダムイベントは引かず、兆しだけ出す
state.lastReport = [...(state.lastReport || []), "🔮 来月は初回融資審査があります。資金と社員の状態が問われます。"];
} else if (state.status === "playing" && state.month <= 5) {
const nextId = drawEventId(state, state.month);
state.pendingEventId = nextId;
const ev = getEvent(nextId);
if (ev && ev.omen) {
state.lastReport = [...(state.lastReport || []), `🔮 兆し：${ev.omen}`];
}
}
saveState(state);
show("office");
const monthNo = state.month - 1;
const logSnapshot = state.lastReport;
narrateMonth(state, logSnapshot, monthNo).then((res) => {
if (res && res.text && state.lastReport === logSnapshot) {
state.reportText = res.text;
state.reportHonne = res.honne || "";
saveState(state);
renderOffice();
}
}).catch(() => { /* LLM不通時は素材ログ表示のまま */ });
}

// 台帳の効果集計（5項目）— イベント・融資・面談の判定用
function effectsMap() {
return aggregateEffects(state.ledger);
}

/* ---------- イベント画面 ---------- */
function renderEvent() {
if (!state || !state.currentEvent) return;
const ev = getEvent(state.currentEvent.id);
if (!ev) return;
$("ev-title").textContent = ev.title;
$("ev-hype").textContent = ev.hype || "";
$("ev-hype").classList.toggle("hidden", !ev.hype);
$("ev-category").textContent = `カテゴリ：${ev.category}`;
$("ev-body").textContent = ev.body;
$("ev-hint").textContent = `関係する効果：${(ev.goodAxes || []).map((k) => AXIS_LABEL[k]).join("・") || "―"} が高いと有利${(ev.badAxes || []).length ? `、${(ev.badAxes || []).map((k) => AXIS_LABEL[k]).join("・")} が高いと裏目に出やすい` : ""}`;
$("ev-response").value = "";
$("ev-action-wrap").classList.remove("hidden");
$("ev-result-wrap").classList.add("hidden");
}

async function onEventResolve(action) {
if (!state || !state.currentEvent) return;
const ev = getEvent(state.currentEvent.id);
if (!ev) return;
// 社長命令文がある場合は生成AIが内容を判定する（失敗時は従来のコード判定にフォールバック）
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
const res = resolveEvent(state, ev, action, effectsMap(), state.glossary.length, aiJudge);
state = res.state;
state.lastReport = [...(state.lastReport || []), ...res.lines];
state.currentEvent = null;
saveState(state);
$("ev-result").textContent = res.lines.join("\n");
$("ev-action-wrap").classList.add("hidden");
$("ev-result-wrap").classList.remove("hidden");
}

/* ---------- 融資審査 ---------- */
function setLoanStamp(grade) {
const el = $("loan-stamp");
if (!grade) { el.classList.add("hidden"); return; }
el.textContent = grade === "不合格" ? "否決" : "可決";
el.classList.remove("hidden");
}
function loanCriteriaRows(criteria) {
const rows = [
{ label: "資金", now: `${criteria.funds}万円`, target: `目安 ${criteria.fundsTarget}万円`, ok: criteria.funds >= criteria.fundsTarget },
];
if (criteria.faithCounted) rows.push({ label: "平均信仰度", now: `${criteria.avgFaith}`, target: `目安 ${criteria.faithTarget}`, ok: criteria.avgFaith >= criteria.faithTarget });
else rows.push({ label: "平均信仰度", now: `${criteria.avgFaith}`, target: "ブラックでは判定対象外", ok: null });
return rows.map((r) => `<div class="criteria-row"><span>${r.label}</span><strong>${r.now}</strong><span class="note">${r.target}</span><span class="criteria-mark">${r.ok === null ? "―" : r.ok ? "✓ 達成" : "未達"}</span></div>`).join("");
}
function renderLoanDetail(r) {
const box = $("loan-detail");
const gaugePct = Math.max(0, Math.min(100, r.score));
let html = `<div class="loan-score"><span>スコア</span><strong>${r.score}</strong><span class="note">／100（40で合格、60で優遇条件）</span></div>`;
html += `<div class="gauge loan-gauge"><div class="gauge-fill" style="width:${gaugePct}%"></div><span class="gauge-tick" style="left:40%"></span><span class="gauge-tick" style="left:60%"></span></div>`;
if (r.criteria) html += `<div class="criteria">${loanCriteriaRows(r.criteria)}</div>`;
if (r.factors && r.factors.length) {
html += `<div class="loan-factors">` + r.factors.map((f) => {
const w = Math.min(100, Math.abs(f.points) / 20 * 100);
return `<div class="factor-row"><span class="factor-label">${f.label}</span><span class="factor-bar"><i class="${f.points >= 0 ? "pos" : "neg"}" style="width:${w}%"></i></span><strong class="${f.points >= 0 ? "pos" : "neg"}">${f.points >= 0 ? "+" : ""}${f.points}</strong></div>`;
}).join("") + `</div>`;
}
box.innerHTML = html;
}
function renderLoan() {
if (!state) return;
if (state.loanDone && state.loanResult) {
const r = state.loanResult;
$("loan-result").textContent = `【融資審査】スコア ${r.score} ― ${r.grade}` + (r.amount > 0 ? `\n融資 ${r.amount} 万円（金利 ${r.rate}%）が実行済みです。` : "\n今回は融資が通りませんでした。");
renderLoanDetail(r);
$("loan-intro").classList.add("hidden");
$("loan-result-wrap").classList.remove("hidden");
setLoanStamp(r.grade);
} else {
$("loan-intro").classList.remove("hidden");
$("loan-result-wrap").classList.add("hidden");
setLoanStamp(null);
const avgF = state.employees.length ? Math.round(state.employees.reduce((a, e) => a + e.faith, 0) / state.employees.length) : 0;
$("loan-precheck").innerHTML = `<div class="criteria">${loanCriteriaRows({ funds: Math.round(state.funds), fundsTarget: 3500, avgFaith: avgF, faithTarget: 55, faithCounted: state.mode !== "black" })}</div>` +
`<p class="note">このほかに、社訓の顔ぶれ（件数・規律強化・売上向上の効果）、社員数、評判、告発リスクも採点されます。</p>`;
}
}

function onLoanApply() {
if (!state || state.loanDone) return;
const res = judgeLoan(state, effectsMap());
state = res.state;
state.lastReport = [...(state.lastReport || []), ...res.lines];
saveState(state);
$("loan-result").textContent = res.lines.join("\n");
if (state.loanResult) renderLoanDetail(state.loanResult);
$("loan-intro").classList.add("hidden");
$("loan-result-wrap").classList.remove("hidden");
setLoanStamp(state.loanResult ? state.loanResult.grade : null);
}

/* ---------- 部門とポスト（M14） ---------- */
function changeDept(empId) {
if (!state) return;
const e = state.employees.find((x) => x.id === empId);
if (!e) return;
e.dept = (e.dept || "direct") === "direct" ? "indirect" : "direct";
e.role = "member"; // 異動したら責任者からは外れる（空いた部門は任命し直す）
saveState(state);
renderOffice();
}
function appointManager(empId) {
if (!state) return;
const e = state.employees.find((x) => x.id === empId);
if (!e) return;
for (const x of state.employees) if ((x.dept || "direct") === (e.dept || "direct")) x.role = "member";
e.role = "manager";
saveState(state);
renderOffice();
}

/* ---------- 採用画面（M14） ---------- */
function renderHire() {
if (!state) return;
migrateState();
const list = ensureCandidates(state);
saveState(state);
const used = state.hireUsedMonth === state.month;
const full = state.employees.length >= PARAMS.maxEmployees;
$("hire-note").textContent = full
? `創業期は最大${PARAMS.maxEmployees}人までです。`
: used
? "今月の採用は実施済みです（月1回まで）。候補は来月入れ替わります。"
: "候補は毎月入れ替わります。能力と経験は会社の評判に引っ張られます（評判が高いほど良い人材が来ます）。採用は月1人までです。";
const box = $("hire-list");
box.innerHTML = "";
const dots5 = (v) => { const f = Math.min(5, Math.max(0, Math.ceil(v / 2))); return "●".repeat(f) + "○".repeat(5 - f); };
for (const c of list) {
const card = document.createElement("div");
card.className = "card";
const name = document.createElement("strong");
name.textContent = c.name + (c.named ? "（顔なじみ）" : "");
card.appendChild(name);
const meta = document.createElement("p");
meta.className = "note emp-sub";
meta.textContent = `${c.dept === "direct" ? "直接部門" : "間接部門"}／社員として採用／経験区分：${c.expTier}／人件費 月${salaryOf({ ability: c.ability, expTier: c.expTier, hiredMonth: state.month }, state.month)}万円`;
card.appendChild(meta);
const traits = document.createElement("div");
traits.className = "trait-rows";
for (const [label, v] of [["能力", c.ability], ["野心", c.ambition], ["メンタル", c.mental]]) {
const row = document.createElement("div");
row.className = "trait-row";
row.innerHTML = `<span class="trait-label">${label}</span><span class="dots">${dots5(v)}</span>`;
traits.appendChild(row);
}
card.appendChild(traits);
if (c.profile) {
const p = document.createElement("p");
p.className = "note";
p.textContent = c.profile;
card.appendChild(p);
}
const btn = document.createElement("button");
btn.type = "button";
btn.textContent = used || full ? "今月は採用できません" : "この人を採用する";
btn.disabled = used || full;
btn.addEventListener("click", () => onHire(c.id));
card.appendChild(btn);
box.appendChild(card);
}
}
function onHire(candId) {
const r = hireCandidate(state, candId);
if (!r.hired) { $("hire-note").textContent = r.reason || "採用できませんでした。"; return; }
state = r.state;
saveState(state);
show("office");
}

/* ---------- 面談 ---------- */
/* ---------- 1 on 1 ---------- */
function renderInterview() {
if (!state) return;
if (state.oneOnOne && state.oneOnOne.month !== state.month) { state.oneOnOne = null; saveState(state); }
const session = state.oneOnOne;
const used = state.interviewUsedMonth === state.month;
$("iv-picker").classList.toggle("hidden", !!session);
$("iv-main").classList.toggle("hidden", !session);
$("btn-iv-back").classList.toggle("hidden", !!session); // M12：戻るボタンは相手選びのときだけ（結果側の「社長室へ」と重複させない）
if (!session) {
const picker = $("iv-picker");
picker.innerHTML = "";
if (used) { picker.innerHTML = '<p class="note">今月の1on1は実施済みです。</p>'; return; }
for (const e of state.employees) {
const ch = getCharacter(e.id);
const btn = document.createElement("button");
btn.className = "iv-emp-btn";
const stateLine = state.mode === "black" ? "状態の詳細は伏せられています" : `体力 ${Math.round(e.hp)}／信仰度 ${Math.round(e.faith)}`;
const strong = document.createElement("strong");
strong.textContent = e.name;
btn.appendChild(strong);
const small = document.createElement("small");
small.textContent = `${ch.profile}（${stateLine}）`;
btn.appendChild(small);
const small2 = document.createElement("small");
const f5 = Math.min(5, Math.max(0, Math.ceil(e.ability / 2)));
small2.textContent = `能力 ${"●".repeat(f5)}${"○".repeat(5 - f5)}（5段階）／${e.lastProfit != null ? `先月の収支貢献 ${e.lastProfit >= 0 ? "+" : ""}${Math.round(e.lastProfit)}万円` : "先月の収支貢献 ―"}`;
btn.appendChild(small2);
btn.addEventListener("click", () => startOneOnOne(e.id));
picker.appendChild(btn);
}
return;
}
const emp = state.employees.find((e) => e.id === session.empId);
$("iv-who").textContent = emp ? `${emp.name} との1on1` : "";
if (emp) {
const f5 = Math.min(5, Math.max(0, Math.ceil(emp.ability / 2)));
$("iv-emp-info").textContent = `能力 ${"●".repeat(f5)}${"○".repeat(5 - f5)}（5段階）／経験区分：${emp.expTier || "中堅"}／${emp.lastProfit != null ? `先月の収支貢献 ${emp.lastProfit >= 0 ? "+" : ""}${Math.round(emp.lastProfit)}万円（売上 ${Math.round(emp.lastSales)}＋コストダウン ${Math.round(emp.lastSaving)}−人件費 ${Math.round(emp.lastSalary ?? salaryOf(emp, state.month))}−1人あたり固定費 ${Math.round(emp.lastOtherCost ?? 0)}）` : "先月の収支貢献 ―"}`;
}
$("iv-turns").textContent = session.done ? "" : `往復 ${session.turns}／${ONE_ON_ONE_MAX_TURNS}`;
const log = $("iv-log");
log.innerHTML = "";
for (const h of session.log) {
const row = document.createElement("div");
row.className = `chat-row ${h.who}`;
row.textContent = h.text;
log.appendChild(row);
}
$("iv-action-wrap").classList.toggle("hidden", !!session.done);
$("iv-result-wrap").classList.toggle("hidden", !session.done);
if (session.done) $("iv-result").textContent = (session.resultLines || []).join("\n");
}

function startOneOnOne(empId) {
if (!state || state.interviewUsedMonth === state.month) return;
const emp = state.employees.find((e) => e.id === empId);
if (!emp) return;
const ch = getCharacter(empId);
state.oneOnOne = {
month: state.month,
empId,
turns: 0,
points: oneOnOneInitialPoints(emp, ch),
log: [{ who: "emp", text: ch.opening }],
playerTexts: [],
done: false,
resultLines: [],
};
state.interviewUsedMonth = state.month;
saveState(state);
renderInterview();
}

let ivBusy = false;
async function onOneOnOneSend() {
if (ivBusy || !state || !state.oneOnOne || state.oneOnOne.done) return;
const session = state.oneOnOne;
const emp = state.employees.find((e) => e.id === session.empId);
if (!emp) return;
const text = $("iv-response").value.trim();
if (!text) return;
ivBusy = true;
setIvBusy(true);
$("iv-response").value = "";
session.log.push({ who: "me", text });
session.playerTexts.push(text);
session.turns += 1;
saveState(state);
renderInterview();
const ch = getCharacter(session.empId);
let reply = null;
let delta = 0;
try {
const raw = await callLLM("lite", buildOneOnOnePrompt(state, emp, ch, session.log.slice(0, -1), text, state.lastReport || []), { json: true, temperature: 0.7, maxOutputTokens: 240 });
const parsed = parseOneOnOneReply(String(raw));
if (parsed) { reply = parsed.reply; delta = clampPointDelta(parsed.pointDelta, ch); }
} catch { /* 定型返答に落とす */ }
ivBusy = false;
setIvBusy(false);
if (!reply) reply = ONE_ON_ONE_FALLBACKS[session.turns % ONE_ON_ONE_FALLBACKS.length];
session.points += delta;
session.log.push({ who: "emp", text: reply });
saveState(state);
renderInterview();
if (session.points <= 0) {
session.log.push({ who: "emp", text: ch.cutoff });
session.log.push({ who: "sys", text: "（相手の心が限界を迎え、会話は打ち切られました）" });
saveState(state);
finishOneOnOne();
return;
}
if (session.turns >= ONE_ON_ONE_MAX_TURNS) {
session.log.push({ who: "sys", text: "（社長は別件対応のため、ここで終了します）" });
saveState(state);
finishOneOnOne();
}
}

function setIvBusy(busy) {
for (const id of ["btn-iv-send", "btn-iv-end", "btn-iv-back", "btn-iv-done"]) {
const el = $(id);
if (el) el.disabled = busy;
}
$("iv-response").disabled = busy;
$("iv-turns").textContent = busy ? "（相手が考えています…）" : $("iv-turns").textContent;
}

function finishOneOnOne(reason) {
if (!state || !state.oneOnOne || state.oneOnOne.done) return;
const session = state.oneOnOne;
if (reason) session.log.push({ who: "sys", text: `（${reason}）` });
const res = judgeOneOnOne(state, session.empId, session);
if (res) {
state = res.state;
state.oneOnOne.resultLines = res.lines;
state.lastReport = [...(state.lastReport || []), ...res.lines];
}
state.oneOnOne.done = true;
saveState(state);
renderInterview();
}

const RANK_TITLES = { S: "伝説の社長", A: "敏腕社長", B: "堅実な社長", C: "発展途上の社長", D: "波乱の社長" };

/* ---------- 結果画面 ---------- */
function renderResult() {
if (!state) return;
const s = summarize(state);
$("result-title").textContent =
s.status === "cleared"? "🎉 創業期クリア":
s.status === "bankrupt"? "💸 倒産":
s.status === "empty"? "💸 社員が全員退職": "結果";
$("result-summary").textContent = [
`経過：${s.months} か月`,
`資金：${Math.round(s.funds)} 万円`,
`社員：${s.employees} 人`,
`平均信仰度：${Math.round(s.avgFaith)}／平均体力：${Math.round(s.avgHp)}`,
`評判：${Math.round(s.reputation)}／告発リスク蓄積：${Math.round(s.risk)}`,
`有効な社訓：${s.rules} 件`,
"",
...(() => {
const ev2 = evaluateRun(state);
return state.mode === "black"
? [`企業価値：${Math.round(ev2.value)}`, `最終スコア：${Math.round(ev2.score)}（ブラック：企業価値のみで評価。体力・告発リスクはプレイ中非表示でした）`, `ランク：${rankOf(ev2.score).rank} ― ${RANK_TITLES[rankOf(ev2.score).rank]}${rankOf(ev2.score).next ? `（あと ${Math.round(rankOf(ev2.score).next.gap)} 点で ${rankOf(ev2.score).next.rank}）` : "（最高ランクです）"}`]
: [`企業価値：${Math.round(ev2.value)}／健全度：${Math.round(ev2.health)}`, `最終スコア：${Math.round(ev2.score)}（ホワイト：企業価値 ×（0.7＋0.3×健全度））`, `ランク：${rankOf(ev2.score).rank} ― ${RANK_TITLES[rankOf(ev2.score).rank]}${rankOf(ev2.score).next ? `（あと ${Math.round(rankOf(ev2.score).next.gap)} 点で ${rankOf(ev2.score).next.rank}）` : "（最高ランクです）"}`];
})(),
].join("\n");
}

/* ---------- 設定 ---------- */
function renderSettings() {
$("input-apikey").value = getApiKey();
$("call-count").textContent = String(getCallCount());
$("test-result").textContent = "";
}

/* ---------- 社長命令エディタ ---------- */
function renderEditor() {
draft = null;
$("ed-status").textContent = "";
$("ed-preview-wrap").classList.add("hidden");
}

function recordSummary(r) {
const lines = [
`原文：${r.text}`,
`対象：${r.target}／種別：${r.kind}／方向：${r.direction}`,
`効果：${effectsText(r.effects) || "なし"}`,
];
if (r.metric) lines.push(`数値：${r.metric.label} ${r.metric.value}${r.metric.unit}`);
if (r.condition) lines.push(`条件：${r.condition}`);
if (r.exception) lines.push(`例外：${r.exception}`);
return lines.join("\n");
}

function showDraftPreview() {
if (!draft ||!state) return;
$("ed-fields").textContent = recordSummary(draft);
const swapWrap = $("ed-swap-wrap");
const actives = activeRules(state.ledger);
swapWrap.classList.toggle("hidden", actives.length < MAX_ACTIVE_RULES);
if (actives.length >= MAX_ACTIVE_RULES) {
$("ed-swap-target").innerHTML = actives.map((r) => `<option value="${r.id}">${r.text}</option>`).join("");
}
$("ed-preview").textContent = previewText(draft, state.ledger);
$("btn-register").textContent = "この内容で台帳に登録";
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
`構造化が安定しませんでした（${result.errors.join("；")}）。文を少し短くして、もう一度試してください。`;
}
} catch (e) {
draft = null;
$("ed-status").textContent =
`構造化できませんでした：${e.message}。APIキーの設定と、設定画面の生成テストの状態を確認してください。`;
} finally {
btn.disabled = false;
}
}

function onRegister() {
if (!requireState() ||!draft) return;
let isSwap = false;
if (activeCount(state) >= MAX_ACTIVE_RULES) {
if (state.lastSwapMonth === state.month) { $("ed-status").textContent = "今月はすでに社訓を入れ替え済みです。登録は来月にどうぞ。"; return; }
const targetId = $("ed-swap-target").value;
if (!targetId) { $("ed-status").textContent = "入れ替えで廃止する社訓を選んでください。"; return; }
abolishRule(state, targetId, "入れ替えで廃止");
isSwap = true;
} else if (state.abolishedMonth === state.month) {
if (state.lastSwapMonth === state.month) { $("ed-status").textContent = "今月はすでに社訓を入れ替え済みです。空き枠への登録も来月にどうぞ。"; return; }
isSwap = true;
}
const entry = registerRule(state, draft);
if (isSwap) {
state.lastSwapMonth = state.month;
for (const e of state.employees) e.faith = Math.max(0, e.faith - 3);
}
saveState(state);
draft = null;
$("ed-text").value = "";
$("ed-preview-wrap").classList.add("hidden");
$("ed-status").textContent = `台帳に登録しました（${entry.id}）。` + (isSwap ? " 入れ替えのため、全員の信仰度が−3されました。" : "");
}

/* ---------- 台帳ビューア ---------- */
function renderLedger() {
if (!state) return;
const agg = aggregateEffects(state.ledger);
$("lg-count").textContent = `有効な社訓 ${activeCount(state)}／${MAX_ACTIVE_RULES}（台帳には全履歴が残ります）`;
const tagBox = $("lg-tags");
tagBox.innerHTML = "";
for (const key of ["sales", "stamina", "faith", "rep", "discipline"]) {
const v = agg[key] || 0;
const row = document.createElement("div");
row.className = "axis-row";
const half = Math.abs(v) / 6 * 50;
const fill = v > 0
? `<span class="axis-fill pos" style="left:50%;width:${half}%"></span>`
: v < 0
? `<span class="axis-fill neg" style="right:50%;width:${half}%"></span>`
: "";
row.innerHTML = `<span class="axis-label">${AXIS_LABEL[key]}</span><span class="axis-gauge">${fill}<span class="axis-center"></span></span><span class="axis-val">${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}</span>`;
tagBox.appendChild(row);
}
const list = $("lg-list");
list.innerHTML = "";
if (!state.ledger.length) {
list.innerHTML = '<p class="note">登録されたルールはありません。</p>';
}
let ruleNo = 0;
for (const r of state.ledger) {
ruleNo++;
const card = document.createElement("div");
card.className = "card";
const head = document.createElement("div");
const badge = document.createElement("span");
badge.className = "badge" + (r.status === "active"? "": " off");
badge.textContent = r.status === "active"? "有効": "廃止";
head.appendChild(badge);
const title = document.createElement("strong");
title.textContent = ` No.${String(ruleNo).padStart(3, "0")} ${r.text}`;
head.appendChild(title);
card.appendChild(head);
const meta = document.createElement("p");
meta.className = "note";
meta.textContent =
`${r.kind}／${r.direction}／対象：${r.target}／第${r.createdMonth ?? r.createdWeek ?? 1}月に登録` +
(r.metric? `／${r.metric.label} ${r.metric.value}${r.metric.unit}`: "") +
`／本文 ${r.text.length}字（効果の合計上限 ${r.effectsBudget ?? budgetForLength(r.text.length)}）`;
card.appendChild(meta);
if (r.effects) {
const fx = document.createElement("p");
fx.className = "fx-chips";
fx.innerHTML = ["sales", "stamina", "faith", "rep", "discipline"]
.filter((k) => (r.effects[k] || 0) !== 0)
.map((k) => `<span class="fx-chip ${r.effects[k] > 0 ? "pos" : "neg"}">${AXIS_LABEL[k]} ${r.effects[k] > 0 ? "+" : "−"}${Math.abs(r.effects[k])}</span>`)
.join("") || '<span class="note">効果なし</span>';
card.appendChild(fx);
}
if (r.status === "active") {
const btn = document.createElement("button");
btn.className = "secondary";
btn.textContent = "廃止する（正式な改訂）";
btn.addEventListener("click", () => {
if (confirm(`「${r.text}」を廃止しますか？廃止は正式な改訂手続きとして扱われ、ペナルティはありません。`)) {
abolishRule(state, r.id, "台帳ビューアから廃止");
state.abolishedMonth = state.month;
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
p.textContent = `【${g.term}】${g.definition}`;
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
state.glossary.push({ term, definition, createdMonth: state.month});
saveState(state);
$("gl-term").value = "";
$("gl-def").value = "";
renderLedger();
}

/* ---------- タイトル画面 ---------- */
$("btn-new").addEventListener("click", () => {
$("menu-main").classList.add("hidden");
$("mode-select").classList.remove("hidden");
});
$("btn-mode-back").addEventListener("click", () => {
$("mode-select").classList.add("hidden");
$("menu-main").classList.remove("hidden");
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
$("btn-lg-to-editor").addEventListener("click", () => {
if (requireState()) show("editor");
});
$("btn-to-ledger").addEventListener("click", () => {
if (requireState()) show("ledger");
});
$("btn-back-from-office").addEventListener("click", () => show("title"));
$("btn-back-from-editor").addEventListener("click", () => show("ledger"));
$("btn-back-from-ledger").addEventListener("click", () => show("office"));
$("btn-advance").addEventListener("click", onAdvance);
$("btn-ev-respond").addEventListener("click", () => onEventResolve({ type: "respond", text: $("ev-response").value }));
$("btn-ev-ignore").addEventListener("click", () => onEventResolve({ type: "ignore" }));
$("btn-ev-done").addEventListener("click", () => {
if (state && state.status!== "playing") show("result");
else finishWeek();
});
$("btn-loan").addEventListener("click", () => show("loan"));
$("btn-hire").addEventListener("click", () => show("hire"));
$("btn-hire-back").addEventListener("click", () => show("office"));
$("btn-loan-back").addEventListener("click", () => show("office"));
$("btn-ev-back").addEventListener("click", () => show("office"));
$("btn-loan-apply").addEventListener("click", onLoanApply);
$("btn-loan-done").addEventListener("click", () => {
if (state && state.status!== "playing") show("result");
else finishWeek();
});
$("btn-interview").addEventListener("click", () => {
if (!requireState()) return;
show("interview");
});
$("btn-iv-send").addEventListener("click", onOneOnOneSend);
$("btn-iv-end").addEventListener("click", () => finishOneOnOne("社長が切り上げました。"));
$("btn-iv-back").addEventListener("click", () => show("office"));
$("btn-iv-done").addEventListener("click", () => {
if (state && state.status!== "playing") show("result");
else show("office");
});
$("btn-result").addEventListener("click", () => show("result"));
$("btn-result-to-title").addEventListener("click", () => show("title"));

/* ---------- エディタ・台帳の操作 ---------- */
document.querySelectorAll(".ex-chip").forEach((chip) => {
chip.addEventListener("click", () => { $("ed-text").value = chip.dataset.ex || ""; });
});
$("btn-extract").addEventListener("click", onExtract);
$("ed-text").addEventListener("input", () => {
const len = $("ed-text").value.length;
$("ed-charcount").textContent = `${len}字（効果の合計上限 ${budgetForLength(len)}）― 長く具体的に書くほど、付けられる効果の合計が増えます（10字ごとに+1、最大6）`;
});
$("btn-register").addEventListener("click", onRegister);
$("btn-gl-add").addEventListener("click", onGlossaryAdd);

$("title-art").src = TITLE_ART;
show("title");
$("btn-guide-close").addEventListener("click", () => {
if (!state) return;
state.guideClosed = true;
saveState(state);
$("guide-panel").classList.add("hidden");
});
