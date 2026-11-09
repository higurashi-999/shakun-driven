// 月次シムの検証B（再現性）と勝敗到達テスト（node tests/sim.test.mjs）
import assert from "node:assert/strict";
import { simulateMonth, summarize } from "../js/sim.js";
import { initialEmployees } from "../js/employees.js";
import { validateRecord, registerRule, aggregateEffects } from "../js/ledger.js";
import { ensureCandidates, hireCandidate } from "../js/hiring.js";

function makeState(overrides = {}) {
  return {
    version: 1,
    mode: "white",
    phase: 1,
    month: 1,
    funds: 4300,
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
    interviewUsedMonth: 0,
    interview: null,
    ...overrides,
  };
}

function ctxOf(state) {
  return { effects: aggregateEffects(state.ledger), glossary: (state.glossary || []).length };
}

function runMonths(state, months) {
  let s = state;
  const logs = [];
  for (let i = 0; i < months && s.status === "playing"; i++) {
    const out = simulateMonth(s, ctxOf(s));
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
  const a = runMonths(build(), 6).state;
  const b = runMonths(build(), 6).state;
  assert.deepEqual(summarize(a), summarize(b));
  assert.deepEqual(a.employees, b.employees);
  assert.equal(a.rngState, b.rngState);
}

// 通常プレイ（社訓なし・採用なし）では6か月時点ではまだ創業期の途中（M16：本編は24か月制）
{
  const { state } = runMonths(makeState(), 6);
  assert.equal(state.status, "playing", JSON.stringify(summarize(state)));
  assert.ok(state.employees.length >= 2, "大量退職は起きない");
  assert.ok(state.funds > 0);
}

// M16：何もせず24か月回すと、上場には届かず必ず終了する（ended／bankrupt／empty のいずれか）
{
  const { state } = runMonths(makeState(), 24);
  assert.notEqual(state.status, "playing", JSON.stringify(summarize(state)));
  assert.notEqual(state.status, "listed");
}

// M16：毎月採用して売上目標を追う標準プレイでは、創業期の目標を達成して組織化期へ進める
{
  let s = makeState({ phaseSales: 0, phaseMonth: 1, milestones: {}, pendingMilestone: null, hireUsedMonth: 0, candidates: null });
  addRule(s, { effects: { sales: 2, faith: 1 } });
  addRule(s, { effects: { stamina: 2, faith: 1 } });
  let guard = 0;
  while (s.status === "playing" && s.phase < 2 && guard++ < 10) {
    if (s.employees.length < 5 && s.hireUsedMonth !== s.month) {
      const cands = [...ensureCandidates(s)].sort((a, b) => b.ability - a.ability);
      if (cands.length) { const r = hireCandidate(s, cands[0].id); if (r.hired) s = r.state; }
    }
    s = simulateMonth(s, ctxOf(s)).state;
    if (s.pendingMilestone) s.pendingMilestone = null; // 山場はテストでは消費だけする
  }
  assert.equal(s.phase, 2, `組織化期へ進めること: ${JSON.stringify(summarize(s))}`);
  assert.equal(s.phaseSales, 0, "期が替わったら今期の累計売上はリセットされる");
}

// M14：1か月進めると、在籍する全員の収支実績（売上・コストダウン・人件費・1人あたり固定費・収支）が必ず出る
{
  const { state } = runMonths(makeState(), 1);
  for (const e of state.employees) {
    assert.ok(typeof e.lastProfit === "number" && typeof e.lastSalary === "number" && typeof e.lastOtherCost === "number", `${e.name} の収支実績が出ていること`);
  }
}

// M14：直接部門が空だと売上が出ず、致命的な警告が月報素材に出る
{
  const s = makeState();
  s.employees = s.employees.filter((e) => e.dept === "indirect");
  const out = simulateMonth(s, ctxOf(s));
  assert.ok(out.log.some((l) => l.includes("直接部門に誰もいません")), "直接部門の欠員警告が出ること");
  assert.ok(out.log.some((l) => l.includes("売上 0万円")), "売上が0になること");
}

// M14：直接部門の責任者がいると、いない場合より売上が伸びる
{
  const withMgr = makeState({ seed: 777, rngState: 777 });
  const noMgr = makeState({ seed: 777, rngState: 777 });
  noMgr.employees.forEach((e) => { e.role = "member"; });
  const a = simulateMonth(withMgr, ctxOf(withMgr)).state;
  const b = simulateMonth(noMgr, ctxOf(noMgr)).state;
  assert.ok(a.funds > b.funds, `責任者ボーナスで資金が上回るはず: ${a.funds} vs ${b.funds}`);
}

// 売上偏重の社訓は体力と信仰度を削る（3か月・10シード平均）
{
  let hpTotal = 0, faithTotal = 0, n = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const s = makeState({ seed, rngState: seed });
    addRule(s, { effects: { sales: 3, stamina: -2 } });
    addRule(s, { effects: { sales: 3, stamina: -2 } });
    const { state } = runMonths(s, 3);
    if (!state.employees.length) continue;
    hpTotal += state.employees.reduce((sum, e) => sum + e.hp, 0) / state.employees.length;
    faithTotal += state.employees.reduce((sum, e) => sum + e.faith, 0) / state.employees.length;
    n++;
  }
  const avgHp = hpTotal / n, avgFaith = faithTotal / n;
  assert.ok(avgHp <= 65 && avgFaith <= 45, `売上偏重3か月：平均体力 ${avgHp}・平均信仰度 ${avgFaith}`);
}

// 体力・信仰重視の社訓は体力を守る（3か月・10シード平均）
{
  let hpTotal = 0, n = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const s = makeState({ seed, rngState: seed });
    addRule(s, { effects: { stamina: 3, faith: 2 } });
    addRule(s, { effects: { stamina: 3, faith: 2 } });
    const { state } = runMonths(s, 3);
    if (!state.employees.length) continue;
    hpTotal += state.employees.reduce((sum, e) => sum + e.hp, 0) / state.employees.length;
    n++;
  }
  const avgHp = hpTotal / n;
  assert.ok(avgHp > 70, `体力・信仰重視3か月：平均体力 ${avgHp}`);
}

// 体力・信仰重視で6か月走ると、体力を保ったまま継続できる（M16：6か月では終わらない）
{
  const s = makeState();
  addRule(s, { effects: { stamina: 3, faith: 2 } });
  addRule(s, { effects: { stamina: 2, faith: 2 } });
  const { state } = runMonths(s, 6);
  assert.equal(state.status, "playing");
  const avgHp = state.employees.reduce((sum, e) => sum + e.hp, 0) / state.employees.length;
  assert.ok(avgHp > 65, `体力・信仰重視で体力が守られるはず: ${avgHp}`);
}

console.log("SIM TESTS OK");

/* ---------- M15：間接部門の押し上げと貢献の付け替え ---------- */
{
  // 間接あり（初期状態）では押し上げが発生し、間接の収支は押し上げ分＋コストダウンで付く
  const withInd = simulateMonth(makeState({ seed: 555, rngState: 555 }), { effects: {}, glossary: 0 }).state;
  const morinaga = withInd.employees.find((e) => e.id === "emp-4");
  const takamine = withInd.employees.find((e) => e.id === "emp-1");
  assert.ok(morinaga.lastUplift > 0, `間接の直接部門貢献が付くはず: ${morinaga.lastUplift}`);
  assert.ok(takamine.lastBoost > 0, "直接の売上に押し上げ分が併記できるはず");
  assert.equal(takamine.lastSaving, 0, "直接にはコストダウンを付けない");
  assert.equal(morinaga.lastProfit, Math.round((morinaga.lastUplift + morinaga.lastSaving - morinaga.lastCost) * 10) / 10);
  // 直接が3人いる状態で間接を抜くと、押し上げが消えて−15%ペナルティ＋固定費増で資金が悪化する
  const mkEmp = (id, name, ability, dept) => ({ id, name, ability, stamina: 6, ambition: 5, mental: 6, hp: 90, faith: 55, dept, role: "member", expTier: "中堅", hiredMonth: 1, lastSales: null, lastBoost: null, lastUplift: null, lastSaving: null, lastCost: null, lastProfit: null, lastSalary: null, lastOtherCost: null });
  const bigState = makeState({ seed: 555, rngState: 555 });
  bigState.employees.push(mkEmp("emp-3", "桐生 葵", 9, "direct"), mkEmp("emp-2", "砂川 蓮", 6, "direct"));
  const bigWith = simulateMonth(bigState, { effects: {}, glossary: 0 }).state;
  const bigNoState = makeState({ seed: 555, rngState: 555 });
  bigNoState.employees.push(mkEmp("emp-3", "桐生 葵", 9, "direct"), mkEmp("emp-2", "砂川 蓮", 6, "direct"));
  bigNoState.employees = bigNoState.employees.filter((e) => e.dept === "direct");
  const noInd = simulateMonth(bigNoState, { effects: {}, glossary: 0 });
  assert.ok(noInd.log.some((l) => l.includes("直接部門の売上が伸び悩み")), "間接空席の売上ペナルティが月報素材に出ること");
  assert.ok(bigWith.funds > noInd.state.funds + 20, `直接が多いほど間接の押し上げが効くはず: ${bigWith.funds} vs ${noInd.state.funds}`);
}
