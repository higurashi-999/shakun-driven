// イベントの抽選・判定テスト（node tests/events.test.mjs）
import assert from "node:assert/strict";
import { EVENTS, drawEventId, getEvent, resolveEvent, parseEventJudgeResult, SIDE_LIMITS } from "../js/events.js";
import { initialEmployees } from "../js/employees.js";

function makeState(overrides = {}) {
  return {
    version: 1, mode: "white", phase: 1, month: 1, funds: 5000,
    employees: initialEmployees(), ledger: [], glossary: [],
    risk: 0, reputation: 50, status: "playing",
    seed: 777, rngState: 777, lastReport: null, eventHistory: [],
    ...overrides,
  };
}

// 抽選は決定的（同じ seed・月・履歴では同じイベント）
{
  const s = makeState();
  assert.equal(drawEventId(s, 2), drawEventId(s, 2));
  assert.ok(getEvent(drawEventId(s, 2)));
  assert.equal(EVENTS.length, 12);
}

// 社訓の効果の有無で結果が変わる：労基イベント
{
  const ev = getEvent("ev-labor-inspection");
  const withFx = resolveEvent(makeState(), ev, { type: "respond", text: "" }, { discipline: 3, stamina: 2 });
  assert.equal(withFx.grade, "成功");
  assert.ok(withFx.state.risk < 0 + 0 || withFx.effects.risk < 0);
  const noTags = resolveEvent(makeState(), ev, { type: "respond", text: "" }, {});
  assert.equal(noTags.grade, "失敗");
  assert.ok(noTags.state.funds < 5000);
}

// 社長命令文のキーワードが判定を押し上げる
{
  const ev = getEvent("ev-bank-concern");
  const plain = resolveEvent(makeState(), ev, { type: "respond", text: "なんとかします" }, {});
  const keyword = resolveEvent(makeState(), ev, { type: "respond", text: "資金繰り表を持って数字を説明します" }, {});
  assert.notEqual(plain.grade, "成功");
  assert.equal(keyword.grade, "成功");
}

// 静観は失敗効果の7割で済む
{
  const ev = getEvent("ev-late-payment");
  const ignored = resolveEvent(makeState(), ev, { type: "ignore" }, {});
  assert.equal(ignored.grade, "静観");
  assert.equal(ignored.state.funds, 5000 + Math.round(ev.fail.funds * 0.7));
}

// 造語が多いとSNSイベントの振れ幅が増幅される
{
  const ev = getEvent("ev-sns-buzz");
  const few = resolveEvent(makeState(), ev, { type: "respond", text: "理念を発信します" }, { faith: 3 }, 0);
  const many = resolveEvent(makeState(), ev, { type: "respond", text: "理念を発信します" }, { faith: 3 }, 3);
  assert.ok(Math.abs(many.effects.reputation) > Math.abs(few.effects.reputation));
}

// 入力 state を書き換えない（純粋関数）
{
  const s = makeState();
  const before = s.funds;
  resolveEvent(s, getEvent("ev-cost-spike"), { type: "respond", text: "交渉します" }, {});
  assert.equal(s.funds, before);
}

console.log("EVENTS TESTS OK");

// --- M5: AI判定のパースと適用 ---
{
  const parsed = parseEventJudgeResult('{"relevance":2,"specificity":1,"consistency":-1,"rationale":"具体的だが台帳と矛盾"}');
  assert.deepEqual(parsed, { relevance: 2, specificity: 1, consistency: -1, rationale: "具体的だが台帳と矛盾", sideEffects: [], effectReason: "" });
  assert.equal(parseEventJudgeResult("判定できません"), null);
  assert.equal(parseEventJudgeResult('{"relevance":"x"}'), null);
  const clamped = parseEventJudgeResult('{"relevance":9,"specificity":-3,"consistency":5,"rationale":"r"}');
  assert.equal(clamped.relevance, 2);
  assert.equal(clamped.specificity, 0);
  assert.equal(clamped.consistency, 1);
}
{
  // AI判定あり：関連性が高く具体的な社長命令は、タグがなくても成功する
  const s = makeState();
  const ev = getEvent("ev-server-down");
  const res = resolveEvent(s, ev, { type: "respond", text: "CTOを責任者に復旧手順を共有し、30分ごとに全社へ進捗を出す" }, {}, 0,
    { relevance: 2, specificity: 2, consistency: 0, rationale: "正面から具体的に向き合っている" });
  assert.equal(res.grade, "成功");
  assert.ok(res.lines.some((l) => l.startsWith("AI判定：")));
  // 的外れな社長命令は台帳の効果が強くても成功にならない
  const res2 = resolveEvent(s, ev, { type: "respond", text: "頑張ります" }, { discipline: 5 }, 0,
    { relevance: 0, specificity: 0, consistency: 0, rationale: "イベントに触れていない" });
  assert.notEqual(res2.grade, "成功");
}

// --- M5.2: 「無視」のような放棄は静観扱い／対策のない社長命令はAI経路で失敗上限 ---
{
  const s = makeState();
  const ev = getEvent("ev-labor-crackdown") || EVENTS.find((e) => e.category === "法改正・規制");
  const res = resolveEvent(s, ev, { type: "respond", text: "無視" }, { discipline: 5, stamina: 5 }, 0);
  assert.equal(res.grade, "静観", JSON.stringify(res.lines));
  const aiRes = resolveEvent(s, ev, { type: "respond", text: "注視していく" }, {}, 0,
    { relevance: 1, specificity: 0, consistency: 0, rationale: "対策を講じていない" });
  assert.equal(aiRes.grade, "失敗", JSON.stringify(aiRes.lines));
  const okRes = resolveEvent(s, ev, { type: "respond", text: "労務管理を徹底する" }, { discipline: 3 }, 0,
    { relevance: 2, specificity: 0, consistency: 0, rationale: "正面から向き合っている" });
  assert.notEqual(okRes.grade, "失敗");
}

// --- M9：社長命令の余波（パースのクランプと適用） ---
const parsed = parseEventJudgeResult('{"relevance":2,"specificity":1,"consistency":0,"rationale":"ok","sideEffects":[{"key":"funds","value":-999},{"key":"faith","value":3},{"key":"unknown","value":5},{"key":"risk","value":0}],"effectReason":"臨時対応費"}');
assert.equal(parsed.sideEffects.length, 2, "不正キーと0は除外される");
assert.equal(parsed.sideEffects[0].value, -SIDE_LIMITS.funds, "資金は下限にクランプされる");
assert.equal(parsed.sideEffects[1].value, 3);
const ev9 = EVENTS.find((e) => e.id === "ev-server-down");
const judge9 = { relevance: 2, specificity: 1, consistency: 0, rationale: "x", sideEffects: [{ key: "funds", value: -20 }, { key: "faith", value: 5 }], effectReason: "対応費と感謝" };
const before9 = initialEmployees();
const r9 = resolveEvent(makeState(), ev9, { type: "respond", text: "復旧手順を実施" }, {}, 0, judge9);
assert.ok(r9.lines.some((l) => l.includes("社長命令の余波")), "余波の行が出る");
assert.equal(r9.state.funds, Math.round((5000 + (r9.effects.funds || 0) - 20) * 10) / 10, "資金の余波が適用される");
r9.state.employees.forEach((e, i) => {
  const want = Math.min(100, Math.max(0, before9[i].faith + (r9.effects.faithAll || 0) + 5));
  assert.equal(e.faith, want, "信仰の余波が全員に適用される");
});
const judgeNg = { ...judge9, relevance: 0 };
const rNg = resolveEvent(makeState(), ev9, { type: "respond", text: "がんばれ" }, {}, 0, judgeNg);
assert.ok(!rNg.lines.some((l) => l.includes("社長命令の余波")), "無関係な命令には余波が付かない");
console.log("EVENTS TESTS OK");
