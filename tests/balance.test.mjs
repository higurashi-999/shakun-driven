// 創業期バランス検証：労働強化型は資金で先行するが疲労が危険域に入り、
// 福利厚生型は信仰度で勝る、という SPEC の反転カーブの創業期側を確認する。
import assert from "node:assert/strict";
import { simulateWeek } from "../js/sim.js";
import { initialEmployees } from "../js/employees.js";
import { validateRecord, registerRule, aggregateTags } from "../js/ledger.js";

function baseState(seed) {
  return {
    version: 1, mode: "white", phase: 1, week: 1, funds: 1000,
    employees: initialEmployees(), ledger: [], glossary: [],
    risk: 0, reputation: 55, status: "playing",
    seed, rngState: seed, lastReport: null, pendingEventId: null, currentEvent: null,
    eventHistory: [], reportText: null, loanDone: false, loanResult: null,
    interviewUsedWeek: 0, interview: null,
  };
}
function addRule(state, text, tag, strength) {
  const v = validateRecord({
    text, target: "全員", kind: "行動規範", direction: "必須", condition: "", exception: "",
    metric: null, tag, strength, priority: 1, behavior: "", sideEffect: "",
  });
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  registerRule(state, v.record, []);
}
function run(strategy, seed) {
  const s = baseState(seed);
  if (strategy === "labor") {
    addRule(s, "残業は厭わない", "労働強化", 3);
    addRule(s, "納期は絶対", "労働強化", 3);
    addRule(s, "成果で評価", "規律統制", 2);
  }
  if (strategy === "welfare") {
    addRule(s, "有給は全員消化", "福利厚生", 3);
    addRule(s, "残業は月20時間まで", "福利厚生", 3);
    addRule(s, "理念を毎朝唱和", "理念浸透", 2);
  }
  let cur = s;
  for (let w = 0; w < 6 && cur.status === "playing"; w++) {
    cur = simulateWeek(cur, { tags: aggregateTags(cur.ledger), contradictions: 0, glossary: 0 }).state;
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
const laborFatigue = average("labor", "fatigue");
const welfareFatigue = average("welfare", "fatigue");
console.log(`labor funds ${Math.round(laborFunds)} / none ${Math.round(noneFunds)} / faith welfare ${Math.round(welfareFaith)} vs labor ${Math.round(laborFaith)} / fatigue labor ${Math.round(laborFatigue)} vs welfare ${Math.round(welfareFatigue)}`);

assert.ok(laborFunds > noneFunds + 30, "創業期は労働強化型が資金で先行する");
assert.ok(welfareFaith > laborFaith + 10, "福利厚生型は信仰度で大きく勝る");
assert.ok(laborFatigue > welfareFatigue + 15, "労働強化型は疲労が危険域側に寄る");
assert.ok(average("labor", "alive") >= 0.9, "労働強化型でも6週での倒産は例外的");
assert.ok(average("welfare", "alive") >= 0.9);
assert.ok(average("none", "alive") >= 0.9);

console.log("BALANCE TESTS OK");
