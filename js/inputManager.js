/* 入力管理：Pointer Events のみを使用（タッチ/マウスの二重発火を防止）＋キーボード */
(function () {
  'use strict';
  const PPO = (window.PPO = window.PPO || {});

  const KEYMAP = {
    ArrowLeft: 'L', KeyZ: 'L', KeyA: 'L',
    ArrowRight: 'R', KeyX: 'R', KeyD: 'R',
    Space: 'act', ArrowUp: 'act', Enter: 'act', KeyJ: 'act',
    ArrowDown: 'act2', KeyC: 'act2', KeyK: 'act2',
  };
  const MIN_REPEAT_MS = 28; // 同一ボタンの極端な多重入力を無視

  const Input = {
    el: null, handler: null, buttons: {}, held: {}, lastDown: {}, pointerOwner: {},
    enabled: false,

    init(container) {
      this.el = container;
      // 誤操作防止（ゲーム中のスクロール・ズーム・長押しメニュー）
      const playing = () => document.body.classList.contains('playing');
      document.addEventListener('touchmove', (e) => { if (playing()) e.preventDefault(); }, { passive: false });
      document.addEventListener('gesturestart', (e) => e.preventDefault());
      document.addEventListener('dblclick', (e) => e.preventDefault());
      document.addEventListener('contextmenu', (e) => { if (playing() || e.target.closest('.cbtn')) e.preventDefault(); });
      window.addEventListener('keydown', (e) => this._key(e, 'down'));
      window.addEventListener('keyup', (e) => this._key(e, 'up'));
      window.addEventListener('blur', () => this.releaseAll());
    },

    // controls: [{id, label, sub, cls, wide}] / 'spacer'
    setControls(defs) {
      this.releaseAll();
      this.el.innerHTML = '';
      this.buttons = {};
      if (!defs || !defs.length) { this.el.classList.add('empty'); return; }
      this.el.classList.remove('empty');
      defs.forEach((d) => {
        if (d === 'spacer') {
          const s = document.createElement('div'); s.className = 'spacer'; this.el.appendChild(s); return;
        }
        const b = document.createElement('button');
        b.className = 'cbtn ' + (d.cls || 'run') + (d.wide ? ' wide' : '');
        b.innerHTML = d.label + (d.sub ? '<small>' + d.sub + '</small>' : '');
        b.dataset.id = d.id;
        b.setAttribute('aria-label', d.aria || d.label.replace(/<[^>]+>/g, ''));
        b.addEventListener('pointerdown', (e) => this._pdown(e, d.id, b));
        b.addEventListener('pointerup', (e) => this._pup(e, d.id, b));
        b.addEventListener('pointercancel', (e) => this._pup(e, d.id, b));
        b.addEventListener('lostpointercapture', (e) => this._pup(e, d.id, b));
        b.addEventListener('click', (e) => e.preventDefault());
        this.el.appendChild(b);
        this.buttons[d.id] = b;
      });
    },

    setLabel(id, html) { if (this.buttons[id]) this.buttons[id].innerHTML = html; },
    setDim(id, dim) { if (this.buttons[id]) this.buttons[id].classList.toggle('dim', !!dim); },
    highlight(id) {
      Object.keys(this.buttons).forEach((k) => this.buttons[k].classList.toggle('next', k === id));
    },

    _emit(id, phase, t) {
      if (!this.enabled || !this.handler) return;
      try { this.handler(id, phase, t); } catch (err) { console.error(err); }
    },

    _pdown(e, id, b) {
      e.preventDefault();
      if (PPO.Sound) PPO.Sound.unlock();
      if (this.pointerOwner[e.pointerId] === id) return;
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      this.pointerOwner[e.pointerId] = id;
      this._press(id, performance.now());
    },
    _pup(e, id) {
      if (this.pointerOwner[e.pointerId] !== id) return;
      delete this.pointerOwner[e.pointerId];
      // 同じボタンを別の指でまだ押している場合は離さない
      if (Object.values(this.pointerOwner).includes(id)) return;
      this._release(id, performance.now());
    },
    _press(id, t) {
      const last = this.lastDown[id] || 0;
      if (t - last < MIN_REPEAT_MS) return;
      this.lastDown[id] = t;
      this.held[id] = true;
      if (this.buttons[id]) this.buttons[id].classList.add('down');
      this._emit(id, 'down', t);
    },
    _release(id, t) {
      if (!this.held[id]) return;
      this.held[id] = false;
      if (this.buttons[id]) this.buttons[id].classList.remove('down');
      this._emit(id, 'up', t);
    },
    _key(e, phase) {
      const id = KEYMAP[e.code];
      if (!id) return;
      if (!document.body.classList.contains('playing')) return;
      e.preventDefault();
      if (phase === 'down') {
        if (e.repeat) return; // 押しっぱなしのキーリピートは連打として扱わない
        if (PPO.Sound) PPO.Sound.unlock();
        this._press(id, performance.now());
      } else {
        this._release(id, performance.now());
      }
    },
    isHeld(id) { return !!this.held[id]; },
    releaseAll() {
      const t = performance.now();
      Object.keys(this.held).forEach((id) => { if (this.held[id]) this._release(id, t); });
      this.pointerOwner = {};
    },
  };

  /* 左右交互タップの判定器
     ・交互に押したときだけテンポ(cadence)が上がる
     ・同じ側の連打はほぼ無効
     ・テンポには上限があり、機械的な超高速連打は有利にならない */
  class TapRunner {
    constructor(opts) {
      this.ideal = opts.idealCadence || 8;     // 最高速に必要な1秒あたりのタップ数
      this.maxCad = this.ideal * 1.12;         // これ以上は速度に反映されない
      this.cadence = 0;
      this.lastSide = null;
      this.lastT = 0;
      this.goodTaps = 0;
      this.sameTaps = 0;
    }
    tap(side, t) {
      const dtms = this.lastT ? t - this.lastT : 9999;
      if (side === this.lastSide) {
        this.sameTaps++;
        this.lastT = t; // 同じ側：テンポを稼げない（少しリズムが崩れる）
        this.cadence *= 0.94;
        return false;
      }
      this.lastSide = side;
      this.lastT = t;
      this.goodTaps++;
      if (dtms > 1200) { this.cadence = Math.max(this.cadence, 2.2); return true; }
      const inst = Math.min(this.maxCad, 1000 / Math.max(45, dtms));
      this.cadence += (inst - this.cadence) * 0.38;
      return true;
    }
    // 現在のテンポ（タップが途切れると減衰）
    current(now) {
      if (!this.lastT) return 0;
      const since = (now - this.lastT) / 1000;
      const limit = since > 0.001 ? 1 / since : 99;
      return Math.min(this.cadence, Math.max(limit * 1.35, 0), this.maxCad);
    }
    ratio(now) { return Math.min(1, this.current(now) / this.ideal); }
    nextSide() { return this.lastSide === 'L' ? 'R' : 'L'; }
    reset() { this.cadence = 0; this.lastSide = null; this.lastT = 0; }
  }

  PPO.Input = Input;
  PPO.TapRunner = TapRunner;
})();
