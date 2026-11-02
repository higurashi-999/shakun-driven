// イベントの抽選・判定テスト（node tests/events.test.mjs）
import assert from "node:assert/strict";
import { EVENTS, drawEventId, getEvent, resolveEvent, parseEventJudgeResult } from "../js/events.js";
import { initialEmployees } from "../js/employees.js";

function makeState(overrides = {}) {
  return {
    version: 1, mode: "white", phase: 1, week: 1, funds: 1000,
    employees: initialEmployees(), ledger: [], glossary: [],
    risk: 0, reputation: 50, status: "playing",
    seed: 777, rngState: 777, lastReport: null, eventHistory: [],
    ...overrides,
  };
}

// 抽選は決定的（同じ seed・週・履歴では同じイベント）
{
  const s = makeState();
  assert.equal(drawEventId(s, 2), drawEventId(s, 2));
  assert.ok(getEvent(drawEventId(s, 2)));
  assert.equal(EVENTS.length, 12);
}

// 社訓（タグ）の有無で結果が変わる：労基イベント
{
  const ev = getEvent("ev-labor-inspection");
  const withTags = resolveEvent(makeState(), ev, { type: "respond", text: "" }, { "規律統制": 3, "福利厚生": 2 });
  assert.equal(withTags.grade, "成功");
  assert.ok(withTags.state.risk < 0 + 0 || withTags.effects.risk < 0);
  const noTags = resolveEvent(makeState(), ev, { type: "respond", text: "" }, {});
  assert.equal(noTags.grade, "失敗");
  assert.ok(noTags.state.funds < 1000);
}

// 布告文のキーワードが判定を押し上げる
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
  assert.equal(ignored.state.funds, 1000 + Math.round(ev.fail.funds * 0.7));
}

// 造語が多いとSNSイベントの振れ幅が増幅される
{
  const ev = getEvent("ev-sns-buzz");
  const few = resolveEvent(makeState(), ev, { type: "respond", text: "理念を発信します" }, { "理念浸透": 3 }, 0);
  const many = resolveEvent(makeState(), ev, { type: "respond", text: "理念を発信します" }, { "理念浸透": 3 }, 3);
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
  assert.deepEqual(parsed, { relevance: 2, specificity: 1, consistency: -1, rationale: "具体的だが台帳と矛盾" });
  assert.equal(parseEventJudgeResult("判定できません"), null);
  assert.equal(parseEventJudgeResult('{"relevance":"x"}'), null);
  const clamped = parseEventJudgeResult('{"relevance":9,"specificity":-3,"consistency":5,"rationale":"r"}');
  assert.equal(clamped.relevance, 2);
  assert.equal(clamped.specificity, 0);
  assert.equal(clamped.consistency, 1);
}
{
  // AI判定あり：関連性が高く具体的な布告は、タグがなくても成功する
  const s = makeState();
  const ev = getEvent("ev-server-down");
  const res = resolveEvent(s, ev, { type: "respond", text: "CTOを責任者に復旧手順を共有し、30分ごとに全社へ進捗を出す" }, {}, 0,
    { relevance: 2, specificity: 2, consistency: 0, rationale: "正面から具体的に向き合っている" });
  assert.equal(res.grade, "成功");
  assert.ok(res.lines.some((l) => l.startsWith("AI判定：")));
  // 的外れな布告はタグが強くても成功にならない
  const res2 = resolveEvent(s, ev, { type: "respond", text: "頑張ります" }, { "規律統制": 5 }, 0,
    { relevance: 0, specificity: 0, consistency: 0, rationale: "イベントに触れていない" });
  assert.notEqual(res2.grade, "成功");
}

// --- M5.2: 「無視」のような放棄は静観扱い／対策のない布告はAI経路で失敗上限 ---
{
  const s = makeState();
  const ev = getEvent("ev-labor-crackdown") || EVENTS.find((e) => e.category === "法改正・規制");
  const res = resolveEvent(s, ev, { type: "respond", text: "無視" }, { "規律統制": 5, "福利厚生": 5 }, 0);
  assert.equal(res.grade, "静観", JSON.stringify(res.lines));
  const aiRes = resolveEvent(s, ev, { type: "respond", text: "注視していく" }, {}, 0,
    { relevance: 1, specificity: 0, consistency: 0, rationale: "対策を講じていない" });
  assert.equal(aiRes.grade, "失敗", JSON.stringify(aiRes.lines));
  const okRes = resolveEvent(s, ev, { type: "respond", text: "労務管理を徹底する" }, { "規律統制": 3 }, 0,
    { relevance: 2, specificity: 0, consistency: 0, rationale: "正面から向き合っている" });
  assert.notEqual(okRes.grade, "失敗");
}
