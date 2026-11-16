/* 競技⑦ 4×100mリレー */
(function () {
  'use strict';
  const PPO = window.PPO;
  const U = PPO.U, Draw = PPO.Draw, Sound = PPO.Sound, Engine = PPO.Engine, Input = PPO.Input;

  const ZONE = 10;       // 受け渡しゾーン：各100m地点の ±10m
  const CHECK = 7.5;     // 次走者がスタートするチェックマーク（ゾーン手前）
  const VMAX = 11.8;

  class Relay extends PPO.RaceBase {
    constructor(cx) {
      super('relay', cx, { distance: 400, theme: 'relay', maxSpeed: VMAX });
      const ids = Object.keys(PPO.PUGS);
      const mk = (pug, i, team, isPlayer) => {
        const e = { id: team + '_' + i, name: PPO.PUGS[pug].name, pug, number: team === 'p' ? i + 1 : 20 + i, isPlayer };
        const a = new PPO.Athlete(e, { maxSpeed: VMAX * PPO.PUGS[pug].stats.speed });
        a.isPlayer = false; // 足音は担当走者のみ
        return a;
      };
      const mine = [this.entry.pug].concat(ids.filter((p) => p !== this.entry.pug).slice(0, 3));
      this.teams = [{ entry: this.entry, isPlayer: true, runners: mine.map((p, i) => mk(p, i, 'p', true)) }];
      this.cpus.forEach((c, k) => {
        const pugs = [c.pug].concat(U.shuffle(ids.filter((p) => p !== c.pug)).slice(0, 3));
        const t = { entry: c, isPlayer: false, skill: c.skill, runners: pugs.map((p, i) => mk(p, i, 'c' + k, false)) };
        t.runners.forEach((r) => { r.skill = c.skill; });
        this.teams.push(t);
      });
      this.athletes = this.teams.map((t) => t.runners[0]);
      this.player = this.teams[0].runners[0];
      this.passLog = [];
      this.lockT = 0;
    }
    controls() {
      return [
        { id: 'L', label: 'ひだり', sub: '走る', cls: 'run' },
        { id: 'act', label: 'バトン', sub: 'わたす', cls: 'act', wide: true },
        { id: 'R', label: 'みぎ', sub: '走る', cls: 'run' },
      ];
    }
    get myTeam() { return this.teams[0]; }
    holder(t) { return t.runners[t.leg]; }
    resetStart() {
      super.resetStart();
      this.teams.forEach((t) => {
        t.leg = 0; t.finished = false; t.finishTime = null; t.fumbles = 0;
        t.runners.forEach((r, i) => {
          r.body.x = i === 0 ? 0 : i * 100 - ZONE; r.body.v = 0; r.body.cap = 1;
          r.state = i === 0 ? 'hold' : 'wait'; r.pose = 'idle'; r.fallT = 0; r.finished = false;
          if (!t.isPlayer) { r.skill = t.skill; this.cpuInit(r); }
        });
        if (!t.isPlayer) this.planPass(t);
      });
      this.player = this.myTeam.runners[0];
      this.passLog = [];
    }
    planPass(t) {
      const s = t.skill;
      const r = Math.random();
      t.passGap = r < s * s ? U.rand(0.6, 1.2) : r < 1 - (1 - s) * 0.35 ? U.rand(1.3, 1.65) : 99; // 99 = 受け渡しミス
    }
    canRun() { const h = this.holder(this.myTeam); return h.fallT <= 0; }
    onAction(id) {
      if (id !== 'act' || this.state !== 'run') return;
      const t = this.myTeam;
      if (t.leg >= 3 || t.finished || this.lockT > 0) return;
      const h = this.holder(t), n = t.runners[t.leg + 1];
      if (n.state !== 'go') { this.hint('次の走者がスタートしてから！', 1); return; }
      const gap = n.body.x - h.body.x;
      if (gap > 1.75) {
        this.lockT = 0.3;
        Sound.play('buzz');
        this.fx.text(Engine.W / 2, Engine.view().playH * 0.3, 'とどかない！', '#ff8a8a', 26);
        return;
      }
      if (gap < 0.25) {
        h.body.v *= 0.9;
        this.fx.text(Engine.W / 2, Engine.view().playH * 0.3, 'ちかすぎ！', '#ff8a8a', 26);
        this.doPass(t, 'good');
        return;
      }
      const q = gap >= 0.55 && gap <= 1.25 ? 'perfect' : 'good';
      this.doPass(t, q);
    }
    doPass(t, q) {
      const h = this.holder(t), n = t.runners[t.leg + 1];
      if (q === 'perfect') n.body.v = Math.max(n.body.v, h.body.v * 0.99);
      else if (q === 'good') n.body.v = Math.max(n.body.v * 0.96, h.body.v * 0.88);
      else { n.body.v *= 0.35; n.fallT = 0.7; t.fumbles++; }
      h.state = 'done';
      n.state = 'hold';
      t.leg++;
      if (t.isPlayer) {
        this.player = n;
        this.passLog.push(q);
        if (q === 'perfect') { Sound.play('perfect'); this.fx.text(Engine.W / 2, Engine.view().playH * 0.3, 'バトンパス PERFECT!', '#ffd84f', 28); }
        else if (q === 'good') { Sound.play('baton'); this.fx.text(Engine.W / 2, Engine.view().playH * 0.3, 'バトンパス OK', '#7fe0ff', 26); }
        else { Sound.play('fall'); Engine.vibrate(150); this.fx.shake = 8; this.fx.text(Engine.W / 2, Engine.view().playH * 0.3, 'バトンミス！', '#ff6b6b', 30); }
        Input.highlight(this.tap.nextSide());
      } else if (t.leg < 3) {
        this.planPass(t);
      }
    }
    updateRun(dt, now) {
      if (this.lockT > 0) this.lockT -= dt;
      this.teams.forEach((t) => {
        t.runners.forEach((r, i) => {
          if (r.state === 'hold') {
            if (r.fallT > 0) {
              r.fallT -= dt; r.body.v = Math.max(0, r.body.v - 6 * dt); r.body.x += r.body.v * dt; r.pose = 'fall';
            } else {
              const ratio = t.isPlayer ? this.tap.ratio(now) : this.cpuRatio(r, this.raceT);
              r.body.update(dt, ratio);
              r.pose = 'auto';
              if (t.isPlayer) this.topSpeed = Math.max(this.topSpeed, r.body.v);
            }
            // 足音（担当走者のみ）
            r.isPlayer = t.isPlayer;
          } else if (r.state === 'wait') {
            const h = this.holder(t);
            r.pose = 'set';
            if (t.leg === i - 1 && h.body.x >= i * 100 - ZONE - CHECK) { r.state = 'go'; r.react = 0; }
          } else if (r.state === 'go') {
            const h = this.holder(t);
            const gap = r.body.x - h.body.x;
            r.body.update(dt, gap > 1.4 ? 0.72 : 1);
            r.pose = 'auto';
            const zEnd = i * 100 + ZONE;
            if (!t.isPlayer && t.passGap < 50 && gap <= t.passGap && gap > 0.2) this.doPass(t, gap <= 1.25 && gap >= 0.55 ? 'perfect' : 'good');
            else if (r.body.x >= zEnd && r.state === 'go') this.doPass(t, 'fumble');
            if (t.isPlayer && r.state === 'go' && gap <= 1.75 && gap > 0.25) Input.highlight('act');
          } else if (r.state === 'done') {
            r.body.update(dt, 0);
            r.pose = r.body.v > 1 ? 'auto' : 'idle';
            r.isPlayer = false;
          }
          r.stepAnim(dt);
        });
        const h = this.holder(t);
        if (!t.finished && t.leg === 3 && h.body.x >= 400) {
          t.finished = true;
          t.finishTime = this.raceT - (h.body.x - 400) / Math.max(0.1, h.body.v);
          h.finished = true; h.finishTime = t.finishTime;
          if (t.isPlayer) this.onTeamFinish(t);
        }
      });
      if (this.myTeam.finished) {
        this.afterFinishT += dt;
        const h = this.holder(this.myTeam);
        h.state = 'done';
        if (h.body.v < 1) h.pose = h.celebrate || 'idle';
        const all = this.teams.every((t) => t.finished);
        if ((all && this.afterFinishT > 2.6) || this.afterFinishT > 4) {
          if (!this.resultSent) { this.resultSent = true; this.sendResult(false); }
        }
      }
    }
    onTeamFinish(t) {
      const ft = t.finishTime;
      Sound.play('goal');
      Input.highlight(null);
      this.fx.banner(ft.toFixed(2) + ' 秒', '#ffd84f', 2.4, 1.1);
      const place = 1 + this.teams.filter((o) => o !== t && o.finished && o.finishTime < ft).length;
      const h = this.holder(t);
      h.celebrate = place === 1 ? 'joy' : place >= 4 ? 'sad' : 'idle';
      t.runners.forEach((r) => { if (r !== h) r.celebrate = h.celebrate; });
      this.stage.excite = 1;
      if (place === 1) { Sound.play('bark'); Sound.play('cheer'); }
    }
    cameraTarget() { return this.holder(this.myTeam).body.x; }
    sendResult(dq) {
      const standings = this.teams.map((t) => {
        if (!dq && !t.finished) {
          const h = this.holder(t);
          const remain = (3 - t.leg) * 100 + (100 * (t.leg + 1) - h.body.x);
          t.finishTime = this.raceT + Math.max(0, remain) / Math.max(4, h.body.v || 9);
          t.finished = true;
        }
        const e = t.entry;
        return {
          id: e.id, name: t.isPlayer ? 'チームあなた' : 'チーム' + e.name, pug: e.pug, levelName: e.levelName, isPlayer: t.isPlayer,
          value: t.isPlayer && dq ? null : t.finishTime, dq: t.isPlayer && dq,
        };
      });
      const details = [];
      if (!dq) {
        if (this.reaction != null) details.push('スタート反応：' + this.reaction.toFixed(3) + '秒');
        const c = (q) => this.passLog.filter((p) => p === q).length;
        details.push(`バトンパス：PERFECT ${c('perfect')} / OK ${c('good')} / ミス ${c('fumble')}`);
        details.push('メンバー：' + this.myTeam.runners.map((r) => r.entry.name).join(' → '));
      }
      this.finish({ value: dq ? null : this.myTeam.finishTime, dq, reason: dq ? 'フライング失格' : null, standings, details });
    }

    // ---- 描画 ----
    draw(ctx, W, H) {
      const L = this.layout(W, H);
      this._ppm = L.ppm;
      this.stage.drawBack(ctx, L);
      this.stage.drawTrack(ctx, L, L.lanes, L.laneGap);
      this.drawLines(ctx, L);
      this.drawZones(ctx, L);
      for (let k = L.lanes - 1; k >= 0; k--) {
        const t = this.teams[k];
        const y = this.laneY(L, k), sc = this.laneScale(k);
        // 後ろの走者から描く
        t.runners.slice().sort((a, b) => a.body.x - b.body.x).forEach((r) => {
          const x = this.sx(L, r.body.x);
          if (x < -L.size || x > L.W + L.size) return;
          const isHolder = r === this.holder(t);
          r.draw(ctx, x, y, L.size * sc, this.t, { item: isHolder ? 'baton' : null, alpha: r.state === 'done' && !isHolder ? 0.85 : 1 });
          if (t.isPlayer && isHolder && this.state === 'run' && !t.finished) {
            Draw.text(ctx, '▼', x + L.size * 0.15, y - L.size * 1.1, 18, '#ffd84f', 'center', 3);
          }
        });
      }
      this.fx.drawWorld(ctx, L.camX, L.ppm);
      this.drawStarter(ctx, L);
      this.drawHUD(ctx, L);
      this.drawPassGuide(ctx, L);
      this.drawHint(ctx, W, Math.max(L.standsTop + 34, 130));
    }
    drawZones(ctx, L) {
      const top = L.trackTop, bot = L.groundY + L.laneGap * 0.5;
      for (let i = 1; i <= 3; i++) {
        const z0 = this.sx(L, i * 100 - ZONE), z1 = this.sx(L, i * 100 + ZONE);
        if (z1 < -10 || z0 > L.W + 10) continue;
        ctx.fillStyle = 'rgba(255,230,80,0.16)'; ctx.fillRect(z0, top, z1 - z0, bot - top);
        ctx.fillStyle = '#ffd84f';
        ctx.fillRect(z0 - 2, top, 4, bot - top); ctx.fillRect(z1 - 2, top, 4, bot - top);
        const c = this.sx(L, i * 100 - ZONE - CHECK);
        for (let k = 0; k < L.lanes; k++) {
          const y = this.laneY(L, k) + L.laneGap * 0.3;
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(c, y - 8); ctx.lineTo(c + 6, y); ctx.lineTo(c - 6, y); ctx.fill();
        }
        Draw.text(ctx, `${i}→${i + 1}走`, (z0 + z1) / 2, L.standsBottom + 12, 15, '#ffd84f', 'center', 3);
      }
    }
    drawPassGuide(ctx, L) {
      const t = this.myTeam;
      if (this.state !== 'run' || t.leg >= 3 || t.finished) return;
      const h = this.holder(t), n = t.runners[t.leg + 1];
      if (n.state !== 'go') return;
      const gap = n.body.x - h.body.x;
      const inWin = gap <= 1.75 && gap > 0.25;
      const perfect = gap >= 0.55 && gap <= 1.25;
      const col = perfect ? '#3ce06e' : inWin ? '#ffd84f' : '#ffffff';
      const txt = perfect ? 'いまだ！バトン！' : inWin ? 'バトン！' : 'まだ…';
      Draw.text(ctx, txt, L.W / 2, L.trackTop - 30, Math.min(40, L.W * 0.08), col, 'center', 5);
    }
    drawHUD(ctx, L) {
      const t = this.myTeam;
      const W = L.W, sz = Math.min(44, W * 0.1), top = 12 + (Engine.safeTop || 0);
      const time = t.finished ? t.finishTime : this.state === 'run' ? this.raceT : 0;
      Draw.panel(ctx, 10, top, sz * 3.6, sz * 1.25, 'rgba(10,20,50,0.7)', 14);
      Draw.text(ctx, time.toFixed(2), 10 + sz * 3.4, top + sz * 0.66, sz, '#fff', 'right', 4);
      Draw.text(ctx, `第${t.leg + 1}走 ${this.holder(t).entry.name}`, 18, top + sz * 0.3, sz * 0.32, '#ffd84f', 'left', 2);
      const mx = 10, my = top + sz * 1.45, mw = Math.min(W - 80, 420);
      Draw.panel(ctx, mx, my - 8, mw, 28, 'rgba(10,20,50,0.6)', 10);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(mx + 12, my + 4, mw - 24, 4);
      for (let i = 1; i <= 3; i++) { ctx.fillStyle = '#ffd84f'; ctx.fillRect(mx + 12 + (mw - 24) * i / 4 - 1, my, 2, 12); }
      for (let i = this.teams.length - 1; i >= 0; i--) {
        const tm = this.teams[i];
        const px = mx + 12 + (mw - 24) * U.clamp(this.holder(tm).body.x / 400, 0, 1);
        ctx.beginPath(); ctx.arc(px, my + 6, tm.isPlayer ? 8 : 5.5, 0, 7);
        ctx.fillStyle = PPO.PUGS[this.holder(tm).entry.pug].col.fur; ctx.fill();
        ctx.lineWidth = tm.isPlayer ? 3 : 1.5; ctx.strokeStyle = tm.isPlayer ? '#ffd84f' : '#111'; ctx.stroke();
      }
      if (this.state === 'run') {
        const gw = Math.min(180, W * 0.36), gx = W - gw - 70, gy = top + 10;
        const h = this.holder(t);
        const r = h.body.v / h.body.maxSpeed;
        Draw.gauge(ctx, gx, gy, gw, 18, r, r > 0.95 ? '#ff5a3c' : '#4ad66d', 'SPEED');
      }
    }
  }

  PPO.registerCompetition('relay', {
    create: (cx) => new Relay(cx),
    howto: `
      <h3>🎯 目標</h3><p>4匹のパグでバトンをつないで400m！チームで世界一を目指せ。</p>
      <h3>🕹 操作</h3>
      <ol>
        <li>「ひだり」「みぎ」交互タップでバトンを持つ走者を走らせる</li>
        <li>次の走者はチェックマーク（白い▲）で自動でスタート</li>
        <li>追いついて<b>「いまだ！」</b>の表示が出たら<b>「バトン」をタップ</b></li>
      </ol>
      <h3>💡 コツ</h3>
      <ul>
        <li>ちょうどいい距離でわたすと<b>PERFECT</b>。スピードを落とさずにつながる</li>
        <li>黄色いゾーンをすぎるまでに渡せないと<b>バトンミス</b>で大きく減速</li>
        <li>はなれすぎていると「とどかない！」</li>
        <li>走者ごとに足の速さ（個性）がちがう</li>
      </ul>`,
  });
})();
