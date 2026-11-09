// 描画スモークテスト用の最小ブラウザスタブ。
// M8.2 の「未定義関数で描画が止まる」事故を push 前に検出するための仕組み。
// 実際の DOM ではなく、app.js が使う API だけを吸収する偽要素で画面遷移を駆動する。
import { initialEmployees } from "../js/employees.js";

export const handlers = new Map();
export const elements = new Map();

class El {
  constructor(id) {
    this.id = id || "";
    this.children = [];
    this.style = {};
    this.dataset = {};
    this._classes = new Set();
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
    this.disabled = false;
    this.checked = false;
    this.src = "";
  }
  get classList() {
    const s = this._classes;
    return {
      add: (...c) => c.forEach((x) => s.add(x)),
      remove: (...c) => c.forEach((x) => s.delete(x)),
      toggle: (c, f) => { if (f === undefined) f = !s.has(c); if (f) s.add(c); else s.delete(c); },
      contains: (c) => s.has(c),
    };
  }
  set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this._classes].join(" "); }
  appendChild(ch) { this.children.push(ch); return ch; }
  addEventListener(type, fn) { if (this.id) handlers.set(`${this.id}:${type}`, fn); }
  removeEventListener() {}
  querySelectorAll() { return []; }
}

function ensureEl(id) {
  if (!elements.has(id)) elements.set(id, new El(id));
  return elements.get(id);
}

export function installBrowserStubs(fixture) {
  const store = new Map();
  if (fixture) store.set("shakun-driven-save-v1", JSON.stringify(fixture));
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const body = new El("body");
  const modeBtnBlack = new El("mode-btn-black");
  modeBtnBlack.dataset = { mode: "black" };
  const modeBtnWhite = new El("mode-btn-white");
  modeBtnWhite.dataset = { mode: "white" };
  elements.set("mode-btn-black", modeBtnBlack);
  elements.set("mode-btn-white", modeBtnWhite);
  globalThis.document = {
    body,
    getElementById: (id) => ensureEl(id),
    createElement: () => new El(""),
    querySelectorAll: (sel) => (sel === ".mode-btn" ? [modeBtnBlack, modeBtnWhite] : []),
  };
  globalThis.confirm = () => true;
  globalThis.alert = () => {};
}

export function click(id) {
  const fn = handlers.get(`${id}:click`);
  if (!fn) throw new Error(`click ハンドラが未登録です: ${id}`);
  fn();
}

export function makeFixture(mode) {
  const employees = initialEmployees().map((e, i) =>
    i === 0 ? { ...e, hp: 10, faith: 40 } : e
  );
  return {
    version: 1,
    seed: 42,
    mode,
    month: 3,
    funds: 900,
    reputation: 45,
    risk: 12,
    employees,
    ledger: [],
    glossary: [],
    status: "playing",
    lastReport: ["― 第2月 ―", "売上 500万円／費用 490万円／収支 +10万円（資金 4,200万円）"],
    reportText: "第2月の月報テキストです。今月もお疲れ様でした。",
    prevSnapshot: { funds: 899, avgFaith: 50, avgFatigue: 20, reputation: 44, risk: 10 },
    eventHistory: [],
    loanDone: false,
    loanResult: null,
    interview: null,
    guideClosed: false,
    lastProfit: 1,
    pendingEvent: null,
  };
}
