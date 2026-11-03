// シーン判定：融資審査と面談（退職相談）。どちらも数値判定はコード、文章だけをLLMに任せる。
// このモジュールは import を持たない（node の単体テストで直接読み込むため）。
export const TURNOVER_COST = 234; // 離職コスト（万円）＝年収の50%（sim.js の PARAMS と一致）

/* ================= 融資審査（第4週の固定イベント） ================= */
// 台帳の整合性と初期実績から、合否・金額・金利と理由を決める。
export function judgeLoan(state, tags) {
const factors = [];
let score = 50;
const add = (label, points) => {
factors.push({ label, points});
score += points;
};
const active = (state.ledger || []).filter((r) => r.status === "active");
const contradictionPairs = active.reduce((s, r) => s + (r.contradictions || []).length, 0);
const avgFaith = state.employees.length
? state.employees.reduce((s, e) => s + e.faith, 0) / state.employees.length
: 0;

if (active.length >= 3) add(`社訓が ${active.length} 件そろい、経営方針が形になっている`, 8);
else if (active.length >= 1) add("社訓はあるが、まだ方針として薄い", 2);
else add("社訓が1件もなく、経営方針が見えない", -12);
const contraPenalty = state.mode === "black" ? 8 : 15; // ブラック：銀行は数字を見て目をつぶる
if (contradictionPairs > 0) add(`台帳に矛盾の記録が ${contradictionPairs} 件ある`, -contraPenalty * contradictionPairs);
else if (active.length >= 1) add("台帳に矛盾の記録がない", 6);
const discipline = tags["規律統制"] || 0;
if (discipline >= 1.5) add("規律・管理の社訓が効いており、数字の管理が期待できる", 8);
const costCut = tags["コスト削減"] || 0;
if (costCut >= 1.5) add("コスト意識の高い社訓がある", 5);
const fundsPts = state.mode === "black" ? [15, 8, -15] : [10, 5, -10];
if (state.funds >= 800) add(`資金 ${state.funds} 万円と runway に余裕がある`, fundsPts[0]);
else if (state.funds >= 500) add(`資金 ${state.funds} 万円を維持している`, fundsPts[1]);
else if (state.funds < 300) add(`資金が ${state.funds} 万円まで減っており、資金繰りが厳しい`, fundsPts[2]);
if (state.mode !== "black") {
if (avgFaith >= 55) add("社員の信仰度（結束）が高く、定着が見込める", 8);
else if (avgFaith < 45 && state.employees.length) add("社員の信仰度が低く、離職が懸念される", -8);
}
if (state.employees.length >= 6) add(`社員 ${state.employees.length} 人へ成長している`, 5);
if (state.reputation >= 55) add("対外的な評判が良い", 5);
else if (state.reputation < 40) add("対外的な評判が低い", -5);
if (state.risk >= 35) add("告発リスクの蓄積が大きく、コンプライアンスに懸念がある", -20);
else if (state.risk >= 20) add("告発リスクの蓄積が見える", -10);

let grade, amount, rate;
if (score >= 60) { grade = "合格（優遇条件）"; amount = 500; rate = 1.5;}
else if (score >= 40) { grade = "合格（通常条件）"; amount = 350; rate = 2.5;}
else { grade = "不合格"; amount = 0; rate = null;}

const next = structuredClone(state);
const lines = [`スコア ${score} ― ${grade}`];
lines.push(state.mode === "black" ? "※ ブラックモードの審査：数字重視（矛盾の減点は小さめ、社員の結束は見ない）" : "※ ホワイトモードの審査：数字と人の両方を見る");
for (const f of factors) lines.push(`${f.points >= 0? "＋": "－"} ${f.label}（${f.points >= 0? "+": ""}${f.points}）`);
if (amount > 0) {
next.funds = Math.round((next.funds + amount) * 10) / 10;
lines.push(`融資 ${amount} 万円（金利 ${rate}%）が実行され、資金は ${next.funds} 万円になりました。`);
} else {
lines.push("今回は融資が通りませんでした。台帳の矛盾を正し、実績を作ってから再挑戦です（本編では再審査あり）。");
}
next.loanDone = true;
next.loanResult = { score, grade, amount, rate, week: state.week};
return { state: next, lines, result: next.loanResult};
}

/* ================= 面談（退職相談） ================= */
export const CONCERNS = {
rest: {
label: "体力・休みの訴え",
keywords: ["休", "残業", "負担", "交代", "健康", "休日"],
tags: ["福利厚生"],
opening: "社長、少し話せますか。正直、体力が限界で……この働き方が続くなら、続けられそうにありません。",
},
conditions: {
label: "待遇の訴え",
keywords: ["給与", "給料", "待遇", "評価", "手当", "ボーナス", "昇給", "生活"],
tags: ["福利厚生", "理念浸透"],
opening: "社長、待遇のことで相談です。今の給料では将来が見えなくて、正直、不安なんです。",
},
future: {
label: "将来への不安",
keywords: ["将来", "成長", "キャリア", "挑戦", "役割", "期待", "目標"],
tags: ["挑戦奨励", "理念浸透"],
opening: "社長、自分の将来のことで悩んでいます。この会社で自分がどうなっていけるのか、見えなくて……。",
},
};

// 面談対象：最も危険な社員（疲労・不満・信仰度の悪化が最大の者）。対象外なら null。
export function pickInterviewTarget(state) {
let best = null;
let bestScore = -Infinity;
for (const e of state.employees) {
const danger = (100 - e.hp) + (100 - e.faith) * 0.5;
if (danger > bestScore) { bestScore = danger; best = e;}
}
if (!best) return null;
if (!(best.hp <= 40 || best.faith <= 30)) return null;
return best;
}

// 主訴の判定：いちばん強い不満の軸を選ぶ
export function detectConcern(emp) {
const restNeed = 100 - emp.hp;
const conditionsNeed = (100 - emp.faith) * 0.6;
const futureNeed = 100 - emp.faith + emp.ambition * 2;
if (restNeed >= conditionsNeed && restNeed >= futureNeed) return "rest";
if (conditionsNeed >= futureNeed) return "conditions";
return "future";
}

// 面談の判定：状態＋発言のキーワード＋台帳整合性（言行不一致の検出つき）
// tags はフェーズ調整済みの実効タグマップ
export function judgeInterview(state, empId, replyText, tags) {
const emp = state.employees.find((e) => e.id === empId);
if (!emp) return null;
const concernKey = detectConcern(emp);
const concern = CONCERNS[concernKey];
const text = replyText || "";
const factors = [];
let score = 0;
const add = (label, points) => { factors.push({ label, points}); score += points;};

if (concern.keywords.some((k) => text.includes(k))) {
add(`発言が本人の訴え（${concern.label}）に触れている`, 2);
} else {
add(`発言が本人の訴え（${concern.label}）に触れていない`, 0);
}
const tagEff = Math.max(...concern.tags.map((t) => tags[t] || 0));
if (tagEff >= 2.5) add(`台帳に裏付けがある（${concern.tags.join("・")} の社訓が強い）`, 3);
else if (tagEff >= 1) add("台帳にある程度の裏付けがある", 2);
else if (tagEff > 0) add("台帳の裏付けは弱い", 1);
else add("台帳に裏付けとなる社訓がない（口約束になる）", 0);

// 言行不一致：発言と台帳が食い違うと信用を落とす
if (/残業をなく|残業を減ら|休ませ|定時/.test(text) && (tags["労働強化"] || 0) >= 2) {
add("⚠ 言行不一致：休ませると言いながら、労働強化の社訓が強く残っている", -2);
}
if (/給料を上|昇給|手当を増|待遇を改善/.test(text) && (tags["コスト削減"] || 0) >= 2) {
add("⚠ 言行不一致：待遇改善を約束しながら、コスト削減の社訓が強く残っている", -2);
}
if (emp.faith >= 55) add("本人の信仰度が高く、踏みとどまりやすい", 1);

let outcome;
if (score >= 4) outcome = "stay";
else if (score >= 2) outcome = "watch";
else outcome = "quit";

const next = structuredClone(state);
const target = next.employees.find((e) => e.id === empId);
const lines = [`${emp.name}（${concern.label}）`];
for (const f of factors) lines.push(`${f.points > 0? "＋": f.points < 0? "－": "・"} ${f.label}${f.points? `（${f.points > 0? "+": ""}${f.points}）`: ""}`);
if (outcome === "stay") {
target.faith = Math.min(100, target.faith + 8);
target.hp = Math.min(100, target.hp + 5);
lines.push(`判定：退職を思いとどまりました（スコア ${score}）。信仰度+8、体力+5。`);
} else if (outcome === "watch") {
target.faith = Math.min(100, target.faith + 2);
lines.push(`判定：様子見です（スコア ${score}）。結論は出ませんでしたが、信仰度が少し戻りました。`);
} else {
next.employees = next.employees.filter((e) => e.id!== empId);
next.funds = Math.round((next.funds - TURNOVER_COST) * 10) / 10;
lines.push(`判定：退職が決まりました（スコア ${score}）。離職コスト ${TURNOVER_COST} 万円（年収の50%相当）が発生しました。`);
if (next.employees.length === 0) {
next.status = "empty";
lines.push("💸 社員が全員いなくなりました。会社は成り立ちません。");
} else if (next.funds < 0) {
next.status = "bankrupt";
lines.push("💸 資金が枯渇しました。会社は倒産です。");
}
}
next.interviewUsedWeek = state.week;
next.interview = null;
return { state: next, lines, outcome, score, concernKey};
}

// 社員の返答文のプロンプト（判定結果はコードで確定済み。LLMは台詞だけを書く）
export function buildInterviewPrompt(state, emp, concernKey, playerText, outcome) {
const concern = CONCERNS[concernKey];
const mood =
outcome === "stay"? "社長の言葉と会社の裏付けに納得し、退職を思いとどまる。感謝と、まだ残る小さな不安をにじませる":
outcome === "watch"? "結論を保留する。社長の言葉は届いたが、まだ信じ切れない":
"退職の決意は固い。静かに、しかし明確に別れを告げる";
return [
`あなたは会社経営ゲームの社員「${emp.name}」です。退職相談の面談で、社長への返答を1〜2文で書いてください。`,
`あなたの状態：体力 ${emp.hp}／会社への信仰度 ${emp.faith}。訴えは「${concern.label}」。`,
`社長の発言：「${playerText}」`,
`心境：${mood}。この心境から外れた結論を書かないこと。説明や前置きは不要、台詞だけを出力してください。`,
].join("\n");
}

export const INTERVIEW_FALLBACK_LINES = {
stay: "……分かりました。もう少し、ここで頑張ってみます。",
watch: "……今日は結論を出せません。もう少し考えさせてください。",
quit: "……すみません。決めました。辞めさせてください。",
};

// 最終評価：企業価値と最終スコア（モードで評価式が変わる）
export function evaluateRun(state) {
const n = state.employees.length;
const avgFaith = n ? state.employees.reduce((s2, e) => s2 + e.faith, 0) / n : 0;
const avgHp = n ? state.employees.reduce((s2, e) => s2 + e.hp, 0) / n : 0;
const value = Math.round(state.funds + n * 100 + state.reputation * 5);
const health = Math.round(((avgFaith + avgHp + (100 - state.risk)) / 3) * 10) / 10;
const score = state.mode === "black" ? value : Math.round(value * (0.7 + 0.3 * (health / 100)));
return { value, health, score };
}

// 結果ランク（試作スケールの暫定しきい値）
export const RANK_THRESHOLDS = [["S", 2400], ["A", 2000], ["B", 1600], ["C", 1200]];
export function rankOf(score) {
for (let i = 0; i < RANK_THRESHOLDS.length; i++) {
const [rank, min] = RANK_THRESHOLDS[i];
if (score >= min) {
const next = i > 0 ? { rank: RANK_THRESHOLDS[i - 1][0], gap: RANK_THRESHOLDS[i - 1][1] - score } : null;
return { rank, next };
}
}
return { rank: "D", next: { rank: "C", gap: 1200 - score } };
}

/* ================= 1 on 1（M10：面談を一本化） ================= */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const ONE_ON_ONE_MAX_TURNS = 5;

// 社員の「話を聞く余裕」の初期値。性格の基礎値に、その週の状態を反映する（非開示）。
export function oneOnOneInitialPoints(emp, character) {
  let p = character && character.patienceBase != null ? character.patienceBase : 50;
  p -= Math.max(0, 60 - emp.hp) * 0.4;
  p -= Math.max(0, 40 - emp.faith) * 0.3;
  p += Math.max(0, emp.faith - 50) * 0.2;
  return Math.round(Math.min(90, Math.max(15, p)));
}

// LLMが返すポイント変動を、キャラの振れ幅でクランプする（コード側の許可範囲）。
export function clampPointDelta(delta, character) {
  const swing = character && character.swing ? character.swing : 20;
  const d = Math.round(Number(delta) || 0);
  return Math.min(10, Math.max(-swing, d));
}

export const PRESSURE_WORDS = ["辞めて", "辞めれば", "辞職", "退職しなさい", "退職して", "クビ", "代わりはいくらでも", "代わりはいる", "必要ない人", "給料を下げ", "減給", "いらない人"];

export function hasPressure(playerTexts) {
  return (playerTexts || []).some((t) => PRESSURE_WORDS.some((w) => String(t).includes(w)));
}

// 1on1の終了判定（コードで確定）。session = { points, playerTexts }
export function judgeOneOnOne(state, empId, session) {
  const next = structuredClone(state);
  const emp = next.employees.find((e) => e.id === empId);
  if (!emp) return null;
  const lines = [];
  let outcome;
  if (session.points <= 0) {
    const pressured = hasPressure(session.playerTexts);
    outcome = pressured ? "pushout" : "burnout-quit";
    const cost = pressured ? 20 : 10;
    next.employees = next.employees.filter((e) => e.id !== empId);
    next.funds = Math.round((next.funds - cost) * 10) / 10;
    next.reputation = clamp(next.reputation - (pressured ? 8 : 3), 0, 100);
    for (const e of next.employees) e.faith = clamp(e.faith - (pressured ? 4 : 2), 0, 100);
    lines.push(pressured
      ? `1on1の結果、${emp.name} は退職を申し出ました。会社都合に近い辞め方で、評判が大きく下がり、残った社員の信仰度も下がりました（手続き費用 ${cost}万円）。`
      : `1on1の結果、${emp.name} は限界を迎えて退職しました。評判が下がり、残った社員の信仰度も少し下がりました（手続き費用 ${cost}万円）。`);
    if (!next.employees.length && next.status === "playing") { next.status = "empty"; lines.push("社員が全員いなくなりました。"); }
  } else if (session.points >= 65) {
    outcome = "motivated";
    emp.faith = clamp(emp.faith + 8, 0, 100);
    emp.hp = clamp(emp.hp + 3, 0, 100);
    lines.push(`1on1の結果、${emp.name} の意欲が大きく上がりました（信仰度+8、体力+3）。`);
  } else if (session.points >= 40) {
    outcome = "steady";
    emp.faith = clamp(emp.faith + 2, 0, 100);
    lines.push(`1on1の結果、${emp.name} との信頼が少し深まりました（信仰度+2）。`);
  } else if (session.points >= 15) {
    outcome = "worse";
    emp.faith = clamp(emp.faith - 4, 0, 100);
    lines.push(`1on1の結果、${emp.name} との溝は深まりました（信仰度−4）。`);
  } else {
    outcome = "much-worse";
    emp.faith = clamp(emp.faith - 8, 0, 100);
    next.risk = clamp(next.risk + 2, 0, 100);
    lines.push(`1on1の結果、${emp.name} は大きく失望しました（信仰度−8、告発リスク+2）。`);
  }
  return { state: next, lines, outcome };
}

// 社員の返答生成プロンプト（キャラ設定と裏設定はLLMにだけ渡す）。JSONのみ返させる。
export function buildOneOnOnePrompt(state, emp, character, history, playerText, recentLines = []) {
  const rules = (state.ledger || []).filter((r) => r.status === "active").map((r) => `・${r.text}`).join("\n") || "（社訓なし）";
  const hist = (history || []).map((h) => `${h.who === "me" ? "社長" : emp.name}：${h.text}`).join("\n");
  return [
    "あなたは会社経営ゲームの社員役です。社長との1on1面談で、社員として返答してください。出力はJSONのみ。",
    `【あなた】${emp.name}。${character.profile || ""}`,
    `【本音と地雷（社長には見えていない設定。演技の指針にだけ使う）】${character.hidden || ""}`,
    `【今の状態】体力${Math.round(emp.hp)}・信仰度${Math.round(emp.faith)}（各0〜100）`,
    emp.lastProfit != null ? `【先週の収支貢献】売上${Math.round(emp.lastSales)}万円＋コストダウン${Math.round(emp.lastSaving)}万円−コスト${Math.round(emp.lastCost)}万円＝${emp.lastProfit >= 0 ? "+" : ""}${Math.round(emp.lastProfit)}万円` : "",
    recentLines.length ? `【会社の直近の出来事】\n${recentLines.slice(-3).join("\n")}` : "",
    "【現在の社訓】",
    rules,
    "【これまでの会話】",
    hist || "（開始直後）",
    `【社長の発言】${playerText}`,
    "返答の作法：",
    "- reply：社員の返答を1〜2文。本音と地雷に沿って、嬉しさ・不満・失望が伝わる言い方で。数値やゲーム用語は口に出さない。",
    "- pointDelta：この発言で社員の「話を聞く余裕・信頼」がどう動いたか。地雷を踏めば大きくマイナス、効く言葉や具体的な配慮があればプラス。範囲は -25〜+10 の整数。",
    '出力形式：{"reply":"返答","pointDelta":-5}',
  ].join("\n");
}

export function parseOneOnOneReply(raw) {
  if (typeof raw !== "string") return null;
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
    const reply = String(obj.reply || "").trim();
    if (!reply) return null;
    return { reply: reply.slice(0, 300), pointDelta: Number(obj.pointDelta) || 0 };
  } catch { return null; }
}

export const ONE_ON_ONE_FALLBACKS = ["……はい、分かりました。", "そうですね…。", "ありがとうございます。少し考えさせてください。", "正直、まだ整理がついていなくて。", "……ええ。"];
