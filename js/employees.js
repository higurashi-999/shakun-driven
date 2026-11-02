// 社員データ：初期社員5人（完全オリジナル、属性は固定）と、採用候補の名前プール。
// 属性は 能力／体力／忠誠／野心／メンタル（各1〜10）。状態は 疲労／不満／信仰度（各0〜100）。
export const INITIAL_EMPLOYEES = [
  { id: "emp-1", name: "高嶺 澪", ability: 8, stamina: 5, loyalty: 7, ambition: 6, mental: 6, fatigue: 15, dissatisfaction: 10, faith: 55 },
  { id: "emp-2", name: "砂川 蓮", ability: 6, stamina: 9, loyalty: 5, ambition: 4, mental: 8, fatigue: 10, dissatisfaction: 10, faith: 50 },
  { id: "emp-3", name: "桐生 葵", ability: 9, stamina: 4, loyalty: 4, ambition: 9, mental: 5, fatigue: 20, dissatisfaction: 15, faith: 45 },
  { id: "emp-4", name: "森永 千鶴", ability: 5, stamina: 6, loyalty: 9, ambition: 3, mental: 7, fatigue: 10, dissatisfaction: 5, faith: 60 },
  { id: "emp-5", name: "八雲 奏", ability: 7, stamina: 6, loyalty: 6, ambition: 7, mental: 4, fatigue: 15, dissatisfaction: 10, faith: 50 },
];

export function initialEmployees() {
  return INITIAL_EMPLOYEES.map((e) => ({ ...e }));
}
