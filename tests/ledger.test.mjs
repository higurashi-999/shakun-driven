// 台帳エンジンの単体テスト（node tests/ledger.test.mjs で実行。check.sh からも呼ばれる）
import assert from "node:assert/strict";
import {
  validateRecord,
  registerRule,
  abolishRule,
  aggregateEffects,
  budgetForLength,
  detectContradictions,
  previewText,
} from "../js/ledger.js";

function state() {
  return { week: 1, ledger: [], glossary: [] };
}
const LONG = "あ".repeat(55); // 55字＝効果の合計上限6
function rec(overrides = {}) {
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
  return v.record;
}

// validateRecord：不正な入力は弾く／効果と数値は正規化される
assert.equal(validateRecord({ text: "x", kind: "行動規範", direction: "必須" }).ok, false); // 効果なし
assert.equal(validateRecord({ text: "x", kind: "行動規範", direction: "必須", effects: { sales: 0, stamina: 0, faith: 0, rep: 0, discipline: 0 } }).ok, false); // 全て0
assert.equal(validateRecord({ text: "", kind: "行動規範", direction: "必須", effects: { sales: 1 } }).ok, false);
assert.equal(validateRecord({ text: "あ".repeat(61), kind: "行動規範", direction: "必須", effects: { sales: 1 } }).ok, false); // 60字上限
{
  const v = validateRecord({
    text: "会議は15分まで、時間は厳密に守ること。例外は認めない運用とする",
    kind: "数値ルール",
    direction: "必須",
    effects: { discipline: 9 },
    metric: { label: "会議時間", value: "15", unit: "分" },
  });
  assert.equal(v.ok, true);
  assert.equal(v.record.effects.discipline, 3); // 1項目は ±3 へ丸め
  assert.equal(v.record.metric.value, 15);
  assert.equal(v.record.target, "全員"); // 既定値
}
// 効果の合計予算：文字数で決まり、超えた分は弱められる
assert.equal(budgetForLength(10), 1);
assert.equal(budgetForLength(11), 2);
assert.equal(budgetForLength(60), 6);
{
  const v = validateRecord({ text: "短い", kind: "理念", direction: "必須", effects: { sales: 3, faith: 2 } });
  assert.equal(v.ok, true);
  const sum = Object.values(v.record.effects).reduce((a, b) => a + Math.abs(b), 0);
  assert.equal(sum, 1); // 3字＝上限1まで削られる
  assert.equal(v.record.effectsTrimmed, true);
}

// aggregateEffects：単純合計＋各項目 ±6 のクランプ
{
  const s = state();
  registerRule(s, rec({ effects: { sales: 3 } }));
  registerRule(s, rec({ effects: { sales: 3 } }));
  registerRule(s, rec({ effects: { sales: 3, stamina: -2 } }));
  const agg = aggregateEffects(s.ledger);
  assert.equal(agg.sales, 6); // 9 ではなく 6 に丸める
  assert.equal(agg.stamina, -2);
  assert.equal(agg.faith, 0);
  // 廃止すると集計から外れる
  abolishRule(s, "rule-1");
  const agg2 = aggregateEffects(s.ledger);
  assert.equal(agg2.sales, 6); // 残り2件でも 3+3=6
  abolishRule(s, "rule-2");
  assert.equal(aggregateEffects(s.ledger).sales, 3);
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
  registerRule(s, rec({ text: "お客様は神様である" }));
  const c = detectContradictions(rec({ text: "お客様は神様である" }), s.ledger);
  assert.equal(c.length, 1);
  assert.equal(c[0].type, "重複");
  // 無関係な社訓には誤検出しない
  const c2 = detectContradictions(rec({ text: "挨拶を徹底する" }), s.ledger);
  assert.equal(c2.length, 0);
}

// previewText：LLM由来の behavior があればそれを使い、効果の行を含む
{
  const p = previewText(rec({ text: "お客様は神様である。何があっても笑顔で対応し、クレームには即座に謝罪すること", effects: { sales: 2, rep: 1 }, behavior: "返品を全て受け入れます" }), []);
  assert.match(p, /返品を全て受け入れます/);
  assert.match(p, /売上向上/);
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

// --- M10：社訓3枠と寸劇 ---
import { MAX_ACTIVE_RULES, activeCount } from "../js/ledger.js";
assert.equal(MAX_ACTIVE_RULES, 3);
{
  const v = validateRecord({ text: "テスト社訓は理念として全員で唱和する", kind: "理念", direction: "必須", effects: { faith: 2 }, skit: "ある社員「心得た！」と叫んで早速実践した。" });
  assert.ok(v.ok);
  assert.ok(v.record.skit.includes("心得た"), "寸劇がレコードに保持される");
  assert.ok(previewText(v.record, []).includes("現場の寸劇"), "プレビューに寸劇が出る");
}
