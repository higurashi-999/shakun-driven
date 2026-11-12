// 効果音（M20）：WebAudioで合成する小さなSE集。音声素材は使わない（運用費¥0）。
// 設定は端末内 localStorage に保存し、デフォルトはON。AudioContextは初回のユーザー操作で生成する。
const SOUND_KEY = "shakun-driven-sound";
let ctx = null;
let master = null;

export function soundEnabled() {
  try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; }
}
export function setSoundEnabled(on) {
  try { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch { /* 保存できなくても動作は続ける */ }
}

function ensureCtx() {
  if (!soundEnabled()) return null;
  if (typeof window === "undefined" || !window.AudioContext) return null;
  if (!ctx) {
    try {
      ctx = new window.AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch { return null; }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, { type = "sine", at = 0, dur = 0.12, vol = 0.2, slide = 0 } = {}) {
  const c = ensureCtx();
  if (!c || !master) return;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise({ at = 0, dur = 0.08, vol = 0.15, freq = 1200 } = {}) {
  const c = ensureCtx();
  if (!c || !master) return;
  const t0 = c.currentTime + at;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

// ボタンのクリック：短い木っぽいtick
export function playClick() { tone(660, { type: "triangle", dur: 0.05, vol: 0.08 }); }
// 紙をめくる・画面遷移：短いノイズ
export function playPage() { noise({ dur: 0.09, vol: 0.1, freq: 1800 }); }
// 判子を押す：低いドンッ＋紙の擦れ
export function playStamp() { tone(140, { type: "sine", dur: 0.16, vol: 0.35, slide: -60 }); noise({ dur: 0.05, vol: 0.12, freq: 700 }); }
// 良い結果：上昇する2音
export function playGood() { tone(523, { type: "triangle", dur: 0.1, vol: 0.14 }); tone(784, { type: "triangle", at: 0.09, dur: 0.16, vol: 0.14 }); }
// 悪い結果：下降する2音
export function playBad() { tone(330, { type: "triangle", dur: 0.12, vol: 0.14 }); tone(196, { type: "triangle", at: 0.1, dur: 0.2, vol: 0.14 }); }
// フェーズアップ：短いファンファーレ（3音＋締め）
export function playPhase() {
  tone(392, { type: "triangle", dur: 0.11, vol: 0.16 });
  tone(523, { type: "triangle", at: 0.1, dur: 0.11, vol: 0.16 });
  tone(659, { type: "triangle", at: 0.2, dur: 0.11, vol: 0.16 });
  tone(784, { type: "triangle", at: 0.3, dur: 0.24, vol: 0.18 });
}
// 1on1の送信・吹き出し：小さなポップ
export function playPop() { tone(880, { type: "sine", dur: 0.06, vol: 0.1, slide: -300 }); }
