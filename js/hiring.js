// 採用（M14）：月1回、候補3人から1人までを社長が選んで採用する（自動採用は廃止）。
// 候補の顔ぶれは seed と月から決定的に作る（画面を開き直しても変わらない）。
// 候補の能力と経験区分は評判に引っ張られる：評判が高い会社ほど、良い人材が応募してくる。
import { CANDIDATE_CHARACTERS, getCharacter } from "./employees.js?v=20261102.27";
import { maxOf, phaseOf } from "./sim.js?v=20261102.27";

export const HIRE_NAME_POOL = [
  "冬木 玲", "夏目 湊", "秋山 栞", "春日 陽", "星野 律",
  "月島 凪", "雪代 紬", "雨宮 慧", "風間 樹", "水瀬 凛",
  "朝倉 葵", "夕霧 蓮", "東雲 梓", "深町 駿", "浅野 遥",
  "白鳥 紗", "高瀬 航", "瀬戸 泉", "広瀬 渉", "青柳 翠",
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// seed と月だけから決まる専用乱数（シムの乱数列を乱さない）
function candidateRng(seed, month) {
  let s = ((seed || 1) ^ Math.imul(month + 7, 2246822519)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rollTier(rng, reputation) {
  const vetP = reputation / 250;
  const r = rng();
  return r < vetP ? "ベテラン" : r < vetP + 0.4 ? "中堅" : "新人";
}

// 今月の候補3人を返す。state.candidates に月つきで保持し、同月内は同じ顔ぶれを返す。
export function ensureCandidates(state) {
  const month = state.month ?? state.week ?? 1;
  if (state.candidates && state.candidates.month === month && Array.isArray(state.candidates.list)) {
    return state.candidates.list;
  }
  const rng = candidateRng(state.seed || 1, month);
  const rep = state.reputation || 50;
  const hiredIds = new Set((state.employees || []).map((e) => e.id));
  const hiredNames = new Set((state.employees || []).map((e) => e.name));
  const list = [];
  // 固有候補（初期メンバー以外の3人）を優先的に並べる
  for (const c of CANDIDATE_CHARACTERS) {
    if (hiredIds.has(c.id) || list.length >= 3) continue;
    list.push({
      id: c.id, name: c.name, ability: c.ability, stamina: c.stamina, ambition: c.ambition, mental: c.mental,
      dept: c.dept, expTier: c.expTier, named: true,
      profile: getCharacter(c.id).profile || "",
    });
  }
  // 残りは名前プールから、評判に応じた能力で作る
  const pool = HIRE_NAME_POOL.filter((n) => !hiredNames.has(n) && !list.some((c) => c.name === n));
  while (list.length < 3 && pool.length) {
    const name = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    list.push({
      id: `cand-${month}-${list.length + 1}`,
      name,
      ability: Math.round(clamp(3 + rng() * 5 + (rep - 50) / 25, 1, 10)),
      stamina: 4 + Math.floor(rng() * 6),
      ambition: 3 + Math.floor(rng() * 7),
      mental: 4 + Math.floor(rng() * 6),
      dept: rng() < 0.65 ? "direct" : "indirect", // 人数比のデフォルトは直接部門が多め（M15）
      expTier: rollTier(rng, rep),
      named: false,
      profile: "",
    });
  }
  state.candidates = { month, list };
  return list;
}

// 候補を採用する（純粋関数的に state を複製して返す）。条件を満たさなければ hired: null。
export function hireCandidate(state, candId) {
  const month = state.month ?? state.week ?? 1;
  if (state.hireUsedMonth === month) return { state, hired: null, reason: "今月はすでに採用しています" };
  if ((state.employees || []).length >= maxOf(state)) return { state, hired: null, reason: `${phaseOf(state).name}は最大 ${maxOf(state)} 人までです` };
  const list = ensureCandidates(state);
  const cand = list.find((c) => c.id === candId);
  if (!cand) return { state, hired: null, reason: "候補が見つかりません" };
  const next = structuredClone(state);
  const hire = {
    id: cand.named ? cand.id : `emp-h${month}-${next.employees.length + 1}`,
    name: cand.name,
    ability: cand.ability,
    stamina: cand.stamina,
    ambition: cand.ambition,
    mental: cand.mental,
    hp: 95,
    faith: 55,
    dept: cand.dept,
    role: "member",
    expTier: cand.expTier,
    hiredMonth: month,
    lastSales: null, lastUplift: null, lastSaving: null, lastCost: null, lastProfit: null, lastSalary: null, lastOtherCost: null, lastContrib: null, lastBurden: null, lastSupport: null, lastRiskCut: null,
  };
  next.employees.push(hire);
  next.hireUsedMonth = month;
  next.candidates = { month, list: list.filter((c) => c.id !== candId) };
  return { state: next, hired: hire, reason: "" };
}
