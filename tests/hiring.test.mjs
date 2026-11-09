// 採用（M14）の検証：候補の決定性・評判連動・月1回と上限・採用後の収支実績
import assert from "node:assert/strict";
import { ensureCandidates, hireCandidate } from "../js/hiring.js";
import { simulateMonth } from "../js/sim.js";
import { initialEmployees } from "../js/employees.js";
import { aggregateEffects } from "../js/ledger.js";

function makeState(overrides = {}) {
  return {
    version: 1, mode: "white", phase: 1, month: 1, funds: 4300,
    employees: initialEmployees(), ledger: [], glossary: [],
    risk: 0, reputation: 55, status: "playing",
    seed: 42, rngState: 42, lastReport: null, pendingEventId: null, currentEvent: null,
    eventHistory: [], reportText: null, loanDone: false, loanResult: null,
    interviewUsedMonth: 0, hireUsedMonth: 0, candidates: null,
    ...overrides,
  };
}

// 候補は3人で、同月内は開き直しても同じ顔ぶれ
{
  const s = makeState();
  const a = ensureCandidates(s);
  assert.equal(a.length, 3);
  const b = ensureCandidates(s);
  assert.deepEqual(a.map((c) => c.name), b.map((c) => c.name));
  // 固有候補（砂川・桐生・八雲）が優先される
  assert.ok(a.every((c) => c.named), "初月は固有候補3人になるはず");
}

// 評判が高い会社の候補ほど能力の平均が高い（月1〜6の平均で比較）
{
  const avgAbility = (rep) => {
    let total = 0, n = 0;
    // 固有候補（能力固定）を在籍済みにし、プール候補だけで評判連動を比べる
    const seniors = [
      { id: "emp-2", name: "砂川 蓮" }, { id: "emp-3", name: "桐生 葵" }, { id: "emp-5", name: "八雲 奏" },
    ];
    for (let m = 1; m <= 6; m++) {
      const s = makeState({ reputation: rep, month: m, seed: 100 + m, employees: [...seniors] });
      for (const c of ensureCandidates(s)) { total += c.ability; n++; }
    }
    return total / n;
  };
  assert.ok(avgAbility(90) > avgAbility(20), `評判連動：高評判 ${avgAbility(90)} > 低評判 ${avgAbility(20)}`);
}

// 採用は月1回まで。採用した社員は翌月のシムで収支実績が必ず出る
{
  let s = makeState();
  const cand = ensureCandidates(s)[0];
  const r1 = hireCandidate(s, cand.id);
  assert.ok(r1.hired, "1人目は採用できる");
  s = r1.state;
  assert.equal(s.employees.length, 3);
  const r2 = hireCandidate(s, ensureCandidates(s)[0].id);
  assert.equal(r2.hired, null, "同月2人目は採用できない");
  // 月を進める：新入社員を含む全員に収支実績が出る
  const out = simulateMonth(s, { effects: aggregateEffects(s.ledger), glossary: 0 });
  for (const e of out.state.employees) {
    assert.ok(typeof e.lastProfit === "number", `${e.name} の収支実績が出ていること`);
  }
}

// 上限5人を超えては雇えない
{
  let s = makeState();
  for (let m = 1; m <= 3; m++) {
    s.month = m;
    s.hireUsedMonth = 0;
    const r = hireCandidate(s, ensureCandidates(s)[0].id);
    assert.ok(r.hired, `${m}人目の追加採用`);
    s = r.state;
  }
  assert.equal(s.employees.length, 5);
  s.month = 4;
  s.hireUsedMonth = 0;
  const over = hireCandidate(s, ensureCandidates(s)[0].id);
  assert.equal(over.hired, null, "上限5人では採用できない");
}

console.log("HIRING TESTS OK");

// M15：プール候補の部門比は直接寄り（65%）になる
{
  const seniors = [
    { id: "emp-2", name: "砂川 蓮" }, { id: "emp-3", name: "桐生 葵" }, { id: "emp-5", name: "八雲 奏" },
  ];
  let direct = 0, total = 0;
  for (let m = 1; m <= 12; m++) {
    const s = makeState({ month: m, seed: 900 + m, employees: [...seniors] });
    for (const c of ensureCandidates(s)) { total++; if (c.dept === "direct") direct++; }
  }
  assert.ok(direct / total > 0.5, `プール候補は直接寄りのはず: ${direct}/${total}`);
}
