// アプリ全体制御：画面遷移とM0範囲の配線（タイトル／設定／社長室）。
import {
  defaultState,
  loadState,
  saveState,
  resetAll,
  getApiKey,
  setApiKey,
  getCallCount,
} from "./store.js?v=20261102.4";
import { testConnection, probeModels } from "./llm.js?v=20261102.4";

const screens = ["title", "settings", "office"];
let state = loadState();

function show(name) {
  for (const s of screens) {
    document.getElementById(`screen-${s}`).classList.toggle("active", s === name);
  }
  if (name === "office") renderOffice();
  if (name === "settings") renderSettings();
}

function renderOffice() {
  if (!state) return;
  document.getElementById("st-mode").textContent =
    state.mode === "black" ? "ブラック" : state.mode === "white" ? "ホワイト" : "-";
  document.getElementById("st-week").textContent = String(state.week);
  document.getElementById("st-funds").textContent = state.funds.toLocaleString("ja-JP");
  document.getElementById("st-employees").textContent = String(state.employees.length);
}

function renderSettings() {
  document.getElementById("input-apikey").value = getApiKey();
  document.getElementById("call-count").textContent = String(getCallCount());
  document.getElementById("test-result").textContent = "";
}

// タイトル画面
document.getElementById("btn-new").addEventListener("click", () => {
  document.getElementById("mode-select").classList.remove("hidden");
});
document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    state = defaultState();
    state.mode = btn.dataset.mode;
    saveState(state);
    show("office");
  });
});
document.getElementById("btn-continue").addEventListener("click", () => {
  state = loadState();
  if (!state) {
    alert("セーブデータがありません。");
    return;
  }
  show("office");
});
document.getElementById("btn-settings").addEventListener("click", () => show("settings"));

// 設定画面
document.getElementById("btn-save-key").addEventListener("click", () => {
  setApiKey(document.getElementById("input-apikey").value.trim());
  document.getElementById("test-result").textContent = "保存しました。";
});
document.getElementById("btn-test-key").addEventListener("click", async () => {
  const el = document.getElementById("test-result");
  el.textContent = "接続テスト中…";
  const result = await testConnection();
  el.textContent = result.message;
});
document.getElementById("btn-probe").addEventListener("click", async () => {
  const el = document.getElementById("test-result");
  const btn = document.getElementById("btn-probe");
  btn.disabled = true;
  el.textContent = "生成テスト中…（数回だけ実際に呼び出します）";
  try {
    const result = await probeModels();
    el.textContent = result.message;
  } catch (e) {
    el.textContent = `生成テストに失敗しました：${e.message}`;
  } finally {
    btn.disabled = false;
    document.getElementById("call-count").textContent = String(getCallCount());
  }
});
document.getElementById("btn-reset").addEventListener("click", () => {
  if (confirm("セーブデータと呼び出し回数を初期化します。APIキーは残ります。よろしいですか？")) {
    resetAll();
    state = null;
    renderSettings();
    document.getElementById("test-result").textContent = "初期化しました。";
  }
});
document.getElementById("btn-back-from-settings").addEventListener("click", () => show("title"));
document.getElementById("btn-back-from-office").addEventListener("click", () => show("title"));

show("title");
