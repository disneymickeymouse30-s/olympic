/* サウンド管理：Web Audio API による自作効果音とオリジナルBGM（音源ファイル不要） */
(function () {
  'use strict';
  const PPO = (window.PPO = window.PPO || {});

  const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  function midiOf(name) {
    const m = /^([A-G]#?)(-?\d)$/.exec(name);
    if (!m) return null;
    return 12 * (parseInt(m[2], 10) + 1) + NOTE[m[1]];
  }
  const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  // "C5:2 -:2 N:1" → [{m, len}]（len は16分音符単位、N はノイズ打楽器）
  function parse(seq) {
    return seq.trim().split(/\s+/).filter((t) => t !== '|').map((tok) => {
      const [n, l] = tok.split(':');
      return { m: n === '-' ? null : n === 'N' ? 'N' : midiOf(n), len: parseInt(l || '2', 10) };
    });
  }

  // ---- オリジナル楽曲 ----
  const SONGS = {
    title: {
      bpm: 132,
      tracks: [
        { wave: 'square', vol: 0.10, notes: 'G4:2 C5:2 E5:2 G5:4 E5:2 G5:2 A5:2 | G5:4 E5:2 C5:2 D5:4 -:4 | F5:2 F5:2 E5:2 D5:2 E5:2 C5:2 A4:4 | G4:2 A4:2 B4:2 D5:2 C5:6 -:2' },
        { wave: 'triangle', vol: 0.20, notes: 'C3:4 G3:4 C3:4 G3:4 | A2:4 E3:4 A2:4 E3:4 | F2:4 C3:4 F2:4 C3:4 | G2:4 D3:4 G2:4 B2:4' },
        { wave: 'noise', vol: 0.035, notes: 'N:4 N:4 N:4 N:4 N:4 N:4 N:4 N:4 N:4 N:4 N:4 N:4 N:4 N:4 N:4 N:4' },
      ],
    },
    event: {
      bpm: 150,
      tracks: [
        { wave: 'square', vol: 0.06, notes: 'E5:3 E5:1 -:2 D5:2 E5:4 G5:4 | A5:4 G5:2 E5:2 D5:4 -:4 | C5:3 C5:1 -:2 D5:2 E5:4 G5:4 | D5:4 E5:2 D5:2 B4:4 -:4' },
        { wave: 'triangle', vol: 0.18, notes: 'A2:2 A3:2 A2:2 A3:2 A2:2 A3:2 A2:2 A3:2 | F2:2 F3:2 F2:2 F3:2 F2:2 F3:2 F2:2 F3:2 | C3:2 C4:2 C3:2 C4:2 C3:2 C4:2 C3:2 C4:2 | G2:2 G3:2 G2:2 G3:2 G2:2 G3:2 G2:2 G3:2' },
        { wave: 'noise', vol: 0.03, notes: 'N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2 N:2' },
      ],
    },
    ceremony: {
      bpm: 112,
      tracks: [
        { wave: 'square', vol: 0.10, notes: 'C5:2 C5:1 C5:1 G5:6 -:2 E5:2 G5:2 | C6:8 A5:4 G5:4 | F5:2 F5:1 F5:1 A5:4 G5:2 F5:2 E5:4 | D5:2 E5:2 F5:2 D5:2 C5:6 -:2' },
        { wave: 'sawtooth', vol: 0.05, notes: 'E4:8 D4:8 | E4:8 C4:8 | C4:8 E4:8 | B3:8 E4:8' },
        { wave: 'triangle', vol: 0.20, notes: 'C3:8 G2:8 | A2:8 E3:8 | F2:8 C3:8 | G2:8 C3:8' },
      ],
    },
  };
  Object.values(SONGS).forEach((s) => s.tracks.forEach((t) => {
    t.seq = parse(t.notes);
    t.total = t.seq.reduce((a, n) => a + n.len, 0);
  }));

  const Sound = {
    ctx: null, master: null, bgmGain: null, sfxGain: null, noiseBuf: null,
    settings: { bgm: 0.55, sfx: 0.8, muted: false },
    current: null, timer: null, lastStep: 0,

    init(settings) {
      if (settings) this.settings = settings;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch (e) { this.ctx = null; return; }
      const c = this.ctx;
      this.master = c.createGain();
      this.master.connect(c.destination);
      this.bgmGain = c.createGain();
      this.bgmGain.connect(this.master);
      this.sfxGain = c.createGain();
      this.sfxGain.connect(this.master);
      const len = c.sampleRate * 1.0;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) this.ctx.suspend().catch(() => {});
        else this.ctx.resume().catch(() => {});
      });
    },

    // iOS は最初のユーザー操作で解錠が必要
    unlock() {
      if (!this.ctx) return;
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      if (!this._unlocked) {
        const b = this.ctx.createBuffer(1, 1, 22050);
        const s = this.ctx.createBufferSource();
        s.buffer = b; s.connect(this.ctx.destination); s.start(0);
        this._unlocked = true;
      }
    },

    applyVolumes() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.settings.muted ? 0 : 1, t, 0.02);
      this.bgmGain.gain.setTargetAtTime(this.settings.bgm * 0.9, t, 0.02);
      this.sfxGain.gain.setTargetAtTime(this.settings.sfx, t, 0.02);
    },

    // ---------- BGM シーケンサ ----------
    playBGM(name) {
      if (!this.ctx || this.current === name) return;
      this.stopBGM();
      const song = SONGS[name];
      if (!song) return;
      this.current = name;
      const stepDur = 60 / song.bpm / 4;
      const start = this.ctx.currentTime + 0.08;
      const state = song.tracks.map(() => ({ idx: 0, time: start }));
      const ahead = 0.25;
      const tick = () => {
        if (!this.ctx || this.current !== name) return;
        const now = this.ctx.currentTime;
        song.tracks.forEach((tr, i) => {
          const st = state[i];
          if (st.time < now - 1) st.time = now + 0.05; // タブ復帰時の追いつき防止
          while (st.time < now + ahead) {
            const n = tr.seq[st.idx];
            const dur = n.len * stepDur;
            if (n.m !== null) this._note(tr.wave, n.m, st.time, dur, tr.vol);
            st.time += dur;
            st.idx = (st.idx + 1) % tr.seq.length;
          }
        });
      };
      tick();
      this.timer = setInterval(tick, 60);
    },
    stopBGM() {
      this.current = null;
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    },
    _note(wave, m, t, dur, vol) {
      const c = this.ctx;
      const g = c.createGain();
      g.connect(this.bgmGain);
      if (wave === 'noise') {
        const s = c.createBufferSource();
        s.buffer = this.noiseBuf;
        const f = c.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 7000;
        s.connect(f); f.connect(g);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        s.start(t, Math.random() * 0.5, 0.06);
        return;
      }
      const o = c.createOscillator();
      o.type = wave;
      o.frequency.setValueAtTime(freq(m), t);
      o.connect(g);
      const len = Math.max(0.05, dur * 0.9);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.setValueAtTime(vol, t + len * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.start(t);
      o.stop(t + len + 0.02);
    },

    // ---------- 効果音ユーティリティ ----------
    _tone(type, f0, f1, dur, vol, delay) {
      if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime + (delay || 0);
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + dur + 0.02);
    },
    _noise(dur, vol, ftype, f0, f1, delay) {
      if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime + (delay || 0);
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = ftype || 'lowpass';
      f.frequency.setValueAtTime(f0 || 1000, t);
      if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.sfxGain);
      s.start(t, Math.random() * 0.3, dur + 0.05);
    },

    play(name, opt) {
      if (!this.ctx || this.settings.muted) return;
      const o = opt || {};
      switch (name) {
        case 'tap': this._tone('square', 880, 660, 0.05, 0.08); break;
        case 'select': this._tone('square', 660, 990, 0.08, 0.1); break;
        case 'back': this._tone('square', 500, 330, 0.08, 0.08); break;
        case 'beep': this._tone('square', 880, 880, 0.12, 0.12); break;
        case 'pistol':
          this._noise(0.35, 0.9, 'lowpass', 6000, 300);
          this._tone('sine', 160, 40, 0.25, 0.6);
          break;
        case 'step': {
          const p = o.pitch || 1;
          this._tone('triangle', 190 * p, 80 * p, 0.05, 0.16);
          this._noise(0.03, 0.08, 'bandpass', 1800);
          break;
        }
        case 'jump': this._tone('square', 280, 760, 0.16, 0.12); break;
        case 'land':
          this._noise(0.18, 0.5, 'lowpass', 900, 200);
          this._tone('sine', 140, 50, 0.16, 0.35);
          break;
        case 'sand':
          this._noise(0.35, 0.45, 'lowpass', 2500, 300);
          this._tone('sine', 110, 45, 0.2, 0.3);
          break;
        case 'hurdle':
          this._tone('square', 620, 590, 0.18, 0.12);
          this._tone('square', 930, 880, 0.14, 0.08);
          this._noise(0.12, 0.4, 'highpass', 1500);
          break;
        case 'fall':
          this._tone('sine', 900, 180, 0.5, 0.18);
          this._noise(0.25, 0.4, 'lowpass', 800, 150, 0.35);
          break;
        case 'throw':
          this._noise(0.45, 0.5, 'bandpass', 400, 2600);
          this._tone('sawtooth', 220, 110, 0.12, 0.06);
          break;
        case 'stick':
          this._tone('triangle', 300, 120, 0.12, 0.3);
          this._noise(0.1, 0.35, 'lowpass', 1500, 300);
          break;
        case 'baton': this._tone('square', 1300, 1300, 0.05, 0.12); this._tone('square', 1700, 1700, 0.06, 0.1, 0.05); break;
        case 'whistle':
          for (let i = 0; i < 4; i++) this._tone('sine', 2300, 2150, 0.07, 0.18, i * 0.08);
          break;
        case 'buzz': this._tone('sawtooth', 160, 120, 0.35, 0.18); break;
        case 'good': this._tone('square', 784, 784, 0.07, 0.1); this._tone('square', 1175, 1175, 0.1, 0.1, 0.07); break;
        case 'perfect': [1047, 1319, 1568].forEach((f, i) => this._tone('square', f, f, 0.08, 0.1, i * 0.05)); break;
        case 'goal': [784, 988, 1175, 1568].forEach((f, i) => this._tone('square', f, f, 0.14, 0.11, i * 0.09)); break;
        case 'record':
          [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this._tone('square', f, f, i === 6 ? 0.5 : 0.12, 0.12, i * 0.1));
          this._tone('triangle', 131, 131, 0.8, 0.2);
          break;
        case 'fanfare':
          [[523, 0], [523, 0.15], [523, 0.3], [784, 0.45], [659, 0.8], [784, 1.0], [1047, 1.2]].forEach(([f, d], i) => this._tone('square', f, f, i === 6 ? 0.9 : 0.16, 0.13, d));
          [[262, 0], [196, 0.45], [262, 1.2]].forEach(([f, d]) => this._tone('triangle', f, f, 0.5, 0.25, d));
          break;
        case 'bark':
          this._tone('sawtooth', 620, 380, 0.11, 0.16);
          this._noise(0.08, 0.15, 'bandpass', 1200);
          if (o.double !== false) { this._tone('sawtooth', 680, 400, 0.1, 0.14, 0.16); }
          break;
        case 'sad': this._tone('triangle', 520, 260, 0.6, 0.18); break;
        case 'cheer': this._noise(1.6, 0.18, 'bandpass', 900, 1500); break;
        case 'firework':
          this._tone('sine', 300, 1200, 0.5, 0.05);
          this._noise(0.5, 0.35, 'lowpass', 3000, 200, 0.5);
          break;
        default: break;
      }
    },
  };

  PPO.Sound = Sound;
})();
