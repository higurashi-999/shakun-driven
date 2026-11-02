// 状態管理：台帳・シム状態・セーブ・APIキーはすべて端末内（localStorage）に閉じる。
const SAVE_KEY = "shakun-driven-save-v1";
const APIKEY_KEY = "shakun-driven-apikey";
const CALLS_KEY = "shakun-driven-llm-calls";

export function defaultState(mode = null) {
  const seed = (Math.random() * 0xffffffff) >>> 0;
  return {
    version: 1,
    mode: null, // "black" | "white"
    phase: 1, // 創業期
    week: 1,
    funds: mode === "black" ? 1200 : 1000, // 万円（ブラックは初期資金に余裕がある）
    employees: [], // M2で初期社員を投入
    ledger: [], // 社訓台帳（M1）
    glossary: [], // 造語辞典（M1）
    risk: 0, // 告発リスク蓄積
    reputation: mode === "black" ? 40 : 55, // 評判 0〜100（M2／初期値はモードで異なる）
    status: "playing", // playing | bankrupt | empty | cleared（M2）
    rngState: seed, // 決定的乱数の状態（M2）
    lastReport: null, // 直近の週報素材ログ（M2）
    pendingEventId: null, // 次週に発生するイベント（M3）
    currentEvent: null, // 対応中のイベント（M3）
    eventHistory: [], // 発生済みイベントID（M3）
    reportText: null, // 週報ナレーション（M3）
    loanDone: false, // 初回融資審査を受けたか（M4）
    loanResult: null, // 融資審査の結果（M4）
    interviewUsedWeek: 0, // 面談を使った週（M4）
    interview: null, // 進行中の面談 {empId, concernKey}（M4）
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
