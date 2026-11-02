// 融資審査と面談の判定テスト（node tests/scenes.test.mjs）
import assert from "node:assert/strict";
import { judgeLoan, judgeInterview, pickInterviewTarget, detectConcern, evaluateRun, rankOf } from "../js/scenes.js";
import { initialEmployees } from "../js/employees.js";
import { validateRecord, registerRule, aggregateTags } from "../js/ledger.js";

function makeState(overrides = {}) {
  return {
    version: 1, mode: "white", phase: 1, week: 4, funds: 1000,
    employees: initialEmployees(), ledger: [], glossary: [],
    risk: 0, reputation: 50, status: "playing",
    seed: 42, rngState: 42, lastReport: null, eventHistory: [],
    loanDone: false, loanResult: null, interviewUsedWeek: 0, interview: null,
    ...overrides,
  };
}
function addRule(state, overrides, contradictions = []) {
  const v = validateRecord({
    text: "テスト社訓", target: "全員", kind: "行動規範", direction: "必須",
    condition: "", exception: "", metric: null, tag: "規律統制",
    strength: 2, priority: 1, behavior: "", sideEffect: "", ...overrides,
  });
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  return registerRule(state, v.record, contradictions);
}
function phaseTags(state) {
  const agg = aggregateTags(state.ledger);
  const mods = { "自由裁量": 1.0, "規律統制": 0.4 };
  const out = {};
  for (const [t, v] of Object.entries(agg)) out[t] = v.effective * (mods[t] ?? 1);
  return out;
}

// 融資審査：台帳が整っている会社は合格し、矛盾だらけの会社は落ちる（台帳依存）
{
  const good = makeState();
  addRule(good, { text: "経費は1円まで報告", tag: "コスト削減", strength: 3 });
  addRule(good, { text: "報連相は当日中", tag: "規律統制", strength: 3 });
  addRule(good, { text: "会議は15分まで", tag: "規律統制", strength: 2 });
  const g = judgeLoan(good, phaseTags(good));
  assert.equal(g.result.amount > 0, true, JSON.stringify(g.result));
  assert.ok(g.state.funds > 1000);

  const bad = makeState({ funds: 200, risk: 40, reputation: 35 });
  const r1 = addRule(bad, { text: "残業は必須", tag: "労働強化", strength: 3 });
  addRule(bad, { text: "残業は禁止", tag: "福利厚生", strength: 3 }, [r1.id]);
  const b = judgeLoan(bad, phaseTags(bad));
  assert.equal(b.result.amount, 0, JSON.stringify(b.result));
  assert.equal(b.result.grade, "不合格");
}

// 面談：対象選出と主訴判定
{
  const s = makeState();
  s.employees[0].fatigue = 90; // 高嶺を危険な状態に
  const target = pickInterviewTarget(s);
  assert.equal(target.id, "emp-1");
  assert.equal(detectConcern(target), "rest");
  const healthy = makeState();
  assert.equal(pickInterviewTarget(healthy), null);
}

// 面談：台帳の裏付け＋訴えに触れた発言では思いとどまり、無策では辞める（台帳依存）
{
  const build = () => {
    const s = makeState();
    s.employees[0].fatigue = 90;
    s.employees[0].dissatisfaction = 40;
    return s;
  };
  const withLedger = build();
  addRule(withLedger, { text: "有給は全員消化", tag: "福利厚生", strength: 3 });
  const stay = judgeInterview(withLedger, "emp-1", "来週から休みを増やして、残業も減らします", phaseTags(withLedger));
  assert.equal(stay.outcome, "stay", JSON.stringify(stay.lines));
  assert.equal(stay.state.employees.length, 5);

  const noLedger = build();
  const quit = judgeInterview(noLedger, "emp-1", "まあ頑張ってください", {});
  assert.equal(quit.outcome, "quit", JSON.stringify(quit.lines));
  assert.equal(quit.state.employees.length, 4);
  assert.ok(quit.state.funds < 1000); // 離職コスト
}

// 面談：言行不一致はペナルティになる
{
  const s = makeState();
  s.employees[0].fatigue = 90;
  addRule(s, { text: "残業は美徳", tag: "労働強化", strength: 3 });
  addRule(s, { text: "残業こそ成長", tag: "労働強化", strength: 3 });
  const res = judgeInterview(s, "emp-1", "残業を減らして休ませます", phaseTags(s));
  assert.ok(res.lines.some((l) => l.includes("言行不一致")), JSON.stringify(res.lines));
}

console.log("SCENES TESTS OK");

// --- M5: 融資審査のモード差（同じ矛盾でもブラックは数字で通る） ---
{
  const build = (mode) => {
    const s = makeState({ mode, funds: 900, risk: 0, reputation: 50 });
    const r1 = addRule(s, { text: "残業は必須", tag: "労働強化", strength: 3 });
    addRule(s, { text: "残業は禁止", tag: "福利厚生", strength: 3 }, [r1.id]);
    return s;
  };
  const w = judgeLoan(build("white"), {});
  const b = judgeLoan(build("black"), {});
  assert.ok(b.result.score > w.result.score, `black ${b.result.score} vs white ${w.result.score}`);
}

// --- M5: 最終評価（ブラックは企業価値のみ、ホワイトは健全度で割り引かれる） ---
{
  const healthy = makeState({ mode: "white", funds: 1000 });
  const evH = evaluateRun(healthy);
  const tired = makeState({ mode: "white", funds: 1000 });
  for (const e of tired.employees) { e.faith = 20; e.dissatisfaction = 90; }
  tired.risk = 60;
  const evT = evaluateRun(tired);
  assert.equal(evH.value, evT.value); // 企業価値は同じ
  assert.ok(evH.score > evT.score); // でもホワイトのスコアは健全度で差がつく
  const blackSame = makeState({ mode: "black", funds: 1000 });
  for (const e of blackSame.employees) { e.faith = 20; e.dissatisfaction = 90; }
  blackSame.risk = 60;
  assert.equal(evaluateRun(blackSame).score, evT.value); // ブラックは健全度を無視
}

// --- M6: ランク付け ---
{
  assert.equal(rankOf(2500).rank, "S");
  assert.equal(rankOf(2500).next, null);
  assert.equal(rankOf(2100).rank, "A");
  assert.deepEqual(rankOf(2100).next, { rank: "S", gap: 300 });
  assert.equal(rankOf(1000).rank, "D");
  assert.deepEqual(rankOf(1000).next, { rank: "C", gap: 200 });
}
