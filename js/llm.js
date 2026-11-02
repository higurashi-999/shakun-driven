// LLMアダプタ：BYOK。送信先は Google の公式APIドメインのみ。
// キーは store.js 経由で端末内に閉じる。
// 無料枠の対象はFlash／Flash-Liteが中心で現行Proは対象外（2026-11-02確認）のため、
// 「一覧に出る」ことと「実際に生成できる」ことを分けて、生成テストで実測する。
// 役割別ルーティング：構造化＝Pro優先（不可ならFlash）／文章・会話＝Flash／軽処理＝Flash-Lite。
// 失敗時は下位候補へ自動降格する（callLLM）。
import { getApiKey, incCallCount } from "./store.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const ROUTING_KEY = "shakun-driven-llm-routing";

async function listModels(key) {
  const res = await fetch(`${API_BASE}/models?pageSize=200`, {
    headers: { "x-goog-api-key": key },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.models || [];
}

function generativeNames(models) {
  return models
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => String(m.name || "").replace(/^models\//, ""))
    .filter(Boolean);
}

// 接続テスト：キーでモデル一覧が引けるか（生成可否は生成テストで別に実測する）
export async function testConnection() {
  const key = getApiKey();
  if (!key) return { ok: false, message: "APIキーが保存されていません。" };
  try {
    const models = await listModels(key);
    const gen = generativeNames(models);
    return {
      ok: true,
      message: `接続OK。モデル全 ${models.length} 件のうち、生成に使える候補は ${gen.length} 件です。実際に生成できるかは下の「生成テスト」で確定してください。`,
      models: gen,
    };
  } catch (e) {
    return { ok: false, message: `接続に失敗しました（${e.message}）。キーを確認してください。` };
  }
}

// 実際に1回生成する
async function generateOnce(key, model, prompt, opts = {}) {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxOutputTokens ?? 1024,
    },
  };
  if (opts.json) body.generationConfig.responseMimeType = "application/json";
  const res = await fetch(
    `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error?.message) msg += `: ${String(j.error.message).slice(0, 160)}`;
    } catch { /* 本文が読めなくてもステータスは返す */ }
    throw new Error(msg);
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("");
}

// モデル名からティアと世代を推定する（ルーティング用）
// 音声・画像などの専用モデル（-tts等）はテキスト生成の役割から外す。
// 同世代では派生版より「素の」モデル（名前が短い方）を優先する。
const EXCLUDED_MODEL = /(tts|image|audio|video|embedding|robotics)/i;
function tierOf(name) {
  const n = name.toLowerCase();
  if (n.includes("lite")) return "lite";
  if (n.includes("pro")) return "pro";
  if (n.includes("flash")) return "flash";
  return "other";
}
function versionOf(name) {
  const n = name.toLowerCase();
  const m = n.match(/(\d+)\.(\d+)/);
  if (m) return Number(m[1]) * 100 + Number(m[2]);
  const m2 = n.match(/gemini-(\d+)/);
  return m2 ? Number(m2[1]) * 100 : 0;
}
function sortTier(list) {
  return [...list].sort((a, b) => {
    const d = versionOf(b) - versionOf(a);
    if (d !== 0) return d;
    if (a.length !== b.length) return a.length - b.length;
    return a < b ? -1 : 1;
  });
}

// 生成テスト：役割ごとに「実際に生成できるモデル」を実測して端末内に保存する
export async function probeModels() {
  const key = getApiKey();
  if (!key) return { ok: false, message: "APIキーが保存されていません。" };
  let gen;
  try {
    gen = generativeNames(await listModels(key));
  } catch (e) {
    return { ok: false, message: `モデル一覧の取得に失敗しました（${e.message}）。` };
  }
  const tiers = { pro: [], flash: [], lite: [] };
  for (const name of gen) {
    if (EXCLUDED_MODEL.test(name)) continue;
    const t = tierOf(name);
    if (tiers[t]) tiers[t].push(name);
  }
  for (const k of Object.keys(tiers)) tiers[k] = sortTier(tiers[k]);

  const proven = new Map();
  const attempts = [];
  async function tryModel(model) {
    if (proven.has(model)) return proven.get(model);
    incCallCount();
    try {
      const text = await generateOnce(key, model, "「OK」とだけ返してください。", {
        maxOutputTokens: 32,
        temperature: 0,
      });
      // 音声専用モデルなどはHTTP 200でもテキストが返らないため、本文の有無で判定する
      if (!String(text).trim()) throw new Error("テキストが返りませんでした");
      proven.set(model, true);
      attempts.push({ model, ok: true });
      return true;
    } catch (e) {
      proven.set(model, false);
      attempts.push({ model, ok: false, error: String(e.message || e) });
      return false;
    }
  }
  async function firstWorking(list, maxTry) {
    for (const model of list.slice(0, maxTry)) {
      if (await tryModel(model)) return model;
    }
    return null;
  }

  const proOk = await firstWorking(tiers.pro, 2);
  const flashOk = await firstWorking(tiers.flash, 2);
  const liteOk = await firstWorking(tiers.lite, 1);
  const routing = {
    structure: proOk || flashOk || null,
    main: flashOk || proOk || null,
    lite: liteOk || flashOk || proOk || null,
    probedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(ROUTING_KEY, JSON.stringify(routing));
  } catch { /* 保存できなくても実測結果は返す */ }

  const lines = [
    "生成テスト結果（実測）：",
    `・構造化（社訓の抽出）：${routing.structure ?? "使えるモデルなし"}`,
    `・文章・会話：${routing.main ?? "使えるモデルなし"}`,
    `・軽処理：${routing.lite ?? "使えるモデルなし"}`,
    "― 試したモデル ―",
    ...attempts.map((a) => (a.ok ? `○ ${a.model}` : `× ${a.model}（${a.error}）`)),
  ];
  return { ok: true, message: lines.join("\n"), routing, attempts };
}

export function getRouting() {
  try {
    return JSON.parse(localStorage.getItem(ROUTING_KEY) || "null");
  } catch {
    return null;
  }
}

// ゲーム本体から使う生成呼び出し。role: "structure" | "main" | "lite"
// 失敗（上限・不可など）時は候補の後続へ自動で降格する。呼び出し回数は試行ごとに数える。
export async function callLLM(role, prompt, opts = {}) {
  const key = getApiKey();
  if (!key) throw new Error("APIキーが未設定です");
  const routing = getRouting() || {};
  const order = [];
  const push = (m) => {
    if (m && !order.includes(m)) order.push(m);
  };
  if (role === "structure") {
    push(routing.structure); push(routing.main); push(routing.lite);
  } else if (role === "lite") {
    push(routing.lite); push(routing.main);
  } else {
    push(routing.main); push(routing.lite);
  }
  if (!order.length) {
    throw new Error("モデルが未確定です。設定画面で生成テストを実行してください");
  }
  let lastError = null;
  for (const model of order) {
    incCallCount();
    try {
      const text = await generateOnce(key, model, prompt, opts);
      if (!String(text).trim()) throw new Error("空の応答でした");
      return text;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("生成に失敗しました");
}
