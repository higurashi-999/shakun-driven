// 週次シムの検証B（再現性）と勝敗到達テスト（node tests/sim.test.mjs）
import assert from "node:assert/strict";
import { simulateWeek, summarize } from "../js/sim.js";
import { initialEmployees } from "../js/employees.js";
import { validateRecord, registerRule, aggregateTags } from "../js/ledger.js";

function makeState(overrides = {}) {
  return {
    version: 1,
    mode: "white",
    phase: 1,
    week: 1,
    funds: 1000,
    employees: initialEmployees(),
    ledger: [],
    glossary: [],
    risk: 0,
    reputation: 50,
    status: "playing",
    seed: 12345,
    rngState: 12345,
    lastReport: null,
    ...overrides,
  };
}

function ctxOf(state) {
  return {
    tags: aggregateTags(state.ledger),
    contradictions: state.ledger
      .filter((r) => r.status === "active")
      .reduce((s, r) => s + (r.contradictions || []).length, 0),
    glossary: state.glossary.length,
  };
}

function runWeeks(state, weeks) {
  let s = state;
  const logs = [];
  for (let i = 0; i < weeks && s.status === "playing"; i++) {
    const out = simulateWeek(s, ctxOf(s));
    s = out.state;
    logs.push(out.log);
  }
  return { state: s, logs };
}

function addRule(state, overrides) {
  const v = validateRecord({
    text: "テスト社訓",
    target: "全員",
    kind: "行動規範",
    direction: "必須",
    condition: "",
    exception: "",
    metric: null,
    tag: "規律統制",
    strength: 2,
    priority: 1,
    behavior: "",
    sideEffect: "",
    ...overrides,
  });
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  return registerRule(state, v.record);
}

// 検証B：同一シード＋同一台帳で2回実行し、全指標が一致する
{
  const build = () => {
    const s = makeState();
    addRule(s, { text: "お客様は神様である", tag: "顧客絶対", strength: 3 });
    addRule(s, { text: "残業はほどほどに", tag: "労働強化", strength: 2 });
    return s;
  };
  const a = runWeeks(build(), 6).state;
  const b = runWeeks(build(), 6).state;
  assert.deepEqual(summarize(a), summarize(b));
  assert.deepEqual(a.employees, b.employees);
  assert.equal(a.rngState, b.rngState);
}

// 通常プレイ（社訓なし）では6週を生き残ってクリアできる
{
  const { state } = runWeeks(makeState(), 6);
  assert.equal(state.status, "cleared", JSON.stringify(summarize(state)));
  assert.ok(state.employees.length >= 4, "大量退職は起きない");
  assert.ok(state.funds > 0);
}

// 資金枯渇の敗北に到達できる（社員2人・資金わずかでは売上が固定費に届かない）
{
  const s = makeState({ funds: 30, employees: initialEmployees().slice(0, 2) });
  const { state } = runWeeks(s, 6);
  assert.equal(state.status, "bankrupt", JSON.stringify(summarize(state)));
}

// 労働強化の盛りすぎは、創業期のうちは資金と引き換えに疲労と告発リスクを蓄積させる
// （退職・敗北への本格的な転落は組織化期以降の反転で起きる、という SPEC の反転カーブ）
{
  const s = makeState();
  addRule(s, { text: "残業は美徳である", tag: "労働強化", strength: 3 });
  addRule(s, { text: "休む者は去れ", tag: "労働強化", strength: 3 });
  const { state } = runWeeks(s, 6);
  const sum = summarize(state);
  assert.ok(
    sum.avgFatigue >= 60 && sum.risk >= 20,
    `過重労働の代償（疲労・リスクの蓄積）が出るはず: ${JSON.stringify(sum)}`
  );
  const avgFatigue = state.employees.length
    ? state.employees.reduce((sum, e) => sum + e.fatigue, 0) / state.employees.length
    : 100;
  assert.ok(avgFatigue > 40, `平均疲労が蓄積するはず: ${avgFatigue}`);
}

// 福利厚生は疲労を抑える
{
  const s = makeState();
  addRule(s, { text: "有給は全員100%消化", tag: "福利厚生", strength: 3 });
  addRule(s, { text: "定時退社を徹底", tag: "福利厚生", strength: 2 });
  const { state } = runWeeks(s, 6);
  assert.equal(state.status, "cleared");
  const avgFatigue = state.employees.reduce((sum, e) => sum + e.fatigue, 0) / state.employees.length;
  assert.ok(avgFatigue < 35, `福利厚生で疲労が抑えられるはず: ${avgFatigue}`);
}

console.log("SIM TESTS OK");
