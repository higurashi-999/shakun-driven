// 台帳エンジン：社訓レコードの検証・登録・改訂・廃止、効果（5項目）の集計、解釈プレビュー。
// 数値判定は全てコードで行う（設計原則）。このモジュールはDOMにもLLMにも依存しない純粋ロジック。
// M13：効果モデルを「効き方8種（タグ）」から「5項目の効果ベクトル」に作り替えた。
// M12：社訓同士の「矛盾」の仕組みは廃止済み。detectContradictions は旧セーブ互換のためだけに残置し、ゲーム内では使わない。

export const KINDS = ["理念", "行動規範", "数値ルール", "採用方針", "権限"];
export const DIRECTIONS = ["必須", "禁止", "推奨"];

// 効果の5項目（M13）。プラスは「その性質が強まる」方向で統一する。
export const EFFECT_AXES = [
{ key: "sales", label: "売上向上"},
{ key: "stamina", label: "体力向上"},
{ key: "faith", label: "信仰向上"},
{ key: "rep", label: "評判向上"},
{ key: "discipline", label: "規律強化"},
];
export const AXIS_KEYS = EFFECT_AXES.map((a) => a.key);
export const AXIS_LABEL = Object.fromEntries(EFFECT_AXES.map((a) => [a.key, a.label]));
export const MAX_AXIS_PER_RULE = 3; // 1項目あたりの上限（1件の社訓）
export const MAX_AXIS_TOTAL = 6; // 台帳全体の合計の上限（各項目）
export const MAX_CREED_LENGTH = 60; // 社訓の文字数上限

// 文字数から決まる「効果の合計予算」：10字ごとに1増え、最大6（M13でユーザーが決定した6段階）。
export function budgetForLength(len) {
return Math.min(6, Math.max(1, Math.ceil((Number(len) || 0) / 10)));
}

function str(v, fallback = "") {
return typeof v === "string" && v.trim()? v.trim(): fallback;
}

function normalizeMetric(m) {
if (!m || typeof m!== "object") return null;
const label = str(m.label);
const value = Number(m.value);
if (!label ||!Number.isFinite(value)) return null;
return { label, value, unit: str(m.unit)};
}

// 効果ベクトルの正規化：各項目を −3〜+3 に丸め、絶対値の合計が文字数予算を超えたら大きい順に削る。
function normalizeEffects(input, textLength) {
const raw = input && typeof input === "object"? input: null;
if (!raw) return { effects: null, trimmed: false, budget: budgetForLength(textLength)};
const effects = {};
for (const key of AXIS_KEYS) {
const v = Number(raw[key]);
effects[key] = Number.isFinite(v)? Math.min(MAX_AXIS_PER_RULE, Math.max(-MAX_AXIS_PER_RULE, Math.round(v))): 0;
}
const budget = budgetForLength(textLength);
let total = AXIS_KEYS.reduce((s, k) => s + Math.abs(effects[k]), 0);
let trimmed = false;
while (total > budget) {
// 最も大きい項目を0へ1つ近づける（同点は EFFECT_AXES の並び順で先のものを優先）
let target = null;
for (const key of AXIS_KEYS) {
if (effects[key]!== 0 && (target === null || Math.abs(effects[key]) > Math.abs(effects[target]))) target = key;
}
if (target === null) break;
effects[target] += effects[target] > 0? -1: 1;
total -= 1;
trimmed = true;
}
return { effects, trimmed, budget};
}

// LLM出力や手入力を検証し、正規化したレコードを返す（id・履歴は付けない）
export function validateRecord(input) {
const errors = [];
if (!input || typeof input!== "object") {
return { ok: false, errors: ["レコードがオブジェクトではありません"], record: null};
}
const text = str(input.text);
if (!text) errors.push("原文（text）が空です");
if (text.length > MAX_CREED_LENGTH) errors.push(`社訓は${MAX_CREED_LENGTH}字までです（現在 ${text.length} 字）`);
const kind = KINDS.includes(input.kind)? input.kind: null;
if (!kind) errors.push(`種別（kind）は ${KINDS.join("／")} のいずれかです`);
const direction = DIRECTIONS.includes(input.direction)? input.direction: null;
if (!direction) errors.push(`方向（direction）は ${DIRECTIONS.join("／")} のいずれかです`);
const metric = normalizeMetric(input.metric);
if (input.metric &&!metric) errors.push("数値（metric）は label と数値の value が必要です");
const { effects, trimmed, budget} = normalizeEffects(input.effects, text.length);
if (!effects) errors.push("効果（effects）が必要です");
else if (AXIS_KEYS.every((k) => effects[k] === 0)) errors.push("効果がすべて0です。いずれかの項目に ±1 以上を付けてください");
if (errors.length) return { ok: false, errors, record: null};
return {
ok: true,
errors: [],
record: {
text,
target: str(input.target, "全員"),
kind,
direction,
condition: str(input.condition),
exception: str(input.exception),
metric,
effects,
effectsBudget: budget,
effectsTrimmed: trimmed,
behavior: str(input.behavior),
sideEffect: str(input.sideEffect),
skit: str(input.skit),
},
};
}

export function nextRuleId(ledger) {
let max = 0;
for (const r of ledger || []) {
const m = /^rule-(\d+)$/.exec(r.id || "");
if (m) max = Math.max(max, Number(m[1]));
}
return `rule-${max + 1}`;
}

// 台帳へ登録する（state.ledger を更新）。第3引数は旧・矛盾記録の互換用で、現在は常に空。
export function registerRule(state, record, contradictionIds = []) {
const entry = {
...record,
id: nextRuleId(state.ledger),
status: "active",
contradictions: [...contradictionIds],
createdWeek: state.week,
history: [{ week: state.week, action: "登録", note: ""}],
};
state.ledger.push(entry);
return entry;
}

// 正式な改訂手続き：旧ルールを廃止する（ペナルティなしの差し替えは、廃止→新規登録の順で行う）
export function abolishRule(state, id, note = "") {
const entry = (state.ledger || []).find((r) => r.id === id);
if (!entry || entry.status!== "active") return false;
entry.status = "abolished";
entry.history.push({ week: state.week, action: "廃止", note});
return true;
}

export function activeRules(ledger) {
return (ledger || []).filter((r) => r.status === "active");
}

// 効果の集計：有効な社訓の効果を単純に合計し、各項目を ±6 に丸める（M13）。
export function aggregateEffects(ledger) {
const out = {};
for (const key of AXIS_KEYS) out[key] = 0;
for (const r of activeRules(ledger)) {
if (!r.effects) continue;
for (const key of AXIS_KEYS) out[key] += Number(r.effects[key]) || 0;
}
for (const key of AXIS_KEYS) out[key] = Math.min(MAX_AXIS_TOTAL, Math.max(-MAX_AXIS_TOTAL, out[key]));
return out;
}

// 効果ベクトルを「売上向上 +2／体力向上 −1」の形に整形する（0の項目は略す）
export function effectsText(effects) {
if (!effects) return "";
return EFFECT_AXES.filter((a) => (effects[a.key] || 0)!== 0)
.map((a) => `${a.label} ${effects[a.key] > 0? "+": "−"}${Math.abs(effects[a.key])}`)
.join("／");
}

function targetsOverlap(a, b) {
return a === "全員" || b === "全員" || a === b;
}

// 新規レコードと既存の有効ルールとの矛盾・重複の検出（M12で仕組み自体は廃止）
export function detectContradictions(candidate, ledger) {
const found = [];
for (const r of activeRules(ledger)) {
if (candidate.id && r.id === candidate.id) continue;
if (r.text === candidate.text) {
found.push({ withId: r.id, withText: r.text, type: "重複", message: "同じ内容の社訓がすでに登録されています"});
continue;
}
const sameMetric = candidate.metric && r.metric && candidate.metric.label === r.metric.label;
const directionClash =
(candidate.direction === "必須" && r.direction === "禁止") ||
(candidate.direction === "禁止" && r.direction === "必須");
if (directionClash && targetsOverlap(candidate.target, r.target) && sameMetric) {
found.push({
withId: r.id,
withText: r.text,
type: "必須と禁止の衝突",
message: `「${candidate.metric.label}」について、既存ルール「${r.text}」と必須／禁止が衝突します`,
});
continue;
}
if (
sameMetric &&
candidate.metric.value!== r.metric.value &&
candidate.direction!== "禁止" &&
r.direction!== "禁止" &&
targetsOverlap(candidate.target, r.target)
) {
found.push({
withId: r.id,
withText: r.text,
type: "数値の衝突",
message: `「${candidate.metric.label}」の数値が既存ルール（${r.metric.value}${r.metric.unit}）と異なります`,
});
}
}
return found;
}

// 有効な社訓の上限（M10：社訓3枠制）
export const MAX_ACTIVE_RULES = 3;

export function activeCount(state) {
return (state.ledger || []).filter((r) => r.status === "active").length;
}

// 解釈プレビュー：社員がどう動くかを文章化する（LLM由来の behavior があれば優先）
export function previewText(record, ledger = []) {
const lines = [];
const behavior = record.behavior || `${record.target}は「${record.text}」を${record.direction}として、そのまま実行します。`;
lines.push(`社員はこう動きます：${behavior}`);
if (record.skit) lines.push(`現場の寸劇：${record.skit}`);
if (record.metric) {
lines.push(`数値ルール「${record.metric.label}：${record.metric.value}${record.metric.unit}」は、例外場面でも原則どおり厳密に適用されます。`);
}
if (record.condition) lines.push(`条件：${record.condition}`);
if (record.exception) lines.push(`例外：${record.exception}`);
if (record.sideEffect) lines.push(`注意点：${record.sideEffect}`);
const fx = effectsText(record.effects);
if (fx) lines.push(`効果：${fx}（効果の合計 ${AXIS_KEYS.reduce((s, k) => s + Math.abs(record.effects[k] || 0), 0)}／上限 ${record.effectsBudget?? budgetForLength(record.text.length)}）`);
if (record.effectsTrimmed) lines.push("※ 文字数から決まる上限を超えたため、効果の一部を弱めて調整しました。長く具体的に書くほど、強い効果を持てます。");
return lines.join("\n");
}
