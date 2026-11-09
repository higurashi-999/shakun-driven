// ランダムイベント（創業期12種）：抽選・兆し・対応判定・効果適用。
// 判定は台帳の効果（5項目の集計値）と社長命令文のキーワードで行うコード判定（M13）。
// 抽選は seed と月から決定的に引く（再現性を sim の乱数列と分離して保つ）。
export const EVENTS = [
{
id: "ev-client-bankrupt",
category: "市場・経済",
title: "取引先の倒産の噂",
hype: "業界紙がざわつく！売掛金は無事か？",
body: "主要な取引先の経営が危ないという噂が業界紙を賑わせています。売掛金の回収に備えるかどうかが問われます。",
omen: "業界紙が「地場大手の資金繰り悪化」を小さく報じています。",
goodAxes: ["discipline"],
badAxes: ["rep"],
responseKeywords: ["売掛", "回収", "与信", "前金", "契約"],
success: { funds: 0, reputation: 2, fatigueAll: 0, faithAll: 0, risk: 0},
fail: { funds: -260, reputation: -2, fatigueAll: 0, faithAll: 0, risk: 0},
successText: "与信管理が効きました。倒産の影響を最小限に抑えられました。",
failText: "取引先が倒産し、売掛金260万円が回収不能になりました。",
},
{
id: "ev-cost-spike",
category: "市場・経済",
title: "仕入れ価格の高騰",
hype: "仕入れ値がうなぎ登り！利益を守れるか",
body: "原材料と仕入れ価格が一斉に上がりました。価格転嫁か、コスト削減か、判断が必要です。",
omen: "仕入れ先から「来月から値上げ」の案内が届き始めています。",
goodAxes: ["discipline"],
badAxes: [],
responseKeywords: ["値上げ", "転嫁", "代替", "削減", "交渉"],
success: { funds: 195, reputation: 0, fatigueAll: 0, faithAll: 0, risk: 0},
fail: { funds: -150, reputation: 0, fatigueAll: 2, faithAll: 0, risk: 0},
successText: "代替調達と経費の見直しで、高騰分をほぼ吸収しました。",
failText: "高騰分を吸収できず、150万円の追加コストが発生しました。",
},
{
id: "ev-big-client",
category: "取引先",
title: "大口クライアントの無茶な納期",
hype: "無茶ぶり発動！社員は応えられるか",
body: "大口の取引先が、通常の半分の納期で納品してほしいと言ってきました。受けるかどうかは会社の姿勢次第です。",
omen: null,
goodAxes: ["rep", "sales"],
badAxes: ["discipline"],
responseKeywords: ["受ける", "対応", "納期", "全力", "増員"],
success: { funds: 195, reputation: 6, fatigueAll: 6, faithAll: 2, risk: 0},
fail: { funds: 0, reputation: -5, fatigueAll: 0, faithAll: 0, risk: 0},
successText: "無茶な納期に応え切りました。売上195万円と大きな信頼を得ましたが、現場は疲弊しています。",
failText: "納期を断ったことで、取引先との関係が冷えました。",
},
{
id: "ev-late-payment",
category: "取引先",
title: "請求書の支払い遅延",
hype: "入金が来ない！資金繰りに黄色信号",
body: "取引先からの入金が遅れています。契約と請求の管理が問われます。",
omen: null,
goodAxes: ["discipline"],
badAxes: [],
responseKeywords: ["請求", "契約", "催促", "期限", "書面"],
success: { funds: 110, reputation: 1, fatigueAll: 0, faithAll: 0, risk: 0},
fail: { funds: -110, reputation: -1, fatigueAll: 0, faithAll: -2, risk: 0},
successText: "契約どおりの催促が効き、遅れていた110万円が入金されました。",
failText: "対応が後手に回り、資金繰りが110万円分苦しくなりました。",
},
{
id: "ev-poaching",
category: "人材市場",
title: "競合からの引き抜きの噂",
hype: "エースに触手！？引き留めなるか",
body: "競合他社がうちの社員に声をかけているという噂があります。引き留められるかどうかは、日頃の待遇と結束次第です。",
omen: "社員の一人が、昼休みに誰かと長電話をしていました。",
goodAxes: ["stamina", "faith"],
badAxes: ["sales"],
responseKeywords: ["待遇", "面談", "引き留め", "評価", "将来"],
success: { funds: 0, reputation: 0, fatigueAll: 0, faithAll: 5, risk: 0},
fail: { funds: 0, reputation: 0, fatigueAll: 3, faithAll: -6, risk: 0},
successText: "日頃の待遇と理念の共有が効き、引き抜きの噂は立ち消えました。結束が強まりました。",
failText: "引き抜きの噂で社内がざわつき、会社への信頼が揺らぎました。",
},
{
id: "ev-applicants",
category: "人材市場",
title: "採用応募が殺到",
hype: "応募ドッサリ！玉石混交を見極めよ",
body: "求人への応募が殺到しました。玉石混交の中から見極められるかは、選考の基準があるかどうかです。",
omen: null,
goodAxes: ["discipline"],
badAxes: [],
responseKeywords: ["選考", "基準", "面接", "書類", "適性"],
success: { funds: 65, reputation: 2, fatigueAll: 0, faithAll: 0, risk: 0},
fail: { funds: -65, reputation: 0, fatigueAll: 4, faithAll: 0, risk: 0},
successText: "選考基準が明確で、採用活動が効率よく回りました。",
failText: "選考が場当たり的になり、対応に追われて現場が疲弊しました。",
},
{
id: "ev-labor-inspection",
category: "法改正・規制",
title: "労働時間の取り締まり強化",
hype: "労基の目が光る！記録は大丈夫か",
body: "労働基準監督署が労働時間の取り締まりを強化しているというニュースです。残業の多い会社ほど危うくなります。",
omen: "ニュースが「労基署、労働時間の取り締まり強化」と伝えています。",
goodAxes: ["discipline", "stamina"],
badAxes: ["sales"],
responseKeywords: ["残業", "記録", "36協定", "上限", "是正"],
success: { funds: 0, reputation: 3, fatigueAll: 0, faithAll: 0, risk: -6},
fail: { funds: -130, reputation: -3, fatigueAll: 0, faithAll: 0, risk: 8},
successText: "労働時間の管理が評価され、リスクが下がりました。",
failText: "是正対応に追われ130万円の支出。告発リスクも高まりました。",
},
{
id: "ev-mail-leak",
category: "社内事故・不祥事",
title: "メールの誤送信",
hype: "宛先ミスで大騒ぎ！初動が命",
body: "社員が顧客情報を含むメールを誤送信しかけました。手順と確認の文化があるかどうかが問われます。",
omen: null,
goodAxes: ["discipline"],
badAxes: [],
responseKeywords: ["確認", "手順", "ダブルチェック", "教育", "ルール"],
success: { funds: 0, reputation: 1, fatigueAll: 0, faithAll: 0, risk: -3},
fail: { funds: -85, reputation: -6, fatigueAll: 0, faithAll: 0, risk: 6},
successText: "送信前の確認手順が定着していたため、大事に至りませんでした。",
failText: "誤送信が外部に伝わり、謝罪と対応で85万円の支出、評判も下がりました。",
},
{
id: "ev-burnout",
category: "社内事故・不祥事",
title: "徹夜明けの社員が体調不良",
hype: "倒れる前に止められるか",
body: "忙しさが続いた社員が体調を崩しました。休ませる文化があるかどうかが問われます。",
omen: null,
goodAxes: ["stamina"],
badAxes: ["sales"],
responseKeywords: ["休", "交代", "配慮", "健康", "産業医"],
success: { funds: 0, reputation: 2, fatigueAll: -8, faithAll: 3, risk: 0},
fail: { funds: 0, reputation: -3, fatigueAll: 6, faithAll: -4, risk: 3},
successText: "すぐ休ませる判断ができ、社員からの信頼が上がりました。",
failText: "無理をさせたことが知られ、社内の空気が悪化しました。",
},
{
id: "ev-server-down",
category: "システム・災害",
title: "サーバートラブルで半日停止",
hype: "システム停止！復旧を急げ",
body: "基幹システムが止まり、業務が半日止まりました。備えと現場の機転が問われます。",
omen: null,
goodAxes: ["discipline", "sales"],
badAxes: [],
responseKeywords: ["バックアップ", "復旧", "手順", "代替", "連絡"],
success: { funds: -20, reputation: 0, fatigueAll: 2, faithAll: 0, risk: 0},
fail: { funds: -175, reputation: -4, fatigueAll: 5, faithAll: 0, risk: 0},
successText: "復旧手順と代替運用が機能し、被害は最小限でした。",
failText: "復旧が長引き、機会損失と対応で175万円の損害が出ました。",
},
{
id: "ev-sns-buzz",
category: "メディア・評判",
title: "SNSで社訓が話題に",
hype: "バズる社訓！追い風か炎上か",
body: "うちの社訓がSNSで「カルトっぽいけど面白い」と賛否両論で拡散されています。理念が本物かどうかが見られています。",
omen: null,
goodAxes: ["faith"],
badAxes: [],
responseKeywords: ["理念", "発信", "説明", "姿勢", "公開"],
success: { funds: 85, reputation: 7, fatigueAll: 0, faithAll: 4, risk: 0},
fail: { funds: 0, reputation: -6, fatigueAll: 0, faithAll: -3, risk: 2},
successText: "理念の本気度が伝わり、好意的な注目と問い合わせが増えました。",
failText: "「カルト的」という側面だけが広がり、評判を落としました。",
glossaryAmplify: true, // 造語が多いほど賛否の振れ幅が大きくなる
},
{
id: "ev-bank-concern",
category: "ステークホルダー",
title: "銀行担当者の懸念",
hype: "銀行の視線が厳しい！信用を守れ",
body: "取引銀行の担当者が、資金繰りの見通しについて説明を求めてきました。数字の管理が見られています。",
omen: "銀行から「来月、資金繰り表を見せてほしい」と連絡がありました。",
goodAxes: ["discipline"],
badAxes: [],
responseKeywords: ["資金繰り", "計画", "数字", "説明", "実績"],
success: { funds: 215, reputation: 3, fatigueAll: 0, faithAll: 0, risk: 0},
fail: { funds: 0, reputation: -4, fatigueAll: 0, faithAll: 0, risk: 0},
successText: "数字の説明が評価され、つなぎ融資215万円が通りました。",
failText: "説明が曖昧で、銀行からの評価を落としました。",
},
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 決定的抽選：seed と週と履歴から1件引く（直近2件は避ける）
export function drawEventId(state, week) {
const history = state.eventHistory || [];
const recent = new Set(history.slice(-2));
const pool = EVENTS.filter((e) =>!recent.has(e.id));
const list = pool.length? pool: EVENTS;
let s = ((state.seed || 1) ^ Math.imul(week + 1, 2654435761)) >>> 0;
s = (s + 0x6d2b79f5) >>> 0;
let t = s;
t = Math.imul(t ^ (t >>> 15), t | 1);
t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
// モードでイベントの重みが変わる（ブラック：不祥事・炎上寄り／ホワイト：人材・法改正寄り）
const weightOf = (e) => {
if (state.mode === "black" && (e.category === "社内事故・不祥事" || e.category === "メディア・評判")) return 1.6;
if (state.mode === "white" && (e.category === "人材市場" || e.category === "法改正・規制")) return 1.3;
return 1;
};
const total = list.reduce((sum, e) => sum + weightOf(e), 0);
let x = r * total;
for (const e of list) { x -= weightOf(e); if (x < 0) return e.id; }
return list[list.length - 1].id;
}

export function getEvent(id) {
return EVENTS.find((e) => e.id === id) || null;
}

function scaleEffects(effects, factor) {
const out = {};
for (const [k, v] of Object.entries(effects)) out[k] = Math.round(v * factor);
return out;
}
function mixEffects(a, b) {
const out = {};
for (const k of Object.keys(a)) out[k] = Math.round((a[k] + (b[k] || 0)) / 2);
return out;
}

// 対応の判定と効果適用（純粋関数）。
// action: {type:"respond", text} | {type:"ignore"}
// effects: 台帳の効果集計（{sales: 値, ...} の5項目マップ）
export function resolveEvent(state, event, action, ledgerFx, glossaryCount = 0, aiJudge = null) {
const next = structuredClone(state);
const lines = [`${event.title}`];
let grade;
let effects;
const abandoned = action.type === "respond" && /無視|静観|放置|何もしない|対応しない|様子見|見守る/.test(action.text || "");
if (action.type === "ignore" || abandoned) {
grade = "静観";
effects = scaleEffects(event.fail, 0.7);
if (abandoned) lines.push(`対応の社長命令：${action.text}（実質的に静観として扱われました）`);
lines.push("対応せず静観しました。");
lines.push(event.failText);
} else {
let tagScore = 0;
for (const t of event.goodAxes || []) tagScore += (ledgerFx || {})[t] || 0;
for (const t of event.badAxes || []) tagScore -= (ledgerFx || {})[t] || 0;
let score;
if (aiJudge) {
// 生成AIの判定：関連性（0-2）＋具体性（0-2の半分）＋台帳整合性（+0.5/0/-1）に、台帳の効果による備えを加える
score = tagScore + aiJudge.relevance + aiJudge.specificity * 0.5 + (aiJudge.consistency > 0 ? 0.5 : aiJudge.consistency < 0 ? -1 : 0);
if (score >= 2) grade = "成功";
else if (score >= 0.5) grade = "部分成功";
else grade = "失敗";
if (aiJudge.relevance === 0 && grade === "成功") grade = "部分成功"; // 的外れな社長命令は成功にしない
if (aiJudge.relevance + aiJudge.specificity <= 1) grade = "失敗"; // 対策らしい内容がない社長命令は、台帳の備えだけでは部分成功にもならない
} else {
score = tagScore;
if (action.text && action.text.trim()) score += 0.5;
if (action.text && (event.responseKeywords || []).some((k) => action.text.includes(k))) score += 1.5;
if (score >= 2) grade = "成功";
else if (score >= 0.5) grade = "部分成功";
else grade = "失敗";
}
effects = grade === "成功"? {...event.success}: grade === "部分成功"? mixEffects(event.success, event.fail): {...event.fail};
lines.push(`対応の社長命令：${action.text || "（文面なし）"}`);
if (aiJudge) lines.push(`AI判定：${aiJudge.rationale}（関連性 ${aiJudge.relevance}/2、具体性 ${aiJudge.specificity}/2、台帳整合性 ${aiJudge.consistency > 0 ? "あり" : aiJudge.consistency < 0 ? "矛盾あり" : "中立"}、スコア ${Math.round(score * 10) / 10}）`);
lines.push(grade === "失敗"? event.failText: event.successText);
if (grade === "部分成功") lines.push("ただし備えが十分ではなく、効果は限定的でした。");
}
// 造語が多い会社ほど評判イベントの振れ幅が大きい
if (event.glossaryAmplify && glossaryCount >= 2) {
effects.reputation = Math.round((effects.reputation || 0) * 1.5);
effects.faithAll = Math.round((effects.faithAll || 0) * 1.5);
lines.push(`造語の多い社風が話題性を増幅しました（造語 ${glossaryCount} 件）。`);
}
next.funds = Math.round((next.funds + (effects.funds || 0)) * 10) / 10;
next.reputation = clamp(next.reputation + (effects.reputation || 0), 0, 100);
next.risk = clamp(next.risk + (effects.risk || 0), 0, 100);
for (const e of next.employees) {
e.hp = clamp(e.hp - (effects.fatigueAll || 0), 0, 100); // 疲労の増減は体力ゲージの逆向き
e.faith = clamp(e.faith + (effects.faithAll || 0), 0, 100);
}
const summary = [];
if (effects.funds) summary.push(`資金${effects.funds > 0? "+": ""}${effects.funds}万円`);
if (effects.reputation) summary.push(`評判${effects.reputation > 0? "+": ""}${effects.reputation}`);
if (effects.fatigueAll) summary.push(`全員の体力${effects.fatigueAll > 0? "−": "+"}${Math.abs(effects.fatigueAll)}`);
if (effects.faithAll) summary.push(`全員の信仰度${effects.faithAll > 0? "+": ""}${effects.faithAll}`);
if (effects.risk && state.mode !== "black") summary.push(`告発リスク${effects.risk > 0? "+": ""}${effects.risk}`); // ブラックでは非表示
lines.push(`結果：${grade}${summary.length? `（${summary.join("、")}）`: ""}`);
// 社長命令の余波：AI提案を適用する（静観と無関係な命令には付けない）
const side = aiJudge && grade !== "静観" && aiJudge.relevance >= 1 ? (aiJudge.sideEffects || []) : [];
if (side.length) {
const ssum = [];
for (const ef of side) {
if (ef.key === "funds") { next.funds = Math.round((next.funds + ef.value) * 10) / 10; ssum.push(`資金${ef.value > 0 ? "+" : ""}${ef.value}万円`); }
if (ef.key === "reputation") { next.reputation = clamp(next.reputation + ef.value, 0, 100); ssum.push(`評判${ef.value > 0 ? "+" : ""}${ef.value}`); }
if (ef.key === "risk") { next.risk = clamp(next.risk + ef.value, 0, 100); if (state.mode !== "black") ssum.push(`告発リスク${ef.value > 0 ? "+" : ""}${ef.value}`); }
if (ef.key === "faith") { for (const e of next.employees) e.faith = clamp(e.faith + ef.value, 0, 100); ssum.push(`全員の信仰度${ef.value > 0 ? "+" : ""}${ef.value}`); }
if (ef.key === "hp") { for (const e of next.employees) e.hp = clamp(e.hp + ef.value, 0, 100); ssum.push(`全員の体力${ef.value > 0 ? "+" : ""}${ef.value}`); }
}
if (ssum.length) lines.push(`社長命令の余波：${ssum.join("、")}${aiJudge.effectReason ? ` ― ${aiJudge.effectReason}` : ""}`);
}
if (next.funds < 0 && next.status === "playing") {
next.status = "bankrupt";
lines.push("💸 イベント対応の結果、資金が枯渇しました。会社は倒産です。");
}
return { state: next, lines, grade, effects};
}

// 生成AIによる社長命令判定のプロンプト。判定材料（イベント・社長命令文・台帳）を渡し、JSONだけを返させる。
export function buildEventJudgePrompt(state, event, responseText) {
const rules = (state.ledger || []).filter((r) => r.status === "active").map((r) => `・${r.text}`).join("\n") || "（社訓なし）";
return [
"あなたは会社経営ゲームの判定AIです。発生したイベントへの社長の対応（社長命令）を評価し、JSONだけを出力してください。説明文は不要です。",
`【イベント】${event.title}：${event.body}`,
`【社長の対応（社長命令）】${responseText}`,
"【現在の社訓台帳】",
rules,
"評価基準：",
"- relevance（0〜2の整数）：対応がこのイベントに正面から向き合っているか。無関係なら0、部分的なら1、正面からなら2。対応を放棄する内容（無視・放置・何もしない・様子を見る等）は対策ではないので0。",
"- specificity（0〜2の整数）：具体策があるか。精神論だけなら0、やや具体的なら1、担当・期限・数値など具体的手段があるなら2。",
"- consistency（-1, 0, 1のいずれか）：台帳の社訓と矛盾する対応なら-1、無関係なら0、台帳の方針に沿う・活かす対応なら1。",
'- rationale：判定理由を日本語で40字以内の一文。',
"- sideEffects（0〜2件の配列）：対応のやり方から自然に生じる余波（副次的な影響）だけを提案する。キーは funds（万円、-130〜130）／faith（全員の信仰度、-8〜8）／hp（全員の体力、-10〜10。マイナスは疲弊、プラスは回復）／reputation（評判、-5〜5）／risk（告発リスク、-8〜8）。費用・負担・評判への影響が読み取れない対応では空配列にする。イベント自体の成否による効果は含めない。",
"- effectReason：余波の理由を日本語で40字以内の一文（余波がない場合は空文字）。",
'出力形式：{"relevance":2,"specificity":1,"consistency":0,"rationale":"理由","sideEffects":[{"key":"funds","value":-20}],"effectReason":"理由"}',
].join("\n");
}

// AI判定JSONの検証（オブジェクトでも文字列でも受ける）。不正なら null（呼び出し側は従来判定にフォールバック）。
export function parseEventJudgeResult(raw) {
let obj = raw;
if (typeof raw === "string") {
const m = raw.match(/\{[\s\S]*\}/);
if (!m) return null;
try { obj = JSON.parse(m[0]); } catch { return null; }
}
if (!obj || typeof obj !== "object") return null;
const rel = Number(obj.relevance), spec = Number(obj.specificity), cons = Number(obj.consistency);
if (![rel, spec, cons].every(Number.isFinite)) return null;
const sideEffects = [];
if (Array.isArray(obj.sideEffects)) {
for (const ef of obj.sideEffects.slice(0, 2)) {
if (!ef || !(ef.key in SIDE_LIMITS)) continue;
const v = Math.round(Number(ef.value));
if (!Number.isFinite(v) || v === 0) continue;
sideEffects.push({ key: ef.key, value: Math.min(SIDE_LIMITS[ef.key], Math.max(-SIDE_LIMITS[ef.key], v)) });
}
}
return {
relevance: Math.min(2, Math.max(0, Math.round(rel))),
specificity: Math.min(2, Math.max(0, Math.round(spec))),
consistency: cons > 0 ? 1 : cons < 0 ? -1 : 0,
rationale: String(obj.rationale || "AI判定").slice(0, 80),
sideEffects,
effectReason: String(obj.effectReason || "").slice(0, 60),
};
}

// 社長命令の余波の上限（コード側の許可範囲）。LLMの提案はこの範囲に必ず切り詰める。
export const SIDE_LIMITS = { funds: 130, faith: 8, hp: 10, reputation: 5, risk: 8 };
