// 週次シムの検証B（再現性）と勝敗到達テスト（node tests/sim.test.mjs）
import assert from "node:assert/strict";
import { simulateWeek, summarize } from "../js/sim.js";
import { initialEmployees } from "../js/employees.js";
import { validateRecord, registerRule, aggregateEffects } from "../js/ledger.js";

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
    pendingEventId: null,
    currentEvent: null,
    eventHistory: [],
    reportText: null,
    loanDone: false,
    loanResult: null,
    interviewUsedWeek: 0,
    interview: null,
    ...overrides,
  };
}

function ctxOf(state) {
  return { effects: aggregateEffects(state.ledger), glossary: (state.glossary || []).length };
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

const LONG = "あ".repeat(55); // 55字＝効果の合計上限6
function addRule(state, overrides) {
  const v = validateRecord({
    text: LONG,
    target: "全員",
    kind: "行動規範",
    direction: "必須",
    condition: "",
    exception: "",
    metric: null,
    effects: { discipline: 2 },
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
    addRule(s, { effects: { sales: 2, rep: 1 } });
    addRule(s, { effects: { sales: 2, stamina: -1 } });
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

// 売上偏重の社訓は体力と信仰度を削る（3週間・10シード平均）
{
  let hpTotal = 0, faithTotal = 0, n = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const s = makeState({ seed, rngState: seed });
    addRule(s, { effects: { sales: 3, stamina: -2 } });
    addRule(s, { effects: { sales: 3, stamina: -2 } });
    const { state } = runWeeks(s, 3);
    if (!state.employees.length) continue;
    hpTotal += state.employees.reduce((sum, e) => sum + e.hp, 0) / state.employees.length;
    faithTotal += state.employees.reduce((sum, e) => sum + e.faith, 0) / state.employees.length;
    n++;
  }
  const avgHp = hpTotal / n, avgFaith = faithTotal / n;
  assert.ok(avgHp <= 65 && avgFaith <= 45, `売上偏重3週：平均体力 ${avgHp}・平均信仰度 ${avgFaith}`);
}

// 体力・信仰重視の社訓は体力を守る（3週間・10シード平均）
{
  let hpTotal = 0, n = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const s = makeState({ seed, rngState: seed });
    addRule(s, { effects: { stamina: 3, faith: 2 } });
    addRule(s, { effects: { stamina: 3, faith: 2 } });
    const { state } = runWeeks(s, 3);
    if (!state.employees.length) continue;
    hpTotal += state.employees.reduce((sum, e) => sum + e.hp, 0) / state.employees.length;
    n++;
  }
  const avgHp = hpTotal / n;
  assert.ok(avgHp > 70, `体力・信仰重視3週：平均体力 ${avgHp}`);
}

// 体力・信仰重視で6週走ると、体力を保ったままクリアできる
{
  const s = makeState();
  addRule(s, { effects: { stamina: 3, faith: 2 } });
  addRule(s, { effects: { stamina: 2, faith: 2 } });
  const { state } = runWeeks(s, 6);
  assert.equal(state.status, "cleared");
  const avgHp = state.employees.reduce((sum, e) => sum + e.hp, 0) / state.employees.length;
  assert.ok(avgHp > 65, `体力・信仰重視で体力が守られるはず: ${avgHp}`);
}

console.log("SIM TESTS OK");
