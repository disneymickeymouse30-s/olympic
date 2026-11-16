/* フィールド種目（走り幅跳び・やり投げ）の共通処理：試技ラウンド・CPU試技・記録ボード */
(function () {
  'use strict';
  const PPO = window.PPO;
  const U = PPO.U, Draw = PPO.Draw, Sound = PPO.Sound, Input = PPO.Input, Engine = PPO.Engine;

  class FieldBase extends PPO.Competition {
    constructor(eventId, cx, o) {
      super(eventId, cx);
      this.rounds = o.rounds || 3;
      this.stage = new PPO.Stage(o.theme);
      this.round = 0;
      this.state = 'ready';
      this.stateT = 0;
      this.entries = [this.entry].concat(this.cpus);
      this.marks = {};
      this.entries.forEach((e) => { this.marks[e.id] = { best: null, list: [] }; });
      this.boardT = 0;
      this.camX = -10;
    }
    start() {
      Sound.playBGM('event');
      this.beginRound();
    }
    beginRound() {
      this.round++;
      this.state = 'ready';
      this.stateT = 0;
      this.resetAttempt();
      this.fx.banner(`${this.round}回目の試技`, '#fff', 1.3, 0.7);
      Input.setDim('act', true);
    }
    resetAttempt() {}
    // プレイヤーの試技結果を記録 → CPUの同じラウンドを実施 → 記録ボード
    recordPlayer(value) {
      this.addMark(this.entry.id, value);
      this.cpus.forEach((c) => this.addMark(c.id, this.cpuAttempt(c, this.round)));
    }
    addMark(id, v) {
      const m = this.marks[id];
      m.list.push(v);
      if (v != null && (m.best == null || v > m.best)) m.best = v;
    }
    showBoard() {
      this.state = 'board';
      this.boardT = 0;
      Input.setDim('act', false);
      Input.setLabel('act', this.round < this.rounds ? 'つぎへ' : '結果へ');
    }
    update(dt) {
      super.update(dt);
      this.stateT += dt;
      this.stage.update(dt);
      if (this.state === 'board') {
        this.boardT += dt;
        if (this.boardT > 9) this.nextFromBoard();
      }
    }
    nextFromBoard() {
      if (this.state !== 'board') return;
      if (this.round < this.rounds) this.beginRound();
      else this.finishField();
    }
    onInput(id, phase, t) {
      if (this.state === 'board') {
        if (phase === 'down' && this.boardT > 0.5) { Sound.play('select'); this.nextFromBoard(); }
        return;
      }
      this.onFieldInput(id, phase, t);
    }
    onFieldInput() {}
    finishField() {
      const standings = this.entries.map((e) => ({
        id: e.id, name: e.name, pug: e.pug, levelName: e.levelName, isPlayer: !!e.isPlayer,
        value: this.marks[e.id].best, dq: false,
        attempts: this.marks[e.id].list.slice(),
      }));
      const mine = this.marks[this.entry.id];
      const details = ['試技：' + mine.list.map((v) => (v == null ? '×ファウル' : PPO.Score.fmt(this.eventId, v) + 'm')).join(' / ')];
      this.extraDetails(details);
      this.finish({ value: mine.best, dq: false, reason: mine.best == null ? '全試技ファウル（記録なし）' : null, standings, details });
    }
    extraDetails() {}

    drawBoardOverlay(ctx, W, H) {
      if (this.state !== 'board') return;
      const k = Math.min(1, this.boardT * 4);
      ctx.fillStyle = `rgba(8,20,50,${0.55 * k})`;
      ctx.fillRect(0, 0, W, H);
      const rows = this.entries.map((e) => {
        const m = this.marks[e.id];
        const last = m.list[m.list.length - 1];
        return { name: e.isPlayer ? 'あなた' : e.name, isPlayer: !!e.isPlayer, best: m.best, last };
      }).sort((a, b) => (b.best == null ? -1 : b.best) - (a.best == null ? -1 : a.best));
      const v = Engine.view();
      const bw = Math.min(W - 20, 480);
      const rowH = Math.max(30, Math.min(42, (v.playH - 160) / (rows.length + 2.4)));
      const bh = rowH * (rows.length + 2.2) + 12;
      const x = (W - bw) / 2, y = Math.max(64, (v.playH - bh) / 2);
      ctx.save();
      ctx.translate(0, (1 - k) * 40);
      Draw.panel(ctx, x, y, bw, bh, 'rgba(255,250,240,0.97)', 20);
      Draw.text(ctx, `${this.round}回目 終了  /  ${this.rounds}回`, W / 2, y + rowH * 0.62, rowH * 0.56, '#ffd84f', 'center', 4);
      const fs = Math.round(rowH * 0.44);
      ctx.font = `900 ${fs}px sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#8a7a9a';
      ctx.textAlign = 'right';
      const c1 = x + bw - 120, c2 = x + bw - 16;
      ctx.fillText('今回', c1, y + rowH * 1.5);
      ctx.fillText('ベスト', c2, y + rowH * 1.5);
      rows.forEach((r, i) => {
        const ry = y + rowH * (2.1 + i) + 4;
        if (r.isPlayer) { ctx.fillStyle = '#fff0b8'; ctx.fillRect(x + 6, ry, bw - 12, rowH - 3); }
        ctx.textAlign = 'left'; ctx.fillStyle = '#2a2140';
        ctx.fillText(`${i + 1}. ${r.name}`, x + 14, ry + rowH * 0.48);
        ctx.textAlign = 'right';
        ctx.fillStyle = r.last == null ? '#d22' : '#2a2140';
        ctx.fillText(r.last == null ? '×' : PPO.Score.fmt(this.eventId, r.last), c1, ry + rowH * 0.48);
        ctx.fillStyle = '#1d4a8c';
        ctx.fillText(r.best == null ? '—' : PPO.Score.fmt(this.eventId, r.best), c2, ry + rowH * 0.48);
      });
      if (this.boardT > 0.5) {
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 6);
        Draw.text(ctx, 'ボタンで次へ ▶', W / 2, y + bh + 26, 20, '#fff', 'center', 4);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    // 審判パグの旗（白=成功 / 赤=ファウル）
    drawJudge(ctx, x, y, s, flag) {
      PPO.drawPug(ctx, x, y, s, { pug: 'silver', pose: 'idle', t: this.t, bib: false, flip: true });
      if (flag) {
        ctx.strokeStyle = '#333'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x - s * 0.3, y - s * 0.7); ctx.lineTo(x - s * 0.3, y - s * 1.5); ctx.stroke();
        ctx.fillStyle = flag === 'red' ? '#ec4646' : '#ffffff';
        ctx.fillRect(x - s * 0.3, y - s * 1.5, s * 0.5, s * 0.34);
        ctx.strokeRect(x - s * 0.3, y - s * 1.5, s * 0.5, s * 0.34);
      }
    }
  }

  PPO.FieldBase = FieldBase;
})();
