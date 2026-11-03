// 週次シム：状態＋タグ集計コンテキスト → 次状態＋週報素材ログ（純粋関数・決定的）。
// 数値判定は全てコード。同じ状態＋同じシードでは必ず同じ結果になる（検証B）。
// パラメータの根拠は SPEC.md 6.3（Gallup／厚労省／日本公庫など）を参照。
// ※このモジュールは他モジュールを import しない（node の単体テストで直接読み込むため）。

// 採用候補の名前プール（採用時に既存社員と重複しないものを選ぶ）
export const HIRE_NAME_POOL = [
  "冬木 玲", "夏目 湊", "秋山 栞", "春日 陽", "星野 律",
  "月島 凪", "雪代 紬", "雨宮 慧", "風間 樹", "水瀬 凛",
];

export const PARAMS = {
  salaryPerWeek: 9, // 週あたり人件費（万円）≒月給39万円
  fixedCost: 35, // 家賃・開発・雑費（万円／週）
  salesPerAbility: 2.2, // 能力1あたりの週次売上（万円）
  faithSalesSlope: 0.004, // 信仰度の平均からの乖離1につき売上±0.4%（最大±20%：Gallupの傾斜）
  turnoverCost: 234, // 離職コスト（万円）＝年収468万円の50%（Gallup推計）
  trialWeeks: 6, // 試作（創業期）の週数
  maxEmployeesFounding: 9, // 創業期の上限（10人から組織化期）
};

// フェーズで反転するタグ効果の倍率（データとして保持。試作では創業期=1のみ適用）
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

// ctx: { tags: aggregateTagsの結果, contradictions: 矛盾ペア数, glossary: 造語数 }
export function simulateWeek(state, ctx) {
  if (state.status !== "playing") {
    return { state, log: ["すでに終了しています。"] };
  }
  const next = structuredClone(state);
  const rng = makeRng(next.rngState ?? next.seed ?? 1);
  const log = [];
  const week = next.week;
  const tags = ctx.tags || {};
  const eff = (tag) => {
    const base = tags[tag]?.effective ?? 0;
    const mod = (PHASE_TAG_MODIFIERS[next.phase] || {})[tag] ?? 1;
    return base * mod;
  };
  const emps = next.employees;
  log.push(`― 第${week}週 ―`);

  /* 売上 */
  const avgFaith = avg(emps, "faith");
  const faithFactor = 1 + (avgFaith - 50) * PARAMS.faithSalesSlope;
  let salesFactor = faithFactor;
  salesFactor *= 1 + 0.05 * eff("労働強化");
  salesFactor *= 1 + 0.045 * eff("顧客絶対");
  salesFactor *= 1 + 0.05 * eff("自由裁量");
  salesFactor *= 1 + 0.01 * eff("規律統制");
  salesFactor *= 1 + 0.008 * eff("理念浸透");
  salesFactor *= 1 + 0.02 * eff("挑戦奨励");
  const baseSales = emps.reduce((s, e) => s + e.ability * PARAMS.salesPerAbility, 0);
  let sales = baseSales * salesFactor * (0.95 + rng.next() * 0.1);
  // 挑戦奨励の振れ：当たればボーナス、外せば反動
  if (eff("挑戦奨励") > 0) {
    const roll = rng.next();
    if (roll < 0.3) {
      sales *= 1.15;
      log.push("挑戦が当たりました：新規の受注が売上を押し上げました。");
    } else if (roll > 0.85) {
      sales *= 0.9;
      log.push("挑戦が外れました：今週は売上が伸び悩みました。");
    }
  }
  sales = round1(sales);

  /* 費用 */
  const baseCost = PARAMS.salaryPerWeek * emps.length + PARAMS.fixedCost;
  let cost = baseCost + 3 * eff("福利厚生") + 2 * eff("顧客絶対") - 5 * eff("コスト削減");
  cost = Math.max(cost, baseCost * 0.4);
  cost = round1(cost);

  const profit = round1(sales - cost);
  next.funds = round1(next.funds + profit);
  next.lastProfit = profit; // M6：runway表示用（判定には使わない）
  log.push(`売上 ${Math.round(sales)}万円／費用 ${Math.round(cost)}万円／収支 ${profit >= 0 ? "+" : ""}${Math.round(profit)}万円（資金 ${Math.round(next.funds)}万円）`);

  /* 社員の状態変化 */
  const contradictionPenalty = (ctx.contradictions || 0) * 6;
  for (const e of emps) {
    const staminaFactor = 1.25 - e.stamina * 0.05;
    let fatigueDelta = 6 * staminaFactor + 1.2 * eff("労働強化") * staminaFactor - 4 * eff("福利厚生") - 2;
    e.fatigue = clamp(round1(e.fatigue + fatigueDelta), 0, 100);

    let dissDelta =
      (e.fatigue - 45) * 0.08 + 1.2 * eff("労働強化") + 1.5 * eff("コスト削減") - 3 * eff("福利厚生") - 0.5 * eff("自由裁量");
    if (dissDelta > 0) dissDelta *= 1.25 - e.mental * 0.05;
    e.dissatisfaction = clamp(round1(e.dissatisfaction + dissDelta), 0, 100);

    let faithTarget =
      50 +
      6 * eff("理念浸透") +
      Math.min(5, (ctx.glossary || 0) * 1) +
      2 * eff("福利厚生") -
      contradictionPenalty -
      1.5 * eff("コスト削減") +
      (e.ambition >= 7 ? 3 : 1) * eff("挑戦奨励");
    const loyaltyFactor = 0.7 + e.loyalty * 0.05;
    const step = clamp((faithTarget - e.faith) * loyaltyFactor, -6, 6);
    e.faith = clamp(round1(e.faith + step), 0, 100);
  }

  /* 評判 */
  let repDelta = 1.2 * eff("顧客絶対") + (50 - next.reputation) * 0.05 - Math.min(2, (ctx.glossary || 0) * 0.2);
  if (avg(emps, "dissatisfaction") > 60) repDelta -= 1.5;
  next.reputation = clamp(round1(next.reputation + repDelta), 0, 100);

  /* 告発リスク（蓄積型：違反の強度×週で増え、是正・時間で減衰） */
  let riskDelta = 1.2 * eff("労働強化") + 1.5 * (ctx.contradictions || 0) - 0.6 * eff("規律統制");
  next.risk = clamp(round1((next.risk + riskDelta) * 0.95), 0, 100);
  if (next.risk >= 20) {
    const p = Math.min(0.3, next.risk * 0.004);
    if (rng.next() < p) {
      next.reputation = clamp(round1(next.reputation - 6), 0, 100);
      next.funds = round1(next.funds - 50);
      next.risk = clamp(round1(next.risk * 0.5), 0, 100);
      log.push("⚠ 内部通報がありました：是正対応で50万円を支出し、評判が下がりました。");
    } else {
      if (next.mode !== "black") log.push(`⚠ 告発リスクが高まっています（蓄積 ${Math.round(next.risk)}）。社訓の改訂で是正できます。`); // ブラックでは非表示
    }
  }

  /* 離職判定（疲労・不満が高い社員から。離職コストは年収の50%：Gallup推計） */
  const quitters = [];
  for (const e of emps) {
    let p = 0;
    if (e.fatigue >= 85 || e.dissatisfaction >= 80) p = 0.25 + Math.max(e.fatigue - 85, e.dissatisfaction - 80) * 0.01;
    else if (e.dissatisfaction >= 65) p = 0.05; // 小規模事業所ほど高いベース離職圧（厚労省統計の水準感）
    if (p > 0 && rng.next() < p) quitters.push(e);
  }
  for (const q of quitters) {
    next.employees = next.employees.filter((e) => e.id !== q.id);
    next.funds = round1(next.funds - PARAMS.turnoverCost);
    log.push(`💼 ${q.name} が退職しました（疲労 ${Math.round(q.fatigue)}／不満 ${Math.round(q.dissatisfaction)}）。離職コスト ${PARAMS.turnoverCost}万円（年収の50%相当）。`);
  }

  /* 採用（余裕があり、雰囲気が良ければ紹介採用が進む） */
  if (
    next.employees.length > 0 &&
    next.employees.length < PARAMS.maxEmployeesFounding &&
    next.funds >= 500 &&
    avg(next.employees, "faith") >= 52 &&
    avg(next.employees, "fatigue") < 60 &&
    week >= 2
  ) {
    const used = new Set(next.employees.map((e) => e.name));
    const candidates = HIRE_NAME_POOL.filter((n) => !used.has(n));
    if (candidates.length) {
      const name = candidates[Math.floor(rng.next() * candidates.length)];
      const hire = {
        id: `emp-h${week}-${next.employees.length + 1}`,
        name,
        ability: 4 + Math.floor(rng.next() * 5),
        stamina: 4 + Math.floor(rng.next() * 6),
        loyalty: 4 + Math.floor(rng.next() * 6),
        ambition: 3 + Math.floor(rng.next() * 7),
        mental: 4 + Math.floor(rng.next() * 6),
        fatigue: 5,
        dissatisfaction: 5,
        faith: 55,
      };
      next.employees.push(hire);
      log.push(`🤝 ${name} が入社しました（紹介採用）。`);
    }
  }

  /* 状態サマリと勝敗 */
  if (next.employees.length) {
    log.push(
      `社員 ${next.employees.length}人／平均信仰度 ${Math.round(avg(next.employees, "faith"))}／平均疲労 ${Math.round(avg(next.employees, "fatigue"))}／評判 ${Math.round(next.reputation)}`
    );
  }
  next.rngState = rng.box.s;
  next.week = week + 1;
  if (next.funds < 0) {
    next.status = "bankrupt";
    log.push("💸 資金が枯渇しました。会社は倒産です。");
  } else if (next.employees.length === 0) {
    next.status = "empty";
    log.push("💸 社員が全員いなくなりました。会社は成り立ちません。");
  } else if (week >= PARAMS.trialWeeks) {
    next.status = "cleared";
    log.push("🎉 創業期を乗り切りました（試作Step 1 クリア）。");
  }
  return { state: next, log };
}

// 結果画面用の総括
export function summarize(state) {
  const emps = state.employees || [];
  return {
    status: state.status,
    weeks: Math.min(state.week - 1, PARAMS.trialWeeks),
    funds: state.funds,
    employees: emps.length,
    avgFaith: emps.length ? round1(avg(emps, "faith")) : 0,
    avgFatigue: emps.length ? round1(avg(emps, "fatigue")) : 0,
    reputation: state.reputation,
    risk: state.risk,
    rules: (state.ledger || []).filter((r) => r.status === "active").length,
  };
}
