// 創業期バランス検証：労働強化型は資金で先行するが体力が危険域に入り、
// 福利厚生型は信仰度で勝る、という SPEC の反転カーブの創業期側を確認する。
import assert from "node:assert/strict";
import { simulateMonth } from "../js/sim.js";
import { initialEmployees } from "../js/employees.js";
import { validateRecord, registerRule, aggregateEffects } from "../js/ledger.js";

function baseState(seed) {
  return {
    version: 1, mode: "white", phase: 1, month: 1, funds: 4300,
    employees: initialEmployees(), ledger: [], glossary: [],
    risk: 0, reputation: 55, status: "playing",
    seed, rngState: seed, lastReport: null, pendingEventId: null, currentEvent: null,
    eventHistory: [], reportText: null, loanDone: false, loanResult: null,
    interviewUsedMonth: 0, interview: null,
  };
}
const LONG = "あ".repeat(55);
function addRule(state, effects) {
  const v = validateRecord({
    text: LONG, target: "全員", kind: "行動規範", direction: "必須", condition: "", exception: "",
    metric: null, effects, behavior: "", sideEffect: "",
  });
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  registerRule(state, v.record, []);
}
function run(strategy, seed) {
  const s = baseState(seed);
  if (strategy === "labor") {
    addRule(s, { sales: 3, stamina: -2 });
    addRule(s, { sales: 2, discipline: 2 });
  }
  if (strategy === "welfare") {
    addRule(s, { stamina: 3, faith: 2 });
    addRule(s, { stamina: 2, faith: 2 });
  }
  let cur = s;
  for (let w = 0; w < 6 && cur.status === "playing"; w++) {
    cur = simulateMonth(cur, { effects: aggregateEffects(cur.ledger), glossary: 0 }).state;
  }
  return cur;
}
function average(strategy, key) {
  let total = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = run(strategy, seed);
    if (key === "funds") total += s.funds;
    else if (key === "alive") total += s.status !== "bankrupt" ? 1 : 0;
    else {
      const vals = s.employees.map((e) => e[key]);
      total += vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
  }
  return total / 20;
}

const laborFunds = average("labor", "funds");
const noneFunds = average("none", "funds");
const welfareFaith = average("welfare", "faith");
const laborFaith = average("labor", "faith");
const laborHp = average("labor", "hp");
const welfareHp = average("welfare", "hp");
console.log(`labor funds ${Math.round(laborFunds)} / none ${Math.round(noneFunds)} / faith welfare ${Math.round(welfareFaith)} vs labor ${Math.round(laborFaith)} / hp labor ${Math.round(laborHp)} vs welfare ${Math.round(welfareHp)}`);

assert.ok(laborFunds > noneFunds + 100, "創業期は売上偏重型が資金で先行する");
assert.ok(welfareFaith > laborFaith + 10, "体力・信仰重視型は信仰度で大きく勝る");
assert.ok(welfareHp > laborHp + 15, "売上偏重型は体力が大きく削れる");
assert.ok(average("labor", "alive") >= 0.9, "売上偏重型でも6か月での倒産は例外的");
assert.ok(average("welfare", "alive") >= 0.9);
assert.ok(average("none", "alive") >= 0.9);

console.log("BALANCE TESTS OK");
