/* 競技の共通基盤：競技レジストリ・選手（Athlete）・レース共通処理・フィールド種目の記録ボード */
(function () {
  'use strict';
  const PPO = (window.PPO = window.PPO || {});
  const U = PPO.U, Draw = PPO.Draw, Engine = PPO.Engine, Sound = PPO.Sound, Input = PPO.Input;

  PPO.Competitions = {}; // id → { create(ctx), howto, controlsInfo }
  PPO.registerCompetition = (id, def) => { PPO.Competitions[id] = def; };

  /* 競技の基底クラス
     ctx = { entry, cpus, difficulty, mode('single'|'tournament'), round, onFinish(result) } */
  class Competition {
    constructor(eventId, cx) {
      this.eventId = eventId;
      this.ev = PPO.Score.EVENTS[eventId];
      this.cx = cx;
      this.entry = cx.entry;
      this.cpus = cx.cpus || [];
      this.diff = PPO.Score.DIFF[cx.difficulty] || PPO.Score.DIFF.normal;
      this.pugDef = PPO.PUGS[this.entry.pug];
      this.st = this.pugDef.stats;
      this.win = this.diff.window * this.st.tech; // タイミング判定の広さ
      this.t = 0;
      this.done = false;
      this.hints = PPO.Save.data.settings.hints;
      this.fx = Engine.fx;
      this.hintText = '';
      this.hintTimer = 0;
    }
    controls() { return []; }
    start() {}
    onInput() {}
    update(dt) { this.t += dt; if (this.hintTimer > 0) this.hintTimer -= dt; }
    draw() {}
    hint(text, dur) { if (!this.hints) return; this.hintText = text; this.hintTimer = dur || 2.5; }
    drawHint(ctx, W, y) {
      if (this.hintTimer <= 0 || !this.hintText) return;
      ctx.globalAlpha = Math.min(1, this.hintTimer * 2);
      let size = Math.min(26, W * 0.055);
      ctx.font = `900 ${size}px sans-serif`;
      let w = ctx.measureText(this.hintText).width + 36;
      if (w > W - 16) { size *= (W - 52) / (w - 36); ctx.font = `900 ${size}px sans-serif`; w = W - 16; }
      Draw.panel(ctx, W / 2 - w / 2, y - size, w, size * 2, 'rgba(255,255,255,0.92)', size);
      ctx.fillStyle = '#1d4a8c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.hintText, W / 2, y + 1);
      ctx.globalAlpha = 1;
    }
    finish(result) {
      if (this.done) return;
      this.done = true;
      result.eventId = this.eventId;
      Input.enabled = false;
      if (this.cx.onFinish) this.cx.onFinish(result);
    }
    // 選手の表示名
    static label(e) { return e.isPlayer ? 'あなた' : e.name; }
  }

  /* 走る選手 */
  class Athlete {
    constructor(entry, opts) {
      this.entry = entry;
      this.isPlayer = !!entry.isPlayer;
      this.body = new PPO.RunnerBody(opts);
      this.phase = Math.random() * 6;
      this.pose = 'idle';
      this.lane = opts.lane || 0;
      this.finished = false;
      this.finishTime = null;
      this.react = null;
      this.fallT = 0;
      this.expr = null;
      this.wph = Math.random() * 10;
      this.stamina = 1;
      this.celebrate = null;
      this.lastStepPh = 0;
    }
    get x() { return this.body.x; }
    get v() { return this.body.v; }
    stepAnim(dt) {
      const sp = this.body.v;
      this.phase += sp * dt * 2.9 + (sp > 0.1 ? dt * 2 : 0);
      if (this.isPlayer && sp > 0.5) {
        const k = Math.floor(this.phase / Math.PI);
        if (k !== this.lastStepPh) { this.lastStepPh = k; Sound.play('step', { pitch: 0.9 + Math.random() * 0.2 }); }
      }
    }
    draw(ctx, sx, sy, size, t, extra) {
      const sp = U.clamp(this.body.v / this.body.maxSpeed, 0, 1);
      let pose = this.pose;
      if (pose === 'auto') pose = sp > 0.88 ? 'sprint' : sp > 0.05 ? 'run' : 'idle';
      PPO.drawPug(ctx, sx, sy, size, Object.assign({
        pug: this.entry.pug, pose, phase: this.phase, speed: sp, t: t + this.wph, number: this.entry.number,
        expr: this.expr, sparkle: true,
      }, extra || {}));
    }
  }

  /* ===== レース共通（100m / 110mH / 400m / リレー） ===== */
  class RaceBase extends Competition {
    constructor(eventId, cx, o) {
      super(eventId, cx);
      this.distance = o.distance;
      this.theme = o.theme;
      this.stage = new PPO.Stage(o.theme);
      this.state = 'intro';
      this.stateT = 0;
      this.raceT = 0;
      this.falseStarts = 0;
      this.gunDelay = 0;
      this.tap = new PPO.TapRunner({ idealCadence: this.diff.idealCadence });
      this.maxSpeed = (o.maxSpeed || 11.6) * this.st.speed;
      this.player = new Athlete(this.entry, { maxSpeed: this.maxSpeed, lane: 0 });
      this.athletes = [this.player];
      this.cpus.forEach((c, i) => {
        const a = new Athlete(c, { maxSpeed: (o.maxSpeed || 11.6) * (PPO.PUGS[c.pug].stats.speed), lane: i + 1 });
        a.skill = c.skill;
        this.athletes.push(a);
      });
      this.camX = -3;
      this.reaction = null;
      this.topSpeed = 0;
      this.afterFinishT = 0;
      this.resultSent = false;
      this.introDur = 1.4;
    }
    controls() {
      return [{ id: 'L', label: 'ひだり', sub: '交互にタップ', cls: 'run' }, 'spacer', { id: 'R', label: 'みぎ', sub: '交互にタップ', cls: 'run' }];
    }
    start() {
      Sound.playBGM('event');
      this.resetStart();
    }
    resetStart() {
      this.state = 'intro';
      this.stateT = 0;
      this.raceT = 0;
      this.tap.reset();
      this.athletes.forEach((a) => {
        a.body.x = 0; a.body.v = 0; a.pose = 'idle'; a.finished = false; a.finishTime = null; a.react = null; a.stamina = 1;
        a.body.cap = 1;
        if (!a.isPlayer) this.cpuInit(a);
      });
      this.gunDelay = U.rand(1.0, 2.3);
      this.fx.banner('位置について', '#fff', 1.2, 0.75);
      this.stage.excite = 0.15;
    }
    cpuInit(a) {
      a.react = 0.115 + (1 - a.skill) * 0.9 * U.rand(0.5, 1.1);
      a.cpuRatio = a.skill;
    }
    // CPUのテンポ比（競技ごとに上書き可）
    cpuRatio(a, t) {
      if (t < a.react) return 0;
      const ramp = U.clamp((t - a.react) / 0.7 + 0.35, 0, 1);
      return U.clamp(a.cpuRatio * (1 + 0.02 * Math.sin(t * 1.9 + a.wph)), 0, 1) * ramp;
    }
    onInput(id, phase, tms) {
      if (phase !== 'down') return;
      if (id === 'L' || id === 'R') {
        if (this.state === 'set') { this.falseStart(); return; }
        if (this.state === 'intro') { this.hint('合図があるまで待ってね', 1.2); return; }
        if (this.state === 'run' && !this.player.finished) this.playerTap(id, tms);
      } else {
        this.onAction(id, tms);
      }
    }
    playerTap(id, tms) {
      if (!this.canRun()) return;
      if (this.reaction == null) this.reaction = this.raceT;
      const ok = this.tap.tap(id, tms);
      if (!ok && this.tap.sameTaps % 3 === 1) this.hint('左右交互にタップ！', 1.2);
      Input.highlight(this.tap.nextSide());
    }
    canRun() { return true; }
    onAction() {}
    falseStart() {
      this.falseStarts++;
      Sound.play('whistle');
      Engine.vibrate(200);
      if (this.falseStarts >= 2) {
        this.fx.banner('フライング失格…', '#ff6b6b', 2.2, 0.8);
        this.state = 'dq';
        this.stateT = 0;
        this.player.pose = 'sad';
        Sound.play('sad');
      } else {
        this.fx.banner('フライング！', '#ff6b6b', 1.6, 0.9);
        this.hint('次にフライングすると失格', 2.5);
        this.state = 'restart';
        this.stateT = 0;
      }
    }
    update(dt) {
      super.update(dt);
      this.stateT += dt;
      this.stage.update(dt);
      const now = performance.now();
      switch (this.state) {
        case 'intro':
          this.athletes.forEach((a) => { a.pose = 'idle'; });
          if (this.stateT > this.introDur) { this.state = 'set'; this.stateT = 0; this.fx.banner('よーい', '#ffd84f', 1.0, 0.8); Sound.play('beep'); }
          break;
        case 'set':
          this.athletes.forEach((a) => { a.pose = 'set'; });
          if (this.stateT > this.gunDelay) {
            this.state = 'run'; this.stateT = 0; this.raceT = 0;
            Sound.play('pistol');
            this.fx.banner('ドン！', '#fff', 0.8, 1.1);
            this.fx.flash = 0.6;
            this.stage.excite = 0.7;
            Input.highlight('L');
            this.hint('左右交互にタップ！', 2.5);
          }
          break;
        case 'restart':
          if (this.stateT > 1.6) this.resetStart();
          break;
        case 'dq':
          if (this.stateT > 2.4 && !this.resultSent) { this.resultSent = true; this.sendResult(true); }
          break;
        case 'run':
          this.raceT += dt;
          this.updateRun(dt, now);
          break;
        default: break;
      }
      this.updateCamera(dt);
    }
    updateRun(dt, now) {
      this.athletes.forEach((a) => {
        if (a.isPlayer) this.updatePlayer(a, dt, now);
        else this.updateCPU(a, dt);
        a.stepAnim(dt);
        if (!a.finished && a.body.x >= this.distance) {
          a.finished = true;
          const over = (a.body.x - this.distance) / Math.max(0.1, a.body.v);
          a.finishTime = this.raceT - over;
          if (a.isPlayer) this.onPlayerFinish();
        }
      });
      if (this.player.finished) {
        this.afterFinishT += dt;
        const allDone = this.athletes.every((a) => a.finished);
        if ((allDone && this.afterFinishT > 2.6) || this.afterFinishT > 4.0) {
          if (!this.resultSent) { this.resultSent = true; this.sendResult(false); }
        }
      }
    }
    updatePlayer(a, dt, now) {
      if (a.finished) {
        a.body.update(dt, 0);
        a.pose = a.body.v > 1 ? 'auto' : (a.celebrate || 'idle');
        return;
      }
      const ratio = this.playerRatio(now);
      a.body.update(dt, ratio);
      this.topSpeed = Math.max(this.topSpeed, a.body.v);
      a.pose = 'auto';
    }
    playerRatio(now) { return this.tap.ratio(now); }
    updateCPU(a, dt) {
      if (a.finished) {
        a.body.update(dt, 0);
        a.pose = a.body.v > 1 ? 'auto' : 'idle';
        return;
      }
      a.body.update(dt, this.cpuRatio(a, this.raceT, dt));
      a.pose = 'auto';
    }
    onPlayerFinish() {
      const p = this.player;
      Sound.play('goal');
      Input.highlight(null);
      this.fx.banner(PPO.Score.fmt(this.eventId, p.finishTime) + ' 秒', '#ffd84f', 2.4, 1.1);
      const place = 1 + this.athletes.filter((a) => a !== p && a.finished && a.finishTime < p.finishTime).length;
      const prev = PPO.Save.data.records[this.eventId].best;
      const isPB = prev == null || p.finishTime < prev;
      p.celebrate = place === 1 || isPB ? 'joy' : place >= 4 ? 'sad' : 'idle';
      p.expr = null;
      this.stage.excite = 1;
      if (place === 1) { Sound.play('bark'); Sound.play('cheer'); }
    }
    // まだゴールしていないCPUは現在の速度からゴールタイムを推定
    estimateRemaining() {
      this.athletes.forEach((a) => {
        if (!a.finished) {
          const v = Math.max(3, a.body.v);
          a.finishTime = this.raceT + (this.distance - a.body.x) / v;
          a.finished = true;
        }
      });
    }
    sendResult(dq) {
      if (!dq) this.estimateRemaining();
      const standings = this.athletes.map((a) => ({
        id: a.entry.id, name: a.entry.name, pug: a.entry.pug, levelName: a.entry.levelName, isPlayer: a.isPlayer,
        value: a.isPlayer && dq ? null : a.finishTime, dq: a.isPlayer && dq,
      }));
      const details = [];
      if (!dq) {
        if (this.reaction != null) details.push('スタート反応：' + this.reaction.toFixed(3) + '秒');
        details.push('最高速度：' + (this.topSpeed * 3.6).toFixed(1) + 'km/h');
        if (this.tap.sameTaps > 5) details.push('同じボタンの連打：' + this.tap.sameTaps + '回（交互に押すと速い！）');
      }
      this.extraDetails(details);
      this.finish({ value: dq ? null : this.player.finishTime, dq, reason: dq ? 'フライング失格' : null, standings, details });
    }
    extraDetails() {}

    // ---- 描画 ----
    layout(W, H) {
      const v = Engine.view();
      const lanes = this.athletes.length;
      const ppm = v.portrait ? W / 9.5 : W / 15;
      const groundY = v.portrait ? v.playH - Math.max(24, v.playH * 0.06) : Math.min(H - v.controlsH * 0.25 - 14, v.playH * 0.97);
      const laneGap = v.portrait ? Math.min(v.pugSize * 0.5, v.playH * 0.075) : Math.min(v.pugSize * 0.34, v.playH * 0.065);
      const trackTop = groundY - laneGap * (lanes - 0.5) - 6;
      const standsBottom = trackTop - Math.max(16, laneGap * 0.8);
      const standsTop = v.portrait ? Math.max(v.playH * 0.16, standsBottom - v.playH * 0.36) : Math.max(56, standsBottom - v.playH * 0.42);
      return { W, H, v, ppm, groundY, laneGap, trackTop, standsTop, standsBottom, camX: this.camX, lanes, size: v.pugSize };
    }
    updateCamera(dt) {
      const W = Engine.W;
      const ppm = this._ppm || W / 10;
      const target = this.cameraTarget() - (W / ppm) * 0.3;
      this.camX += (target - this.camX) * Math.min(1, dt * 6);
    }
    cameraTarget() { return this.player.body.x; }
    laneY(L, k) { return L.groundY - k * L.laneGap; }
    laneScale(k) { return 1 - k * 0.055; }
    sx(L, x) { return (x - L.camX) * L.ppm; }

    draw(ctx, W, H) {
      const L = this.layout(W, H);
      this._ppm = L.ppm;
      this.stage.drawBack(ctx, L);
      this.stage.drawTrack(ctx, L, L.lanes, L.laneGap);
      this.drawLines(ctx, L);
      // 奥のレーンから順に描画
      for (let k = L.lanes - 1; k >= 0; k--) {
        const a = this.athletes[k];
        const y = this.laneY(L, k);
        const sc = this.laneScale(k);
        this.drawLaneObjects(ctx, L, k, y, sc, 'back');
        this.drawAthlete(ctx, L, a, k, y, sc);
        this.drawLaneObjects(ctx, L, k, y, sc, 'front');
      }
      this.fx.drawWorld(ctx, L.camX, L.ppm);
      this.drawStarter(ctx, L);
      this.drawHUD(ctx, L);
      this.drawHint(ctx, W, Math.max(L.standsTop + 34, 130));
    }
    drawAthlete(ctx, L, a, k, y, sc) {
      a.draw(ctx, this.sx(L, a.body.x), y, L.size * sc, this.t, this.athleteExtra(a));
      if (a.isPlayer && this.state !== 'run') {
        Draw.text(ctx, '▼あなた', this.sx(L, a.body.x) + L.size * 0.1, y - L.size * 1.05, Math.max(14, L.size * 0.16), '#ffd84f', 'center', 3);
      }
    }
    athleteExtra() { return null; }
    drawLaneObjects() {}
    drawStarter(ctx, L) {
      // スターター（審判パグ）
      const x = this.sx(L, -2.6);
      if (x < -80) return;
      const y = L.standsBottom + (L.trackTop - L.standsBottom) * 0.9;
      const s = L.size * 0.7;
      PPO.drawPug(ctx, x, y, s, { pug: 'silver', pose: 'idle', t: this.t, bib: false, flip: false });
      ctx.fillStyle = '#ec4646';
      ctx.fillRect(x + s * 0.15, y - s * 1.0, s * 0.42, s * 0.12);
      ctx.fillRect(x + s * 0.2, y - s * 1.12, s * 0.32, s * 0.14);
      if (this.state === 'run' && this.raceT < 0.5) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.arc(x + s * 0.7, y - s * 0.9, s * 0.25 * (1 + this.raceT * 4), 0, 7); ctx.fill();
      }
    }
    drawLines(ctx, L) {
      const top = L.trackTop, bot = L.groundY + L.laneGap * 0.5;
      // スタートライン
      const s = this.sx(L, 0.35);
      if (s > -20 && s < L.W + 20) { ctx.fillStyle = '#fff'; ctx.fillRect(s - 3, top, 6, bot - top); }
      // 10mごとの距離表示
      const step = this.distance > 150 ? 50 : 10;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let m = step; m < this.distance; m += step) {
        const x = this.sx(L, m);
        if (x < -40 || x > L.W + 40) continue;
        ctx.fillRect(x - 1.5, top, 3, bot - top);
        Draw.text(ctx, m + 'm', x, L.trackTop - 8, 15, '#fff', 'center', 3);
      }
      // ゴール（チェッカー）
      const g = this.sx(L, this.distance);
      if (g > -30 && g < L.W + 30) {
        const sq = 8;
        for (let y = top, i = 0; y < bot; y += sq, i++) {
          ctx.fillStyle = i % 2 ? '#111' : '#fff'; ctx.fillRect(g - sq, y, sq, sq);
          ctx.fillStyle = i % 2 ? '#fff' : '#111'; ctx.fillRect(g, y, sq, sq);
        }
        ctx.fillStyle = '#fff';
        ctx.fillRect(g - 3, L.standsBottom - 60, 6, top - L.standsBottom + 60);
        Draw.panel(ctx, g - 40, L.standsBottom - 80, 80, 28, '#ec4646', 8);
        Draw.text(ctx, 'GOAL', g, L.standsBottom - 66, 18, '#fff', 'center', 2);
      }
    }
    drawHUD(ctx, L) {
      const W = L.W, sz = Math.min(44, W * 0.1);
      const top = (L.v.portrait ? 12 : 8) + (Engine.safeTop || 0);
      // タイム
      const tStr = (this.state === 'run' || this.player.finished ? (this.player.finished ? this.player.finishTime : this.raceT) : 0).toFixed(2);
      Draw.panel(ctx, 10, top, sz * 3.6, sz * 1.25, 'rgba(10,20,50,0.7)', 14);
      Draw.text(ctx, tStr, 10 + sz * 3.4, top + sz * 0.66, sz, '#fff', 'right', 4);
      Draw.text(ctx, this.ev.short, 18, top + sz * 0.3, sz * 0.32, '#ffd84f', 'left', 2);
      // ミニマップ
      const mx = 10, my = top + sz * 1.45, mw = Math.min(W - 80, 420), mh = 12;
      Draw.panel(ctx, mx, my - 8, mw, mh + 16, 'rgba(10,20,50,0.6)', 10);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(mx + 12, my + 4, mw - 24, 4);
      for (let i = this.athletes.length - 1; i >= 0; i--) {
        const a = this.athletes[i];
        const px = mx + 12 + (mw - 24) * U.clamp(a.body.x / this.distance, 0, 1);
        ctx.beginPath(); ctx.arc(px, my + 6, a.isPlayer ? 8 : 5.5, 0, 7);
        ctx.fillStyle = PPO.PUGS[a.entry.pug].col.fur; ctx.fill();
        ctx.lineWidth = a.isPlayer ? 3 : 1.5; ctx.strokeStyle = a.isPlayer ? '#ffd84f' : '#111'; ctx.stroke();
      }
      // スピードメーター
      if (this.state === 'run') {
        const gw = Math.min(180, W * 0.36), gx = W - gw - 70, gy = top + 10;
        const r = this.player.body.v / this.maxSpeed;
        Draw.gauge(ctx, gx, gy, gw, 18, r, r > 0.95 ? '#ff5a3c' : '#4ad66d', 'SPEED');
        this.drawExtraHUD(ctx, L, gx, gy + 30, gw);
      }
    }
    drawExtraHUD() {}
  }

  PPO.Competition = Competition;
  PPO.Athlete = Athlete;
  PPO.RaceBase = RaceBase;
})();
