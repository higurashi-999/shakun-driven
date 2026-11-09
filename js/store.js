// 状態管理：台帳・シム状態・セーブ・APIキーはすべて端末内（localStorage）に閉じる。
const SAVE_KEY = "shakun-driven-save-v1";
const APIKEY_KEY = "shakun-driven-apikey";
const CALLS_KEY = "shakun-driven-llm-calls";

export function defaultState(mode = null) {
  const seed = (Math.random() * 0xffffffff) >>> 0;
  return {
    version: 1,
    mode, // "black" | "white"（M11：引数を保存する。以前は null 固定でモードが表示・判定に反映されないバグがあった）
    phase: 1, // 創業期
    month: 1,
    funds: mode === "black" ? 5200 : 4300, // 万円（月次スケール、M14。ブラックは初期資金に余裕がある）
    employees: [], // M2で初期社員を投入
    ledger: [], // 社訓台帳（M1）
    glossary: [], // 造語辞典（M1）
    risk: 0, // 告発リスク蓄積
    reputation: mode === "black" ? 40 : 55, // 評判 0〜100（M2／初期値はモードで異なる）
    status: "playing", // playing | bankrupt | empty | cleared（M2）
    rngState: seed, // 決定的乱数の状態（M2）
    lastReport: null, // 直近の月報素材ログ（M2）
    pendingEventId: null, // 次月に発生するイベント（M3）
    currentEvent: null, // 対応中のイベント（M3）
    eventHistory: [], // 発生済みイベントID（M3）
    reportText: null, // 月報ナレーション（M3）
    loanDone: false, // 初回融資審査を受けたか（M4）
    loanResult: null, // 融資審査の結果（M4）
    interviewUsedMonth: 0, // 面談を使った月（M4）
    hireUsedMonth: 0, // 採用を使った月（M14）
    phaseSales: 0, // 今期の累計売上（M16）
    phaseMonth: 1, // 今期に入ってからの月数（M16）
    milestones: {}, // 発生済みの山場イベント（M16）
    pendingMilestone: null, // 保留中の山場イベントキー（M16）
    listingResult: null, // 上場審査の結果（M16）
    candidates: null, // 今月の採用候補 {month, list}（M14）
    interview: null, // 進行中の面談 {empId, concernKey}（M4）
    lastProfit: null, // 直近月の収支（M6：資金の持ち表示用）
    prevSnapshot: null, // 前月スナップショット（M6：差分表示用）
    guideClosed: false, // 初回ガイドを畳んだか（M6）
    seed,
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function resetAll() {
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(CALLS_KEY);
}

export function getApiKey() {
  return localStorage.getItem(APIKEY_KEY) || "";
}

export function setApiKey(key) {
  if (key) localStorage.setItem(APIKEY_KEY, key);
  else localStorage.removeItem(APIKEY_KEY);
}

export function getCallCount() {
  return Number(localStorage.getItem(CALLS_KEY) || 0);
}

export function incCallCount() {
  const n = getCallCount() + 1;
  localStorage.setItem(CALLS_KEY, String(n));
  return n;
}
