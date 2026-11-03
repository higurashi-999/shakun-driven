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

// 融資審査：台帳が整っている会社は合格し、資金・評判・リスクの悪い会社は落ちる（台帳・状態依存）
{
  const good = makeState();
  addRule(good, { text: "経費は1円まで報告", tag: "コスト削減", strength: 3 });
  addRule(good, { text: "報連相は当日中", tag: "規律統制", strength: 3 });
  addRule(good, { text: "会議は15分まで", tag: "規律統制", strength: 2 });
  const g = judgeLoan(good, phaseTags(good));
  assert.equal(g.result.amount > 0, true, JSON.stringify(g.result));
  assert.ok(g.state.funds > 1000);

  const bad = makeState({ funds: 200, risk: 40, reputation: 35 });
  addRule(bad, { text: "残業は必須", tag: "労働強化", strength: 3 });
  addRule(bad, { text: "残業は禁止", tag: "福利厚生", strength: 3 });
  const b = judgeLoan(bad, phaseTags(bad));
  assert.equal(b.result.amount, 0, JSON.stringify(b.result));
  assert.equal(b.result.grade, "不合格");
}

// 面談：対象選出と主訴判定
{
  const s = makeState();
  s.employees[0].hp = 10; // 高嶺を危険な状態に
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
    s.employees[0].hp = 10;
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
  s.employees[0].hp = 10;
  addRule(s, { text: "残業は美徳", tag: "労働強化", strength: 3 });
  addRule(s, { text: "残業こそ成長", tag: "労働強化", strength: 3 });
  const res = judgeInterview(s, "emp-1", "残業を減らして休ませます", phaseTags(s));
  assert.ok(res.lines.some((l) => l.includes("言行不一致")), JSON.stringify(res.lines));
}

console.log("SCENES TESTS OK");

// --- M5: 融資審査のモード差（ブラックは資金評価の比重が大きく、数字で通りやすい） ---
{
  const build = (mode) => {
    const s = makeState({ mode, funds: 900, risk: 0, reputation: 50 });
    addRule(s, { text: "残業は必須", tag: "労働強化", strength: 3 });
    addRule(s, { text: "定時退社を徹底", tag: "福利厚生", strength: 3 });
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
  for (const e of tired.employees) { e.faith = 20; e.hp = 10; }
  tired.risk = 60;
  const evT = evaluateRun(tired);
  assert.equal(evH.value, evT.value); // 企業価値は同じ
  assert.ok(evH.score > evT.score); // でもホワイトのスコアは健全度で差がつく
  const blackSame = makeState({ mode: "black", funds: 1000 });
  for (const e of blackSame.employees) { e.faith = 20; e.hp = 10; }
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

// --- M10：1 on 1 ---
import { oneOnOneInitialPoints, clampPointDelta, judgeOneOnOne, hasPressure, parseOneOnOneReply } from "../js/scenes.js";
import { getCharacter } from "../js/employees.js";
const baseEmp = { id: "emp-3", name: "桐生 葵", hp: 80, faith: 45 };
const pts = oneOnOneInitialPoints(baseEmp, getCharacter("emp-3"));
assert.ok(pts >= 15 && pts <= 90, "初期ポイントは範囲内");
const tired = oneOnOneInitialPoints({ ...baseEmp, hp: 5, faith: 10 }, getCharacter("emp-3"));
assert.ok(tired < pts, "体力と信仰度が低いと初期ポイントは下がる");
assert.equal(clampPointDelta(-999, getCharacter("emp-5")), -25, "振れ幅でクランプ（八雲は25）");
assert.equal(clampPointDelta(999, getCharacter("emp-5")), 10, "プラス側は一律+10まで");
assert.ok(hasPressure(["もう辞めてもらって構いません"]));
assert.ok(!hasPressure(["いつもありがとう"]));
const st1 = { mode: "white", week: 2, funds: 1000, reputation: 50, risk: 0, status: "playing", employees: [{ ...baseEmp }], ledger: [] };
const quit = judgeOneOnOne(st1, "emp-3", { points: 0, playerTexts: ["辞めてもらって構いません"] });
assert.equal(quit.outcome, "pushout");
assert.equal(quit.state.employees.length, 0, "退職で社員が減る");
assert.ok(quit.state.reputation < 50, "評判が下がる");
const burnout = judgeOneOnOne(st1, "emp-3", { points: 0, playerTexts: ["大丈夫ですか"] });
assert.equal(burnout.outcome, "burnout-quit");
assert.ok(burnout.state.funds > quit.state.funds, "圧なし退職のほうが費用は軽い");
const mot = judgeOneOnOne(st1, "emp-3", { points: 80, playerTexts: ["君の成果は大きい"] });
assert.equal(mot.outcome, "motivated");
assert.equal(mot.state.employees[0].faith, 53, "信仰+8（45→53）");
const parsedReply = parseOneOnOneReply('{"reply":"ありがとうございます。","pointDelta":4}');
assert.equal(parsedReply.pointDelta, 4);
assert.equal(parseOneOnOneReply("not json"), null);
