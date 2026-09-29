// Tiny WebAudio synth for retro sound effects, so the prototype needs no audio files.
let ctx = null;
let muted = false;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone({ type = "square", from = 440, to = from, dur = 0.12, vol = 0.12, delay = 0 }) {
  const ac = audio();
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise({ dur = 0.15, vol = 0.15, freq = 1200, delay = 0 }) {
  const ac = audio();
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t);
}

const arp = (notes, step = 0.07, opts = {}) => notes.forEach((f, i) => tone({ from: f, dur: step * 1.6, delay: i * step, ...opts }));

export const sfx = {
  setMuted(v) {
    muted = v;
  },
  unlock: () => audio(),
  slash: () => noise({ dur: 0.09, vol: 0.12, freq: 2600 }),
  cut: () => noise({ dur: 0.12, vol: 0.1, freq: 900 }),
  hit: () => tone({ type: "square", from: 220, to: 90, dur: 0.1, vol: 0.1 }),
  crit: () => {
    tone({ type: "square", from: 520, to: 120, dur: 0.14, vol: 0.12 });
    noise({ dur: 0.1, vol: 0.12, freq: 3000 });
  },
  hurt: () => tone({ type: "sawtooth", from: 300, to: 80, dur: 0.22, vol: 0.12 }),
  kill: () => arp([392, 262, 196], 0.05, { type: "triangle", vol: 0.1 }),
  gem: () => arp([1319, 1760], 0.05, { type: "square", vol: 0.05 }),
  coin: () => arp([988, 1319], 0.06, { type: "square", vol: 0.06 }),
  heart: () => arp([659, 880], 0.06, { type: "triangle", vol: 0.1 }),
  drink: () => arp([392, 523, 659], 0.06, { type: "triangle", vol: 0.1 }),
  bolt: () => tone({ type: "sawtooth", from: 900, to: 200, dur: 0.2, vol: 0.07 }),
  dash: () => noise({ dur: 0.14, vol: 0.08, freq: 600 }),
  chest: () => arp([523, 659, 784, 1047], 0.09, { type: "square", vol: 0.07 }),
  equip: () => arp([330, 440], 0.05, { type: "square", vol: 0.06 }),
  levelUp: () => arp([523, 659, 784, 1047, 1319], 0.08, { type: "square", vol: 0.07 }),
  achievement: () => arp([784, 988, 1175, 1568], 0.07, { type: "triangle", vol: 0.1 }),
  shrine: () => arp([440, 554, 659, 880], 0.12, { type: "sine", vol: 0.12 }),
  error: () => tone({ type: "square", from: 140, to: 110, dur: 0.15, vol: 0.08 }),
  roar: () => {
    tone({ type: "sawtooth", from: 110, to: 45, dur: 0.8, vol: 0.14 });
    noise({ dur: 0.7, vol: 0.12, freq: 300 });
  },
  stomp: () => {
    tone({ type: "sine", from: 90, to: 30, dur: 0.4, vol: 0.25 });
    noise({ dur: 0.3, vol: 0.14, freq: 200 });
  },
  gate: () => arp([196, 247, 294, 392], 0.15, { type: "sine", vol: 0.14 }),
  death: () => arp([392, 330, 262, 196, 131], 0.14, { type: "triangle", vol: 0.12 }),
};
