// 週報ナレーション：シムの素材ログを文章化する（LLM）。不通・失敗時は呼び出し側が素材ログ表示に落とす。
// 数値判定には関与しない。素材に無い出来事を作らないよう強く制約する。
import { callLLM } from "./llm.js?v=20261102.21";

// 本音を言う社員をコード側で決める：状態が一番際立っている人
export function pickCommentator(employees) {
  if (!employees || !employees.length) return null;
  return [...employees].sort((a, b) =>
    ((100 - b.hp) + Math.abs(b.faith - 50)) - ((100 - a.hp) + Math.abs(a.faith - 50))
  )[0];
}

export function buildNarrationPrompt(state, logLines, weekNo) {
  const glossary = (state.glossary || []).map((g) => `「${g.term}」（${g.definition}）`).join("、");
  return [
    "あなたは会社経営ゲームの週報ライターです。今週の素材ログをもとに、社長へ届ける週報を書いてください。",
    "厳守事項：",
    "- 素材ログにある数値・固有名詞・出来事は改変しない。素材に無い出来事、人物、数字は作らない",
    "- 形式：見出しなし。本文4〜6文＋最後に「来週への一言」を1文",
    "- 口調：前向きで簡潔。少しだけユーモアを入れてよい",
    glossary ? `- 社内用語（造語）があれば、そのうち1つを自然に使う：${glossary}` : "",
    "",
    `モード：${state.mode === "black" ? "ブラック" : "ホワイト"}／第${weekNo}週の週報`,
    (() => {
      const c = pickCommentator(state.employees);
      if (!c) return "";
      return `最後に必ず「【本音】${c.name}：」で始まる一文を1つだけ追加すること。これは社員 ${c.name}（体力${Math.round(c.hp)}・信仰度${Math.round(c.faith)}、性格の傾向：野心${c.ambition}・メンタル${c.mental}／各10段階）の、社長には直接言えない本音。少し毒っ気のある本音らしく、ただし数値や出来事は作らないこと。`;
    })(),
    "素材ログ：",
    ...logLines.map((l) => `- ${l}`),
    "",
    "週報：",
  ]
    .filter(Boolean)
    .join("\n");
}

// 文が完結しているか（途中で切れた生成を弾く）
export function looksComplete(text) {
  return /[。！？」）]$/.test(String(text).trim());
}

export function splitHonne(raw) {
  const idx = raw.indexOf("【本音】");
  if (idx < 0) return { text: raw.trim(), honne: "" };
  return { text: raw.slice(0, idx).trim(), honne: raw.slice(idx + "【本音】".length).trim() };
}

export async function narrateWeek(state, logLines, weekNo) {
  const prompt = buildNarrationPrompt(state, logLines, weekNo);
  let out = splitHonne(String(await callLLM("main", prompt, { temperature: 0.7, maxOutputTokens: 1600 })));
  if (!looksComplete(out.text)) {
    // 切断時は短く完結させる指示でもう一度だけ試す
    const retryPrompt = prompt + "\n（注意：350字以内で、文の途中で切れないよう最後まで完結させてください）";
    out = splitHonne(String(await callLLM("main", retryPrompt, { temperature: 0.7, maxOutputTokens: 1600 })));
  }
  if (!looksComplete(out.text)) throw new Error("narration truncated");
  return out;
}
