// ランダムイベント（創業期12種）：抽選・兆し・対応判定・効果適用。
// 判定は台帳のタグ（フェーズ調整済みの実効値）と布告文のキーワードで行うコード判定。
// 抽選は seed と週から決定的に引く（再現性を sim の乱数列と分離して保つ）。
export const EVENTS = [
{
id: "ev-client-bankrupt",
category: "市場・経済",
title: "取引先の倒産の噂",
body: "主要な取引先の経営が危ないという噂が業界紙を賑わせています。売掛金の回収に備えるかどうかが問われます。",
omen: "業界紙が「地場大手の資金繰り悪化」を小さく報じています。",
goodTags: ["コスト削減", "規律統制"],
badTags: ["顧客絶対"],
responseKeywords: ["売掛", "回収", "与信", "前金", "契約"],
success: { funds: 0, reputation: 2, fatigueAll: 0, faithAll: 0, risk: 0},
fail: { funds: -60, reputation: -2, fatigueAll: 0, faithAll: 0, risk: 0},
successText: "与信管理が効きました。倒産の影響を最小限に抑えられました。",
failText: "取引先が倒産し、売掛金60万円が回収不能になりました。",
},
{
id: "ev-cost-spike",
category: "市場・経済",
title: "仕入れ価格の高騰",
body: "原材料と仕入れ価格が一斉に上がりました。価格転嫁か、コスト削減か、判断が必要です。",
omen: "仕入れ先から「来月から値上げ」の案内が届き始めています。",
goodTags: ["コスト削減"],
badTags: [],
responseKeywords: ["値上げ", "転嫁", "代替", "削減", "交渉"],
success: { funds: 10, reputation: 0, fatigueAll: 0, faithAll: 0, risk: 0},
fail: { funds: -35, reputation: 0, fatigueAll: 2, faithAll: 0, risk: 0},
successText: "代替調達と経費の見直しで、高騰分をほぼ吸収しました。",
failText: "高騰分を吸収できず、35万円の追加コストが発生しました。",
},
{
id: "ev-big-client",
category: "取引先",
title: "大口クライアントの無茶な納期",
body: "大口の取引先が、通常の半分の納期で納品してほしいと言ってきました。受けるかどうかは会社の姿勢次第です。",
omen: null,
goodTags: ["顧客絶対", "挑戦奨励"],
badTags: ["規律統制"],
responseKeywords: ["受ける", "対応", "納期", "全力", "増員"],
success: { funds: 45, reputation: 6, fatigueAll: 6, faithAll: 2, risk: 0},
fail: { funds: 0, reputation: -5, fatigueAll: 0, faithAll: 0, risk: 0},
successText: "無茶な納期に応え切りました。売上45万円と大きな信頼を得ましたが、現場は疲弊しています。",
failText: "納期を断ったことで、取引先との関係が冷えました。",
},
{
id: "ev-late-payment",
category: "取引先",
title: "請求書の支払い遅延",
body: "取引先からの入金が遅れています。契約と請求の管理が問われます。",
omen: null,
goodTags: ["規律統制"],
badTags: ["自由裁量"],
responseKeywords: ["請求", "契約", "催促", "期限", "書面"],
success: { funds: 25, reputation: 1, fatigueAll: 0, faithAll: 0, risk: 0},
fail: { funds: -25, reputation: -1, fatigueAll: 0, faithAll: -2, risk: 0},
successText: "契約どおりの催促が効き、遅れていた25万円が入金されました。",
failText: "対応が後手に回り、資金繰りが25万円分苦しくなりました。",
},
{
id: "ev-poaching",
category: "人材市場",
title: "競合からの引き抜きの噂",
body: "競合他社がうちの社員に声をかけているという噂があります。引き留められるかどうかは、日頃の待遇と結束次第です。",
omen: "社員の一人が、昼休みに誰かと長電話をしていました。",
goodTags: ["福利厚生", "理念浸透"],
badTags: ["労働強化"],
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
body: "求人への応募が殺到しました。玉石混交の中から見極められるかは、選考の基準があるかどうかです。",
omen: null,
goodTags: ["規律統制"],
badTags: ["自由裁量"],
responseKeywords: ["選考", "基準", "面接", "書類", "適性"],
success: { funds: 15, reputation: 2, fatigueAll: 0, faithAll: 0, risk: 0},
fail: { funds: -15, reputation: 0, fatigueAll: 4, faithAll: 0, risk: 0},
successText: "選考基準が明確で、採用活動が効率よく回りました。",
failText: "選考が場当たり的になり、対応に追われて現場が疲弊しました。",
},
{
id: "ev-labor-inspection",
category: "法改正・規制",
title: "労働時間の取り締まり強化",
body: "労働基準監督署が労働時間の取り締まりを強化しているというニュースです。残業の多い会社ほど危うくなります。",
omen: "ニュースが「労基署、労働時間の取り締まり強化」と伝えています。",
goodTags: ["規律統制", "福利厚生"],
badTags: ["労働強化"],
responseKeywords: ["残業", "記録", "36協定", "上限", "是正"],
success: { funds: 0, reputation: 3, fatigueAll: 0, faithAll: 0, risk: -6},
fail: { funds: -30, reputation: -3, fatigueAll: 0, faithAll: 0, risk: 8},
successText: "労働時間の管理が評価され、リスクが下がりました。",
failText: "是正対応に追われ30万円の支出。告発リスクも高まりました。",
},
{
id: "ev-mail-leak",
category: "社内事故・不祥事",
title: "メールの誤送信",
body: "社員が顧客情報を含むメールを誤送信しかけました。手順と確認の文化があるかどうかが問われます。",
omen: null,
goodTags: ["規律統制"],
badTags: ["自由裁量"],
responseKeywords: ["確認", "手順", "ダブルチェック", "教育", "ルール"],
success: { funds: 0, reputation: 1, fatigueAll: 0, faithAll: 0, risk: -3},
fail: { funds: -20, reputation: -6, fatigueAll: 0, faithAll: 0, risk: 6},
successText: "送信前の確認手順が定着していたため、大事に至りませんでした。",
failText: "誤送信が外部に伝わり、謝罪と対応で20万円の支出、評判も下がりました。",
},
{
id: "ev-burnout",
category: "社内事故・不祥事",
title: "徹夜明けの社員が体調不良",
body: "忙しさが続いた社員が体調を崩しました。休ませる文化があるかどうかが問われます。",
omen: null,
goodTags: ["福利厚生"],
badTags: ["労働強化"],
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
body: "基幹システムが止まり、業務が半日止まりました。備えと現場の機転が問われます。",
omen: null,
goodTags: ["規律統制", "挑戦奨励"],
badTags: ["コスト削減"],
responseKeywords: ["バックアップ", "復旧", "手順", "代替", "連絡"],
success: { funds: -5, reputation: 0, fatigueAll: 2, faithAll: 0, risk: 0},
fail: { funds: -40, reputation: -4, fatigueAll: 5, faithAll: 0, risk: 0},
successText: "復旧手順と代替運用が機能し、被害は最小限でした。",
failText: "復旧が長引き、機会損失と対応で40万円の損害が出ました。",
},
{
id: "ev-sns-buzz",
category: "メディア・評判",
title: "SNSで社訓が話題に",
body: "うちの社訓がSNSで「カルトっぽいけど面白い」と賛否両論で拡散されています。理念が本物かどうかが見られています。",
omen: null,
goodTags: ["理念浸透"],
badTags: [],
responseKeywords: ["理念", "発信", "説明", "姿勢", "公開"],
success: { funds: 20, reputation: 7, fatigueAll: 0, faithAll: 4, risk: 0},
fail: { funds: 0, reputation: -6, fatigueAll: 0, faithAll: -3, risk: 2},
successText: "理念の本気度が伝わり、好意的な注目と問い合わせが増えました。",
failText: "「カルト的」という側面だけが広がり、評判を落としました。",
glossaryAmplify: true, // 造語が多いほど賛否の振れ幅が大きくなる
},
{
id: "ev-bank-concern",
category: "ステークホルダー",
title: "銀行担当者の懸念",
body: "取引銀行の担当者が、資金繰りの見通しについて説明を求めてきました。数字の管理が見られています。",
omen: "銀行から「来週、資金繰り表を見せてほしい」と連絡がありました。",
goodTags: ["規律統制", "コスト削減"],
badTags: ["自由裁量"],
responseKeywords: ["資金繰り", "計画", "数字", "説明", "実績"],
success: { funds: 50, reputation: 3, fatigueAll: 0, faithAll: 0, risk: 0},
fail: { funds: 0, reputation: -4, fatigueAll: 0, faithAll: 0, risk: 0},
successText: "数字の説明が評価され、つなぎ融資50万円が通りました。",
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
return list[Math.floor(r * list.length)].id;
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
// tags: フェーズ調整済みの実効タグ（{タグ名: 実効値} の単純マップ）
export function resolveEvent(state, event, action, tags, glossaryCount = 0) {
const next = structuredClone(state);
const lines = [`${event.title}`];
let grade;
let effects;
if (action.type === "ignore") {
grade = "静観";
effects = scaleEffects(event.fail, 0.7);
lines.push("対応せず静観しました。");
lines.push(event.failText);
} else {
let score = 0;
for (const t of event.goodTags) score += tags[t] || 0;
for (const t of event.badTags) score -= tags[t] || 0;
if (action.text && action.text.trim()) score += 0.5;
if (action.text && (event.responseKeywords || []).some((k) => action.text.includes(k))) score += 1.5;
if (score >= 2) grade = "成功";
else if (score >= 0.5) grade = "部分成功";
else grade = "失敗";
effects = grade === "成功"? {...event.success}: grade === "部分成功"? mixEffects(event.success, event.fail): {...event.fail};
lines.push(`対応の布告：${action.text || "（文面なし）"}`);
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
e.fatigue = clamp(e.fatigue + (effects.fatigueAll || 0), 0, 100);
e.faith = clamp(e.faith + (effects.faithAll || 0), 0, 100);
}
const summary = [];
if (effects.funds) summary.push(`資金${effects.funds > 0? "+": ""}${effects.funds}万円`);
if (effects.reputation) summary.push(`評判${effects.reputation > 0? "+": ""}${effects.reputation}`);
if (effects.fatigueAll) summary.push(`全員の疲労${effects.fatigueAll > 0? "+": ""}${effects.fatigueAll}`);
if (effects.faithAll) summary.push(`全員の信仰度${effects.faithAll > 0? "+": ""}${effects.faithAll}`);
if (effects.risk) summary.push(`告発リスク${effects.risk > 0? "+": ""}${effects.risk}`);
lines.push(`結果：${grade}${summary.length? `（${summary.join("、")}）`: ""}`);
if (next.funds < 0 && next.status === "playing") {
next.status = "bankrupt";
lines.push("💸 イベント対応の結果、資金が枯渇しました。会社は倒産です。");
}
return { state: next, lines, grade, effects};
}
