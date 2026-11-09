// 月次シム：状態＋効果（5項目）コンテキスト → 次状態＋月報素材ログ（純粋関数・決定的）。
// 数値判定は全てコード。同じ状態＋同じシードでは必ず同じ結果になる（検証B）。
// M14：時間単位を週→月へ変更し、金額は月次スケール（旧週次の約4.3倍）に換算した。進行の速さ（ターン数）は不変。
// パラメータの根拠は SPEC.md 6.3（Gallup／厚労省／日本公庫など）を参照。
// ※このモジュールは他モジュールを import しない（node の単体テストで直接読み込むため）。

export const PARAMS = {
  salesPerAbility: 14, // 能力1あたりの月次売上（万円、直接部門のみ）
  faithSalesSlope: 0.004, // 信仰度の平均からの乖離1につき売上±0.4%（最大±20%：Gallupの傾斜）
  turnoverCost: 1000, // 離職コスト（万円）＝再採用・引継ぎ・教育を含む概算
  trialMonths: 6, // 旧試作（創業期のみ）の月数。旧セーブの結果表示用に残す
};

// 本編のフェーズ定義（M16）：期は「その期の累計売上」が目標に達した月に進む。
// months は標準月数（バランスの目安）、ideal は適正人数、max はその期に雇える上限、fixed は固定費（万円／月）。
export const PHASES = {
  1: { name: "創業期", months: 5, ideal: 3, max: 5, fixed: 60, salesTarget: 1700 },
  2: { name: "組織化期", months: 6, ideal: 8, max: 10, fixed: 160, salesTarget: 4000 },
  3: { name: "拡大期", months: 6, ideal: 12, max: 15, fixed: 320, salesTarget: 5800 },
  4: { name: "成熟期", months: 7, ideal: 16, max: 20, fixed: 520, salesTarget: 10500 },
};
export const TOTAL_MONTHS = 24; // 全体の上限（届かなければ到達度で終了）
export function phaseOf(state) { return PHASES[state.phase || 1] || PHASES[1]; }
export function fixedCostOf(state) { return phaseOf(state).fixed; }
export function idealOf(state) { return phaseOf(state).ideal; }
export function maxOf(state) { return phaseOf(state).max; }
// 人数から見たフェーズ（期は人数の帯でも決まる：売上目標の達成と人数の両方を見て進む）
export function phaseForCount(n) { return n <= 5 ? 1 : n <= 10 ? 2 : n <= 15 ? 3 : 4; }

// 人件費（M13→M14で月次化）：能力の5段階で決まる基本給＋経験区分の上乗せ＋勤続月数ぶんの昇給（上限あり）。
export const ABILITY_SALARY = { 1: 30, 2: 37, 3: 43, 4: 50, 5: 56 }; // 万円／月
export const EXP_SALARY = { "新人": 0, "中堅": 4, "ベテラン": 9 };
export function salaryOf(e, month) {
  const rank = Math.min(5, Math.max(1, Math.ceil((e.ability || 1) / 2)));
  const tenure = Math.max(0, (month || 1) - (e.hiredMonth ?? e.hiredWeek ?? 1));
  const raise = Math.min(9, tenure * 0.7);
  return Math.round((ABILITY_SALARY[rank] + (EXP_SALARY[e.expTier] ?? 0) + raise) * 10) / 10;
}

// 部門の集計（M14／M16で責任者枠を複数化）：direct＝売上を作る部門、indirect＝会社を回す部門
// 責任者枠（細分化）：部門の人数が6人以上になると2人まで（組織が育つとチームが分かれるイメージ）
export function managerSlots(deptCount) { return deptCount >= 6 ? 2 : 1; }
export function deptSummary(employees) {
  const direct = (employees || []).filter((e) => (e.dept || "direct") === "direct");
  const indirect = (employees || []).filter((e) => (e.dept || "direct") === "indirect");
  const managersOf = (list) => list.filter((e) => e.role === "manager").sort((a, b) => b.ability - a.ability);
  return {
    direct,
    indirect,
    directManagers: managersOf(direct),
    indirectManagers: managersOf(indirect),
    directManager: managersOf(direct)[0] || null,
    indirectManager: managersOf(indirect)[0] || null,
    directSlots: managerSlots(direct.length),
    indirectSlots: managerSlots(indirect.length),
  };
}

// フェーズで反転する効果の倍率（旧タグ時代の設計メモ。本編の効果調整用にデータだけ保持し、試作では未適用）
export const PHASE_TAG_MODIFIERS = {
  1: { "自由裁量": 1.0, "規律統制": 0.4 },
  2: { "自由裁量": 0.7, "規律統制": 0.7 },
  3: { "自由裁量": 0.3, "規律統制": 1.0 },
  4: { "自由裁量": 0.2, "規律統制": 1.2 },
};

// 決定的乱数（mulberry32）。状態は state.rngState に保持し、進んだ分だけ保存する。
function makeRng(seedState) {
  const box = { s: seedState >>> 0 };
  const next = () => {
    box.s = (box.s + 0x6d2b79f5) >>> 0;
    let t = box.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, box };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

function avg(list, key) {
  if (!list.length) return 0;
  return list.reduce((s, e) => s + e[key], 0) / list.length;
}

// ctx: { effects: aggregateEffectsの結果（5項目）, glossary: 造語数 }（M13：効果は5項目モデル。M12で矛盾は廃止）
export function simulateMonth(state, ctx) {
  if (state.status !== "playing") {
    return { state, log: ["すでに終了しています。"] };
  }
  const next = structuredClone(state);
  const rng = makeRng(next.rngState ?? next.seed ?? 1);
  const log = [];
  const month = next.month ?? next.week ?? 1;
  const fx = ctx.effects || {};
  const eff = (key) => fx[key] || 0;
  const pos = (v) => Math.max(0, v);
  const emps = next.employees;
  log.push(`― 第${month}月 ―`);

  /* 部門の状態：直接部門が売上を作り、間接部門がコストダウンとリスク抑制を担う（M14） */
  const dept = deptSummary(emps);
  const phaseDef = phaseOf(next);
  let deptSalesFactor = 1;
  if (dept.direct.length === 0) deptSalesFactor = 0;
  else if (dept.directManagers.length) {
    const ranks = dept.directManagers.map((m) => Math.ceil(m.ability / 2));
    deptSalesFactor = 1 + 0.03 * (ranks[0] || 0) + 0.02 * (ranks[1] || 0);
  }
  else deptSalesFactor = 0.85;
  const indirectSavingRaw = dept.indirect.reduce((s2, e) => s2 + e.ability * 2.0, 0);
  const fixedEffective = dept.indirect.length === 0 ? phaseDef.fixed * 1.2 : phaseDef.fixed;
  // 間接部門の押し上げ（M15）：能力1あたり+2.5%、責任者がいれば×1.2／不在なら×0.6、上限+40%。
  // 間接の責任者（能力5）1人で+15%前後になる水準。間接が空の月は、直接の売上に−15%のペナルティ。
  let supportRate = dept.indirect.reduce((s2, e) => s2 + e.ability * 0.025, 0);
  if (dept.indirect.length) supportRate *= dept.indirectManager ? 1.2 : 0.6;
  supportRate = Math.min(0.4, supportRate);
  const indirectAbilitySum = dept.indirect.reduce((s2, e) => s2 + e.ability, 0) || 1;

  /* 売上と費用（社員ごとに収支を出す：売上＋コストダウン−人件費−1人あたり固定費＝その人の月収支） */
  let companyFactor = 1;
  companyFactor *= 1 + 0.05 * eff("sales");
  companyFactor *= 1 + 0.01 * eff("discipline");
  const noise = 0.95 + rng.next() * 0.1;
  let challengeMult = 1;
  if (eff("sales") >= 2) {
    const roll = rng.next();
    if (roll < 0.3) { challengeMult = 1.15; log.push("攻めの姿勢が当たりました：新規の受注が売上を押し上げました。"); }
    else if (roll > 0.85) { challengeMult = 0.9; log.push("攻めの姿勢が裏目に出ました：今月は売上が伸び悩みました。"); }
  }
  const headCount = Math.max(1, emps.length);
  const extrasTotal = 4.8 * pos(eff("stamina")) + 3.5 * pos(eff("faith")) + 3.5 * pos(eff("rep"));
  const salaryTotal = emps.reduce((s2, e) => s2 + salaryOf(e, month), 0);
  const baseCost = salaryTotal + fixedEffective;
  const savingRaw = 10.4 * pos(eff("discipline")) + indirectSavingRaw;
  const savingTotal = Math.min(savingRaw, Math.max(0, baseCost + extrasTotal - baseCost * 0.4));
  const weightOf = (e) => e.ability + ((e.dept || "direct") === "indirect" ? 10 : 0);
  const weightSum = emps.reduce((s2, e) => s2 + weightOf(e), 0) || 1;
  let sales = 0;
  let cost = 0;
  let upliftTotal = 0;
  for (const e of emps) {
    const faithF = 1 + (e.faith - 50) * PARAMS.faithSalesSlope;
    const hpF = e.hp <= 10 ? 0.55 : e.hp <= 20 ? 0.75 : 1;
    const isDirect = (e.dept || "direct") === "direct";
    const baseSalesI = isDirect ? e.ability * PARAMS.salesPerAbility * companyFactor * faithF * hpF * noise * challengeMult * deptSalesFactor : 0;
    // 押し上げは直接の売上に織り込む（間接が空なら−15%）
    const salesI = isDirect ? baseSalesI * (dept.indirect.length ? 1 + supportRate : 0.85) : 0;
    const upliftI = isDirect ? baseSalesI * supportRate : 0;
    const savingI = savingTotal * (weightOf(e) / weightSum);
    const salaryI = salaryOf(e, month);
    const costI = salaryI + fixedEffective / headCount + extrasTotal / headCount;
    e.lastSales = round1(salesI);
    e.lastBoost = round1(upliftI); // 直接のみ：売上のうち間接の押し上げ分（併記用）
    e.lastUplift = 0; // 間接のみ：自分が押し上げた売上分（このあと配分する）
    e.lastSaving = isDirect ? 0 : round1(savingI); // M15：コストダウンの帰属は間接部門だけに付ける
    e.lastCost = round1(costI);
    e.lastSalary = salaryI; // 人件費の内訳表示用
    e.lastOtherCost = round1(costI - salaryI); // 1人あたり固定費（固定費＋追加費用の按分）
    e.lastProfit = round1(salesI + savingI - costI); // 間接は次のパスで付け替える
    upliftTotal += upliftI;
    sales += salesI;
    cost += costI - savingI;
  }
  // 間接部門の収支：売上を「直接部門貢献（押し上げ分）＋コストダウン」に置き換える（M15）
  for (const e of emps) {
    if ((e.dept || "direct") === "indirect") {
      e.lastUplift = round1(upliftTotal * (e.ability / indirectAbilitySum));
      e.lastProfit = round1(e.lastUplift + e.lastSaving - e.lastCost);
    } else {
      e.lastProfit = round1(e.lastSales - e.lastCost);
    }
  }
  sales = round1(sales);
  cost = round1(cost);
  const profit = round1(sales - cost);
  next.funds = round1(next.funds + profit);
  next.lastProfit = profit; // 資金の持ち表示用（判定には使わない）
  log.push(`売上 ${Math.round(sales)}万円／費用 ${Math.round(cost)}万円／収支 ${profit >= 0 ? "+" : ""}${Math.round(profit)}万円（資金 ${Math.round(next.funds)}万円）`);
  if (upliftTotal > 0) log.push(`🤝 間接部門のサポートで、売上が +${Math.round(upliftTotal)}万円押し上げられました（押し上げ率 +${Math.round(supportRate * 100)}%）。`);
  if (dept.direct.length === 0) log.push("🚨 直接部門に誰もいません。売上が発生しない、経営として致命的な状態です。至急、直接部門の人材を雇ってください。");
  if (dept.indirect.length === 0) log.push("🚨 間接部門に誰もいません。直接部門の売上が伸び悩み（−15%）、管理不在で固定費が膨らみ、リスクと評判にも傷がつきました。至急、間接部門の人材を雇ってください。");
  if (dept.direct.length > 0 && !dept.directManager) log.push("⚠ 直接部門に責任者がいません。売上が伸び悩みます。社員を責任者に任命してください。");
  if (dept.indirect.length > 0 && !dept.indirectManager) log.push("⚠ 間接部門に責任者がいません。管理の効きが弱まります。社員を責任者に任命してください。");
  if (emps.length >= 2) {
    const sorted = [...emps].sort((a, b) => b.lastProfit - a.lastProfit);
    const fmt = (v) => `${v >= 0 ? "+" : ""}${Math.round(v)}万円`;
    log.push(`今月の収支貢献：トップは ${sorted[0].name}（${fmt(sorted[0].lastProfit)}）、ワーストは ${sorted[sorted.length - 1].name}（${fmt(sorted[sorted.length - 1].lastProfit)}）`);
  }

  /* 社員の状態変化（体力ゲージと信仰度の2軸） */
  // 人数不足の負担：適正人数に足りない分だけ、体力の減りが重くなる（M13→M14：適正3人）
  const burden = emps.length > 0 && emps.length < phaseDef.ideal
    ? Math.min(1.8, phaseDef.ideal / emps.length)
    : 1;
  if (burden > 1.05 && emps.length > 0) {
    log.push(`⚠ 人数が適正（${phaseDef.ideal}人）に足りず、1人あたりの負担が増えています（現在 ${emps.length}人）。`);
  }
  for (const e of emps) {
    const staminaFactor = 1.25 - e.stamina * 0.05;
    // 体力：仕事で減り、体力向上の社訓と休息で回復する
    const hpDelta = -(6 * staminaFactor) * burden + 1.6 * eff("stamina") + 2 + (e.mental >= 7 ? 1 : 0);
    e.hp = clamp(round1(e.hp + hpDelta), 0, 100);
    // 急変（ほどほど）：体調不良と休養
    const tough = 1.3 - e.stamina * 0.05;
    if (rng.next() < 0.08 * tough) {
      const drop = 12 + rng.next() * 10;
      e.hp = clamp(round1(e.hp - drop), 0, 100);
      if (drop >= 15 || e.hp <= 25) log.push(`🤒 ${e.name} は体調を崩し、体力が大きく落ちました。`);
    } else if (e.hp <= 55 && rng.next() < 0.1) {
      const gain = 10 + rng.next() * 8;
      e.hp = clamp(round1(e.hp + gain), 0, 100);
      if (gain >= 14) log.push(`🌿 ${e.name} は休養が効いて、体力が回復しました。`);
    }
    // 信仰度：信仰向上の社訓で育ち、売上偏重で少しずつ蝕まれる
    let faithTarget =
      50 +
      5 * eff("faith") +
      Math.min(5, (ctx.glossary || 0) * 1) -
      1.1 * eff("sales");
    if (e.hp <= 15) faithTarget -= 10;
    else if (e.hp <= 30) faithTarget -= 6;
    const stepFactor = 0.8 + e.mental * 0.03;
    const step = clamp((faithTarget - e.faith) * stepFactor, -7, 7);
    e.faith = clamp(round1(e.faith + step), 0, 100);
    // 急変：理不尽な出来事（メンタルが衝撃を吸収する）
    if (rng.next() < 0.06) {
      const dropF = (8 + rng.next() * 6) * (1.2 - e.mental * 0.04);
      e.faith = clamp(round1(e.faith - dropF), 0, 100);
      if (next.mode !== "black") log.push(`💢 ${e.name} は理不尽な出来事に遭い、信仰度が下がりました。`);
    }
    // 野心家の転職思案：信仰が低いと、さらに冷めていく
    if (e.ambition >= 7 && e.faith <= 35 && rng.next() < 0.25) {
      e.faith = clamp(round1(e.faith - 5), 0, 100);
      if (next.mode !== "black") log.push(`🧳 ${e.name} は転職サイトを見ているようです。`);
    }
  }

  /* 評判 */
  let repDelta = 0.85 * eff("rep") + (50 - next.reputation) * 0.05 - Math.min(2, (ctx.glossary || 0) * 0.2);
  if (avg(emps, "faith") < 40) repDelta -= 1.5;
  if (dept.direct.length === 0) repDelta -= 3;
  if (dept.indirect.length === 0) repDelta -= 4;
  next.reputation = clamp(round1(next.reputation + repDelta), 0, 100);

  /* 告発リスク（蓄積型：売上偏重で増え、規律と間接部門で減衰する） */
  let riskDelta = 0.65 * eff("sales") - 1.05 * eff("discipline") - 1.0 * dept.indirect.length * (dept.indirectManager ? 1 : 0.5);
  next.risk = clamp(round1((next.risk + riskDelta) * 0.95), 0, 100);
  if (dept.indirect.length === 0) next.risk = clamp(round1(next.risk + 8), 0, 100);
  if (next.risk >= 20) {
    const p = Math.min(0.3, next.risk * 0.004);
    if (rng.next() < p) {
      next.reputation = clamp(round1(next.reputation - 6), 0, 100);
      next.funds = round1(next.funds - 215);
      next.risk = clamp(round1(next.risk * 0.5), 0, 100);
      log.push("⚠ 内部通報がありました：是正対応で215万円を支出し、評判が下がりました。");
    } else {
      if (next.mode !== "black") log.push(`⚠ 告発リスクが高まっています（蓄積 ${Math.round(next.risk)}）。規律強化の社訓で抑えられます。`); // ブラックでは非表示
    }
  }

  /* 離職判定（体力の底＝燃え尽き、信仰の崩壊） */
  const quitters = [];
  for (const e of emps) {
    let p = 0;
    if (e.hp <= 10) p = 0.3;
    else if (e.hp <= 20 && e.mental <= 4) p = 0.12;
    else if (e.faith <= 15) p = 0.2;
    else if (e.faith <= 25 && e.hp <= 30) p = 0.1;
    if (p > 0 && rng.next() < p) quitters.push(e);
  }
  for (const q of quitters) {
    next.employees = next.employees.filter((e) => e.id !== q.id);
    next.funds = round1(next.funds - PARAMS.turnoverCost);
    log.push(`💼 ${q.name} が退職しました（体力 ${Math.round(q.hp)}／信仰度 ${Math.round(q.faith)}）。離職コスト ${PARAMS.turnoverCost}万円。`);
  }

  /* 状態サマリと勝敗（採用はM14で社長の選択制に移行し、自動採用は廃止） */
  if (next.employees.length) {
    log.push(
      `社員 ${next.employees.length}人（直接 ${deptSummary(next.employees).direct.length}・間接 ${deptSummary(next.employees).indirect.length}）／平均信仰度 ${Math.round(avg(next.employees, "faith"))}／平均体力 ${Math.round(avg(next.employees, "hp"))}／評判 ${Math.round(next.reputation)}`
    );
  }
  next.rngState = rng.box.s;
  next.month = month + 1;
  delete next.week;
  next.candidates = null; // 月が替わったら候補は作り直す

  /* フェーズの進行（M16）：期の累計売上が目標に達した月に、次の期へ進む */
  next.phaseSales = round1((next.phaseSales || 0) + Math.max(0, sales));
  next.phaseMonth = (next.phaseMonth || 1);
  const salesDone = next.phaseSales >= phaseDef.salesTarget;
  log.push(`今期の売上：累計 ${Math.round(next.phaseSales)}万円／目標 ${phaseDef.salesTarget}万円（${phaseDef.name}）`);
  if (next.funds < 0) {
    next.status = "bankrupt";
    log.push("💸 資金が枯渇しました。会社は倒産です。");
  } else if (next.employees.length === 0) {
    next.status = "empty";
    log.push("💸 社員が全員いなくなりました。会社は成り立ちません。");
  } else if ((next.phase || 1) < 4 && salesDone) {
    next.phase = (next.phase || 1) + 1;
    next.phaseSales = 0;
    next.phaseMonth = 1;
    log.push(`🎉 ${PHASES[next.phase].name}へ進みました。新しい期の売上目標は ${PHASES[next.phase].salesTarget}万円です。`);
    if (!next.pendingMilestone) next.pendingMilestone = `phase${next.phase}-in`;
  } else if ((next.phase || 1) >= 4 && salesDone) {
    // 成熟期の目標達成：株主総会を経て上場審査へ
    if (!next.pendingMilestone) next.pendingMilestone = "shareholders";
    log.push("🎉 成熟期の売上目標を達成しました。株主総会を経て、上場審査に進みます。");
  } else {
    next.phaseMonth = (next.phaseMonth || 1) + 1;
    // 期の山場（期に入ってからの月数で固定発生）
    const ms = next.milestones || {};
    const due = [
      [(next.phase || 1) === 2 && next.phaseMonth === 2 && !ms.p2rules, "phase2-rules"],
      [(next.phase || 1) === 2 && next.phaseMonth === 4 && !ms.p2elders, "phase2-elders"],
      [(next.phase || 1) === 3 && next.phaseMonth === 2 && !ms.p3vc, "phase3-vc"],
      [(next.phase || 1) === 3 && next.phaseMonth === 4 && !ms.p3control, "phase3-control"],
      [(next.phase || 1) === 4 && next.phaseMonth === 2 && !ms.p4union, "phase4-union"],
    ].find(([ok]) => ok);
    if (due && !next.pendingMilestone) next.pendingMilestone = due[1];
    if (month >= TOTAL_MONTHS) {
      next.status = "ended";
      log.push(`⏰ ${TOTAL_MONTHS}か月が経過しました。上場には届きませんでしたが、会社の到達度で評価します。`);
    }
  }
  return { state: next, log };
}

// 結果画面用の総括
export function summarize(state) {
  const emps = state.employees || [];
  return {
    status: state.status,
    months: Math.min((state.month ?? state.week ?? 1) - 1, TOTAL_MONTHS),
    phase: state.phase || 1,
    phaseName: (PHASES[state.phase || 1] || PHASES[1]).name,
    phaseSales: Math.round(state.phaseSales || 0),
    phaseTarget: (PHASES[state.phase || 1] || PHASES[1]).salesTarget,
    funds: state.funds,
    employees: emps.length,
    avgFaith: emps.length ? round1(avg(emps, "faith")) : 0,
    avgHp: emps.length ? round1(avg(emps, "hp")) : 0,
    reputation: state.reputation,
    risk: state.risk,
    rules: (state.ledger || []).filter((r) => r.status === "active").length,
  };
}
