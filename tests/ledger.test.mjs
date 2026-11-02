// 台帳エンジンの単体テスト（node tests/ledger.test.mjs で実行。check.sh からも呼ばれる）
import assert from "node:assert/strict";
import {
  validateRecord,
  registerRule,
  abolishRule,
  aggregateTags,
  detectContradictions,
  previewText,
} from "../js/ledger.js";

function state() {
  return { week: 1, ledger: [], glossary: [] };
}
function rec(overrides = {}) {
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
  return v.record;
}

// validateRecord：不正なタグは弾く／数値は正規化される
assert.equal(validateRecord({ text: "x", kind: "行動規範", direction: "必須", tag: "存在しない" }).ok, false);
assert.equal(validateRecord({ text: "", kind: "行動規範", direction: "必須", tag: "規律統制" }).ok, false);
{
  const v = validateRecord({
    text: "会議は15分まで",
    kind: "数値ルール",
    direction: "必須",
    tag: "規律統制",
    strength: 9,
    metric: { label: "会議時間", value: "15", unit: "分" },
  });
  assert.equal(v.ok, true);
  assert.equal(v.record.strength, 3); // 1〜3へ丸め
  assert.equal(v.record.metric.value, 15);
  assert.equal(v.record.target, "全員"); // 既定値
}

// aggregateTags：逓減と相殺
{
  const s = state();
  registerRule(s, rec({ text: "a", tag: "労働強化", strength: 3 }));
  registerRule(s, rec({ text: "b", tag: "労働強化", strength: 2 }));
  registerRule(s, rec({ text: "c", tag: "福利厚生", strength: 2 }));
  const agg = aggregateTags(s.ledger);
  // 労働強化：3 + 2*0.5 = 4、福利厚生：2 → 相殺で 労働強化 2 / 福利厚生 0
  assert.equal(agg["労働強化"].effective, 2);
  assert.equal(agg["福利厚生"].effective, 0);
  assert.equal(agg["労働強化"].count, 2);
  // 廃止すると集計から外れる
  abolishRule(s, "rule-1");
  const agg2 = aggregateTags(s.ledger);
  assert.equal(agg2["労働強化"].count, 1);
}

// detectContradictions：数値の衝突
{
  const s = state();
  registerRule(s, rec({ text: "会議は15分まで", metric: { label: "会議時間", value: 15, unit: "分" } }));
  const c = detectContradictions(
    rec({ text: "会議は30分まで", metric: { label: "会議時間", value: 30, unit: "分" } }),
    s.ledger
  );
  assert.equal(c.length, 1);
  assert.equal(c[0].type, "数値の衝突");
  // 同じ数値なら衝突しない
  const c2 = detectContradictions(
    rec({ text: "会議は15分以内", metric: { label: "会議時間", value: 15, unit: "分" } }),
    s.ledger
  );
  assert.equal(c2.length, 0);
}

// detectContradictions：必須×禁止（同じ指標）
{
  const s = state();
  registerRule(s, rec({ text: "残業は必須", metric: { label: "残業", value: 1, unit: "" } }));
  const c = detectContradictions(
    rec({ text: "残業は禁止", direction: "禁止", metric: { label: "残業", value: 1, unit: "" } }),
    s.ledger
  );
  assert.equal(c.some((x) => x.type === "必須と禁止の衝突"), true);
}

// detectContradictions：重複
{
  const s = state();
  registerRule(s, rec({ text: "お客様は神様である", tag: "顧客絶対" }));
  const c = detectContradictions(rec({ text: "お客様は神様である", tag: "顧客絶対" }), s.ledger);
  assert.equal(c.length, 1);
  assert.equal(c[0].type, "重複");
  // 無関係な社訓には誤検出しない
  const c2 = detectContradictions(rec({ text: "挨拶を徹底する", tag: "理念浸透" }), s.ledger);
  assert.equal(c2.length, 0);
}

// previewText：LLM由来の behavior があればそれを使い、タグ行を含む
{
  const p = previewText(rec({ text: "お客様は神様である", tag: "顧客絶対", behavior: "返品を全て受け入れます" }), []);
  assert.match(p, /返品を全て受け入れます/);
  assert.match(p, /顧客絶対/);
}

// registerRule：矛盾の記録と履歴
{
  const s = state();
  const e1 = registerRule(s, rec({ text: "one" }));
  const e2 = registerRule(s, rec({ text: "two" }), [e1.id]);
  assert.deepEqual(e2.contradictions, [e1.id]);
  assert.equal(e2.history[0].action, "登録");
  assert.equal(abolishRule(s, e2.id), true);
  assert.equal(s.ledger[1].status, "abolished");
}

console.log("LEDGER TESTS OK");
