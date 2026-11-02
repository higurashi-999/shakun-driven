// LLMアダプタ：BYOK。M0では接続テストのみ。生成呼び出しはM1以降で追加する。
// 送信先は Google の公式APIドメインのみ。キーは store.js 経由で端末内に閉じる。
import { getApiKey, incCallCount } from "./store.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export async function testConnection() {
  const key = getApiKey();
  if (!key) return { ok: false, message: "APIキーが保存されていません。" };
  try {
    const res = await fetch(`${API_BASE}/models`, {
      headers: { "x-goog-api-key": key },
    });
    if (!res.ok) {
      return { ok: false, message: `接続に失敗しました（HTTP ${res.status}）。キーを確認してください。` };
    }
    const data = await res.json();
    const models = (data.models || [])
      .map((m) => m.name)
      .filter((n) => typeof n === "string");
    return {
      ok: true,
      message: `接続OK。利用可能なモデル ${models.length} 件を確認しました。`,
      models,
    };
  } catch (e) {
    return { ok: false, message: `ネットワークエラー：${e.message}` };
  }
}

// M1以降：構造化・文章生成の共通呼び出し口。呼び出し回数を必ず数える。
export async function callLLM() {
  incCallCount();
  throw new Error("callLLM は M1 で実装します");
}
