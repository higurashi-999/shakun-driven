// 台帳エンジン：社訓レコードの検証・登録・改訂・廃止、タグ集計、矛盾検出、解釈プレビュー。
// 数値判定は全てコードで行う（設計原則）。このモジュールはDOMにもLLMにも依存しない純粋ロジック。
export const TAGS = [
  "労働強化",
  "福利厚生",
  "顧客絶対",
  "コスト削減",
  "挑戦奨励",
  "規律統制",
  "自由裁量",
  "理念浸透",
];

export const KINDS = ["理念", "行動規範", "数値ルール", "採用方針", "権限"];
export const DIRECTIONS = ["必須", "禁止", "推奨"];

// 相反タグのペア（集計時に重なった分だけ相殺する）
export const OPPOSITE_PAIRS = [
  ["労働強化", "福利厚生"],
  ["規律統制", "自由裁量"],
  ["コスト削減", "福利厚生"],
];

// タグごとの「社員の動き」と「副作用」（LLM由来の behavior / sideEffect が無い場合の定型）
export const TAG_BEHAVIOR = {
  "労働強化": { act: "より長く、より速く働こうとします", side: "疲労が溜まりやすくなります" },
  "福利厚生": { act: "休みと待遇を優先して働きます", side: "人件費などのコストがかかります" },
  "顧客絶対": { act: "顧客の要望を最優先に動きます", side: "利益率が下がりやすくなります" },
  "コスト削減": { act: "支出を切り詰めて動きます", side: "現場の不満が出やすくなります" },
  "挑戦奨励": { act: "新しい挑戦を後押しします", side: "失敗も増えます" },
  "規律統制": { act: "ルールと手順を厳密に守ります", side: "柔軟な対応がしにくくなります" },
  "自由裁量": { act: "現場の判断に任せて動きます", side: "統制が取りにくくなります" },
  "理念浸透": { act: "理念に沿って判断します", side: "外部の人には伝わりにくくなります" },
};

function str(v, fallback = "") {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function normalizeMetric(m) {
  if (!m || typeof m !== "object") return null;
  const label = str(m.label);
  const value = Number(m.value);
  if (!label || !Number.isFinite(value)) return null;
  return { label, value, unit: str(m.unit) };
}

// LLM出力や手入力を検証し、正規化したレコードを返す（id・履歴は付けない）
export function validateRecord(input) {
  const errors = [];
  if (!input || typeof input !== "object") {
    return { ok: false, errors: ["レコードがオブジェクトではありません"], record: null };
  }
  const text = str(input.text);
  if (!text) errors.push("原文（text）が空です");
  const kind = KINDS.includes(input.kind) ? input.kind : null;
  if (!kind) errors.push(`種別（kind）は ${KINDS.join("／")} のいずれかです`);
  const direction = DIRECTIONS.includes(input.direction) ? input.direction : null;
  if (!direction) errors.push(`方向（direction）は ${DIRECTIONS.join("／")} のいずれかです`);
  const tag = TAGS.includes(input.tag) ? input.tag : null;
  if (!tag) errors.push(`効果タグ（tag）は8種のいずれかです`);
  let strength = Number(input.strength ?? 2);
  if (!Number.isFinite(strength)) strength = 2;
  strength = Math.min(3, Math.max(1, Math.round(strength)));
  let priority = Number(input.priority ?? 1);
  if (!Number.isFinite(priority)) priority = 1;
  priority = Math.min(9, Math.max(1, Math.round(priority)));
  const metric = normalizeMetric(input.metric);
  if (input.metric && !metric) errors.push("数値（metric）は label と数値の value が必要です");
  if (errors.length) return { ok: false, errors, record: null };
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
      tag,
      strength,
      priority,
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

// 台帳へ登録する（state.ledger を更新）。contradictionIds は矛盾として記録する相手の id 群。
export function registerRule(state, record, contradictionIds = []) {
  const entry = {
    ...record,
    id: nextRuleId(state.ledger),
    status: "active",
    contradictions: [...contradictionIds],
    createdWeek: state.week,
    history: [{ week: state.week, action: "登録", note: contradictionIds.length ? "矛盾ありで強行登録" : "" }],
  };
  state.ledger.push(entry);
  return entry;
}

// 正式な改訂手続き：旧ルールを廃止する（ペナルティなしの差し替えは、廃止→新規登録の順で行う）
export function abolishRule(state, id, note = "") {
  const entry = (state.ledger || []).find((r) => r.id === id);
  if (!entry || entry.status !== "active") return false;
  entry.status = "abolished";
  entry.history.push({ week: state.week, action: "廃止", note });
  return true;
}

export function activeRules(ledger) {
  return (ledger || []).filter((r) => r.status === "active");
}

// タグ集計：同一タグの重ね掛けは逓減（2件目は半分、3件目は1/4…）、相反タグは重なり分を相殺。
export function aggregateTags(ledger) {
  const byTag = new Map(TAGS.map((t) => [t, []]));
  for (const r of activeRules(ledger)) {
    if (byTag.has(r.tag)) byTag.get(r.tag).push(r.strength);
  }
  const result = {};
  for (const tag of TAGS) {
    const strengths = byTag.get(tag).sort((a, b) => b - a);
    const raw = strengths.reduce((s, v) => s + v, 0);
    let effective = strengths.reduce((s, v, i) => s + v * Math.pow(0.5, i), 0);
    result[tag] = { raw, effective, count: strengths.length };
  }
  for (const [a, b] of OPPOSITE_PAIRS) {
    const sub = Math.min(result[a].effective, result[b].effective);
    result[a].effective -= sub;
    result[b].effective -= sub;
  }
  for (const tag of TAGS) result[tag].effective = Math.round(result[tag].effective * 100) / 100;
  return result;
}

function targetsOverlap(a, b) {
  return a === "全員" || b === "全員" || a === b;
}

// 新規レコードと既存の有効ルールとの矛盾・重複を検出する（コードによるスロット照合）
export function detectContradictions(candidate, ledger) {
  const found = [];
  for (const r of activeRules(ledger)) {
    if (candidate.id && r.id === candidate.id) continue;
    // 重複：同じ原文
    if (r.text === candidate.text) {
      found.push({ withId: r.id, withText: r.text, type: "重複", message: "同じ内容の社訓がすでに登録されています" });
      continue;
    }
    const sameMetric = candidate.metric && r.metric && candidate.metric.label === r.metric.label;
    const directionClash =
      (candidate.direction === "必須" && r.direction === "禁止") ||
      (candidate.direction === "禁止" && r.direction === "必須");
    if (directionClash && targetsOverlap(candidate.target, r.target)) {
      if (sameMetric) {
        found.push({
          withId: r.id,
          withText: r.text,
          type: "必須と禁止の衝突",
          message: `「${candidate.metric.label}」について、既存ルール「${r.text}」と必須／禁止が衝突します`,
        });
        continue;
      }
      if (candidate.tag === r.tag) {
        found.push({
          withId: r.id,
          withText: r.text,
          type: "必須と禁止の衝突",
          message: `同じ効果タグ（${candidate.tag}）で、既存ルール「${r.text}」と必須／禁止が衝突します`,
        });
        continue;
      }
    }
    // 数値の衝突：同じ指標に違う数値
    if (
      sameMetric &&
      candidate.metric.value !== r.metric.value &&
      candidate.direction !== "禁止" &&
      r.direction !== "禁止" &&
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

// 解釈プレビュー：社員がどう動くかを文章化する（LLM由来の behavior があれば優先）
// 有効な社訓の上限（M10：社訓3枠制）
export const MAX_ACTIVE_RULES = 3;

export function activeCount(state) {
  return (state.ledger || []).filter((r) => r.status === "active").length;
}

export function previewText(record, ledger = []) {
  const lines = [];
  const b = TAG_BEHAVIOR[record.tag] || { act: "", side: "" };
  const behavior = record.behavior || `${record.target}は「${record.text}」を${record.direction}として実行し、${b.act}。`;
  lines.push(`社員はこう動きます：${behavior}`);
  if (record.skit) lines.push(`現場の寸劇：${record.skit}`);
  if (record.metric) {
    lines.push(`数値ルール「${record.metric.label}：${record.metric.value}${record.metric.unit}」は、例外場面でも原則どおり厳密に適用されます。`);
  }
  if (record.condition) lines.push(`条件：${record.condition}`);
  if (record.exception) lines.push(`例外：${record.exception}`);
  const side = record.sideEffect || b.side;
  if (side) lines.push(`副作用：${side}`);
  const agg = aggregateTags(ledger);
  const opposed = OPPOSITE_PAIRS.filter(([a, c]) => a === record.tag || c === record.tag)
    .map(([a, c]) => (a === record.tag ? c : a))
    .filter((t) => agg[t] && agg[t].count > 0);
  lines.push(
    `効果タグ：${record.tag}（強度${record.strength}）` +
      (opposed.length ? `／${opposed.join("・")}系の既存社訓と相殺されます` : "")
  );
  return lines.join("\n");
}
