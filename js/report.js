// 週報ナレーション：シムの素材ログを文章化する（LLM）。不通・失敗時は呼び出し側が素材ログ表示に落とす。
// 数値判定には関与しない。素材に無い出来事を作らないよう強く制約する。
import { callLLM } from "./llm.js?v=20261102.14";

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
    "素材ログ：",
    ...logLines.map((l) => `- ${l}`),
    "",
    "週報：",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function narrateWeek(state, logLines, weekNo) {
  const prompt = buildNarrationPrompt(state, logLines, weekNo);
  const text = await callLLM("main", prompt, { temperature: 0.7, maxOutputTokens: 700 });
  return String(text).trim();
}
