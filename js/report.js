// 月報ナレーション：シムの素材ログを文章化する（LLM）。不通・失敗時は呼び出し側が素材ログ表示に落とす。
// 数値判定には関与しない。素材に無い出来事を作らないよう強く制約する。
import { callLLM } from "./llm.js?v=20261102.27";

// 本音を言う社員をコード側で決める：状態が一番際立っている人
export function pickCommentator(employees) {
  if (!employees || !employees.length) return null;
  return [...employees].sort((a, b) =>
    ((100 - b.hp) + Math.abs(b.faith - 50)) - ((100 - a.hp) + Math.abs(a.faith - 50))
  )[0];
}

export function buildNarrationPrompt(state, logLines, monthNo) {
  return [
    "あなたは会社経営ゲームの月報ライターです。今月の素材ログをもとに、社長へ届ける月報（社内報）を書いてください。",
    "厳守事項：",
    "- 素材ログにある数値・固有名詞・出来事は改変しない。素材に無い出来事、人物、数字は作らない",
    "- 形式：次の4つの見出しをこの順番・この表記のままで必ず使う。各見出しの本文は指定の文数まで。全体で300字前後（250〜330字）に収める",
    "【見出し】今月を一言で表す見出し（15字以内、本文なし）",
    "【今月の数字】売上・費用・収支・資金などの要点を2文以内",
    "【出来事】今月の主な出来事（部門別の貢献トップ・ワースト、体調の変化、入退社など）を2文以内",
    "【来月】来月の見通しや兆しを1文",
    "- 口調：前向きで簡潔。少しだけユーモアを入れてよい",
    "",
    `モード：${state.mode === "black" ? "ブラック" : "ホワイト"}／第${monthNo}月の月報`,
    (() => {
      const c = pickCommentator(state.employees);
      if (!c) return "";
      return `最後に必ず「【本音】${c.name}：」で始まる一文を1つだけ追加すること。これは社員 ${c.name}（体力${Math.round(c.hp)}・信仰度${Math.round(c.faith)}、性格の傾向：野心${c.ambition}・メンタル${c.mental}／各10段階）の、社長には直接言えない本音。少し毒っ気のある本音らしく、ただし数値や出来事は作らないこと。`;
    })(),
    "素材ログ：",
    ...logLines.map((l) => `- ${l}`),
    "",
    "月報：",
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
  // 本音は1文だけを抜き出す（文の途中に置かれても、後続の本文を巻き込まない）
  const after = raw.slice(idx + "【本音】".length);
  const m = after.match(/^[^。！？]*[。！？]/);
  const honne = (m ? m[0] : after).trim();
  const rest = (raw.slice(0, idx) + after.slice(m ? m[0].length : after.length)).trim();
  return { text: rest, honne };
}

export async function narrateMonth(state, logLines, monthNo) {
  const prompt = buildNarrationPrompt(state, logLines, monthNo);
  let out = splitHonne(String(await callLLM("main", prompt, { temperature: 0.7, maxOutputTokens: 900 })));
  if (!looksComplete(out.text)) {
    // 切断時は短く完結させる指示でもう一度だけ試す（再試行で本音が落ちたら、初回の本音を引き継ぐ）
    const retryPrompt = prompt + "\n（注意：300字以内で、文の途中で切れないよう最後まで完結させてください）";
    const retry = splitHonne(String(await callLLM("main", retryPrompt, { temperature: 0.7, maxOutputTokens: 900 })));
    out = looksComplete(retry.text) ? { text: retry.text, honne: retry.honne || out.honne } : retry;
  }
  if (!looksComplete(out.text)) throw new Error("narration truncated");
  return out;
}
