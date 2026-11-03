// 社員データ：初期社員5人（完全オリジナル、属性は固定）。
// 個性は 能力／野心／メンタル（各1〜10、画面表示あり）と、体の強さ stamina（裏側のパラメータ、体力ゲージの減り方に効く）。
// 状態は 体力 hp（ゲージ式：仕事で減り休むと回復）／信仰度 faith の2軸（各0〜100）。旧・疲労は 100-hp、不満は信仰度へ吸収（M11）。
export const INITIAL_EMPLOYEES = [
  { id: "emp-1", name: "高嶺 澪", ability: 8, stamina: 5, ambition: 6, mental: 6, hp: 85, faith: 55, lastSales: null, lastSaving: null, lastCost: null, lastProfit: null },
  { id: "emp-2", name: "砂川 蓮", ability: 6, stamina: 9, ambition: 4, mental: 8, hp: 90, faith: 50, lastSales: null, lastSaving: null, lastCost: null, lastProfit: null },
  { id: "emp-3", name: "桐生 葵", ability: 9, stamina: 4, ambition: 9, mental: 5, hp: 80, faith: 45, lastSales: null, lastSaving: null, lastCost: null, lastProfit: null },
  { id: "emp-4", name: "森永 千鶴", ability: 5, stamina: 6, ambition: 3, mental: 7, hp: 90, faith: 60, lastSales: null, lastSaving: null, lastCost: null, lastProfit: null },
  { id: "emp-5", name: "八雲 奏", ability: 7, stamina: 6, ambition: 7, mental: 4, hp: 85, faith: 50, lastSales: null, lastSaving: null, lastCost: null, lastProfit: null },
];

export function initialEmployees() {
  return INITIAL_EMPLOYEES.map((e) => ({ ...e }));
}

// キャラ設定（M10）：公開プロフィールは社員カードや1on1の相手選びで見える。
// 裏設定（地雷・本音・効く言葉・忍耐の特性）はUIに開示せず、LLMの応答生成と判定にだけ使う。
export const CHARACTERS = {
  "emp-1": {
    profile: "元大手メーカー出身のエース格。仕事は速く正確で、プライドが高い。",
    hidden: "地雷：能力を疑う発言、雑務の一方的な押し付け。本音：待遇より「正当な評価と裁量」が欲しい。効く言葉：具体的な成果への言及、任せる姿勢。",
    patienceBase: 55, swing: 18,
    opening: "お時間ありがとうございます。率直に言って、今の評価制度には少し思うところがあります。",
    cutoff: "……もう結構です。話は終わりにしましょう。",
  },
  "emp-2": {
    profile: "現場のムードメーカー。体力自慢で、細かいことは気にしない楽天家。",
    hidden: "地雷：細かすぎる管理、陰口。本音：楽しく働きたい。空気の悪さが一番のストレス。効く言葉：感謝と軽い冗談。",
    patienceBase: 70, swing: 12,
    opening: "おっ、社長！なんすか、改まって。まあ座ってくださいよ。",
    cutoff: "あー、ちょっとこの話、疲れてきちゃいました。また今度で。",
  },
  "emp-3": {
    profile: "野心家の若手実力派。転職市場の動向にも詳しい。",
    hidden: "地雷：将来性の感じられない仕事、キャリアの話を避けること。本音：ここが踏み台でも構わないが、成長実感がないなら去る。効く言葉：挑戦的な仕事の提示、将来像の共有。",
    patienceBase: 45, swing: 20,
    opening: "忙しいところすみません。私の今後のキャリアについて、少しお話ししたくて。",
    cutoff: "分かりました。社長の考えは十分伝わりましたので。",
    },
  "emp-4": {
    profile: "古株の支え役。穏やかで面倒見がよく、安定志向。",
    hidden: "地雷：急な方針変更、若手との比較。本音：会社の変化についていけるか不安。効く言葉：安心感と「頼りにしている」の一言。",
    patienceBase: 65, swing: 14,
    opening: "あら、社長。私なんかでよろしいんですか？",
    cutoff: "すみません、少し気持ちが追いつかなくて……今日はここまでに。",
  },
  "emp-5": {
    profile: "繊細で感受性の強い集中タイプ。人前は苦手だが仕事は丁寧。",
    hidden: "地雷：大勢の前での叱責、曖昧な指示。本音：評価されたいけれど目立ちたくない。効く言葉：静かな場での具体的な承認。",
    patienceBase: 40, swing: 25,
    opening: "あの……呼び出していただいて、ありがとうございます。少し緊張しています。",
    cutoff: "……すみません、もう無理です。",
  },
};

export function getCharacter(id) {
  return CHARACTERS[id] || { profile: "", hidden: "", patienceBase: 50, swing: 15, opening: "お時間ありがとうございます。", cutoff: "今日はここまでにさせてください。" };
}
