// 社訓の構造化：自由文→台帳レコード（JSON）。プロンプト生成・応答パース・スキーマ検証・1回再試行。
// 検証は ledger.js の validateRecord に委ね、崩れた応答はエラー内容を添えて再試行する。
import { callLLM } from "./llm.js?v=20261102.25";
import { validateRecord, EFFECT_AXES, KINDS, DIRECTIONS, budgetForLength } from "./ledger.js?v=20261102.25";

export function buildExtractionPrompt(text) {
  const budget = budgetForLength(text.length);
  return [
    "あなたは会社経営ゲームの「社訓台帳エンジン」です。社長が書いた社訓・就業規則の文章を、機械可読なJSONへ構造化してください。",
    "出力はJSONオブジェクトのみ。前置き・説明・コードフェンスは禁止です。",
    "",
    "フィールド定義：",
    `- target: 対象。"全員"が基本。具体的な部署・役職が明示された場合のみその文言`,
    `- kind: 種別のいずれか：${KINDS.join("／")}`,
    `- direction: 方向のいずれか：${DIRECTIONS.join("／")}。「〜するな」「禁止」は禁止、「〜すべき」「必ず」は必須、努力目標は推奨`,
    "- condition: 適用条件（無ければ空文字）",
    "- exception: 例外（無ければ空文字）",
    '- metric: 数値ルールが含まれる場合のみ {"label":"指標名","value":数値,"unit":"単位"}、無ければ null',
    `- effects: 効果を5項目で表すJSON。各キーは ${EFFECT_AXES.map((a) => `${a.key}＝${a.label}`).join("、")}。各 −3〜+3 の整数で、プラスはその性質が強まる方向（例：残業を強いる社訓なら sales はプラス、stamina はマイナス）。関係ない項目は 0`,
    `- effects の絶対値の合計は ${budget} 以下にすること（社訓の文字数 ${text.length} 字から決まる上限）。合計が上限を超える出力は自動で弱められます`,
    "- behavior: 社員がこの社訓を文字どおり（リテラルに）実行したときの具体的な動きを1文で。極端な文字どおり解釈がこのゲームの肝なので、遠慮なく書き切る",
    "- sideEffect: その注意点（裏で起きる困りごと）を1文で",
    "- skit: この社訓が現場で実行される様子を、実在の社員の名前を使わず「ある社員」の形で、セリフ入りの短い寸劇にして2文以内。「文字どおり解釈のズレ」が伝わる書き方で",
    "",
    "例1：",
    "入力：「お客様は神様である。何があっても笑顔で対応し、クレームには即座に謝罪すること」（37字、上限4）",
    '出力：{"target":"全員","kind":"理念","direction":"必須","condition":"","exception":"","metric":null,"effects":{"sales":2,"stamina":-1,"faith":0,"rep":1,"discipline":0},"behavior":"返品・返金要求を原則すべて受け入れます","sideEffect":"クレームは減りますが利益率が下がります"}',
    "例2：",
    "入力：「会議は15分まで」（8字、上限1）",
    '出力：{"target":"全員","kind":"数値ルール","direction":"必須","condition":"","exception":"","metric":{"label":"会議時間","value":15,"unit":"分"},"effects":{"sales":0,"stamina":0,"faith":0,"rep":0,"discipline":1},"behavior":"会議を15分で打ち切ります","sideEffect":"商談も15分で切るため、大口の交渉では不利になります"}',
    "",
    `入力：「${text}」`,
    "出力：",
  ].join("\n");
}

// LLM応答からJSONを取り出す（フェンスや前後の文が混ざっても拾う）
export function parseJsonLoose(raw) {
  if (typeof raw !== "string") throw new Error("応答が文字列ではありません");
  let s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSONが見つかりません");
  return JSON.parse(s.slice(start, end + 1));
}

// 自由文を構造化する。検証に失敗したら理由を添えて1回だけ再試行する。
export async function extractRule(text) {
  const basePrompt = buildExtractionPrompt(text);
  let prompt = basePrompt;
  let lastErrors = [];
  let lastRaw = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callLLM("structure", prompt, { json: true, temperature: 0.2, maxOutputTokens: 900 });
    lastRaw = raw;
    try {
      const parsed = parseJsonLoose(raw);
      parsed.text = text; // 原文は常に入力どおり保持する
      const v = validateRecord(parsed);
      if (v.ok) return { ok: true, record: v.record };
      lastErrors = v.errors;
    } catch (e) {
      lastErrors = [String(e.message || e)];
    }
    prompt =
      basePrompt +
      `\n\n前回の出力は次の理由で使えませんでした：${lastErrors.join("；")}。指摘を直し、JSONオブジェクトのみを出力してください。`;
  }
  return { ok: false, errors: lastErrors, raw: lastRaw };
}
