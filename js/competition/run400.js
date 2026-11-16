/* 競技⑥ 400m走（スタミナとペース配分） */
(function () {
  'use strict';
  const PPO = window.PPO;
  const U = PPO.U, Draw = PPO.Draw, Sound = PPO.Sound;

  const DRAIN = 0.05;       // 全力時のスタミナ消費（/秒）
  const LOW = 0.45;         // これを下回ると失速が始まる
  const FLOOR = 0.45;       // スタミナ0のときの速度上限（比率）

  // スタミナモデル（プレイヤー・CPU共通）
  function staminaStep(a, dt, staminaStat) {
    const r = a.body.v / a.body.maxSpeed;
    const drain = (DRAIN * Math.pow(r, 4)) / staminaStat; // 速く走るほど急激に消耗
    a.stamina = Math.max(0, a.stamina - drain * dt);
    if (r < 0.55) a.stamina = Math.min(1, a.stamina + 0.012 * dt);
    a.body.cap = a.stamina >= LOW ? 1 : FLOOR + (1 - FLOOR) * (a.stamina / LOW);
  }

  class Run400 extends PPO.RaceBase {
    constructor(cx) {
      super('run400', cx, { distance: 400, theme: 'sunset', maxSpeed: 11.6 });
      this.introDur = 1.2;
      this.splits = [];
    }
    cpuInit(a) {
      super.cpuInit(a);
      // 能力ごとのペース戦略
      const lv = a.entry.level;
      // 初心者：飛ばしすぎて後半失速 ／ 上級者ほど理想的なペース配分＋ラストスパート
      a.plan = lv === 'beginner' ? { open: 1.0, openUntil: 150, cruise: 0.76, kick: 330 }
        : lv === 'intermediate' ? { open: 0.9, openUntil: 60, cruise: 0.78, kick: 300 }
          : lv === 'advanced' ? { open: 0.9, openUntil: 50, cruise: 0.8, kick: 270 }
            : { open: 0.88, openUntil: 40, cruise: 0.8, kick: 250 };
    }
    cpuRatio(a, t) {
      if (t < a.react) return 0;
      const ramp = U.clamp((t - a.react) / 0.7 + 0.35, 0, 1);
      const p = a.plan;
      let r = a.body.x < p.openUntil ? p.open : p.cruise;
      if (a.body.x > p.kick) r = 1; // ラストスパート
      r *= Math.pow(a.skill, 1.3);
      return U.clamp(r * (1 + 0.01 * Math.sin(t * 0.9 + a.wph)), 0, 1) * ramp;
    }
    updatePlayer(a, dt, now) {
      super.updatePlayer(a, dt, now);
      if (!a.finished) {
        staminaStep(a, dt, this.st.stamina);
        if (a.stamina < LOW * 0.7) a.pose = 'tired';
        const m = Math.floor(a.body.x / 100);
        if (m > this.splits.length && m <= 3) {
          this.splits.push(this.raceT);
          this.fx.text(PPO.Engine.W / 2, PPO.Engine.view().playH * 0.3, `${m * 100}m  ${this.raceT.toFixed(1)}秒`, '#fff', 24);
        }
        if (this.hints) {
          const r = a.body.v / a.body.maxSpeed;
          if (a.body.x > 30 && a.body.x < 240 && r > 0.9 && a.stamina < 0.8) this.hint('飛ばしすぎ！ペースを落とそう', 1);
          if (a.body.x > 250 && a.body.x < 300) this.hint('ラストスパート！全力で！', 1);
        }
      }
    }
    updateCPU(a, dt) {
      super.updateCPU(a, dt);
      if (!a.finished) {
        staminaStep(a, dt, PPO.PUGS[a.entry.pug].stats.stamina);
        if (a.stamina < LOW) a.pose = 'tired';
      }
    }
    drawExtraHUD(ctx, L, x, y, w) {
      const s = this.player.stamina;
      Draw.gauge(ctx, x, y, w, 18, s, s < LOW ? '#ff5a3c' : s < 0.55 ? '#ffc21a' : '#3fa9ff', 'STAMINA');
      // ペースメーター（緑＝巡航ゾーン）
      const r = this.player.body.v / this.player.body.maxSpeed;
      const py = y + 30;
      Draw.gauge(ctx, x, py, w, 14, r, '#ffffff', null, this.diff.aid ? [{ from: 0.78, to: 0.86, col: 'rgba(60,230,110,0.9)' }] : null);
      Draw.text(ctx, 'PACE', x - 8, py + 7, 13, '#fff', 'right', 3);
    }
    extraDetails(d) {
      if (this.splits.length) d.push('通過：' + this.splits.map((s, i) => `${(i + 1) * 100}m ${s.toFixed(1)}秒`).join(' / '));
      d.push('ゴール時のスタミナ：' + Math.round(this.player.stamina * 100) + '%');
    }
  }

  PPO.Run400Model = { staminaStep, DRAIN, LOW };
  PPO.registerCompetition('run400', {
    create: (cx) => new Run400(cx),
    howto: `
      <h3>🎯 目標</h3><p>トラック1周400m。スピードとスタミナの勝負！</p>
      <h3>🕹 操作</h3>
      <ol>
        <li>「ひだり」「みぎ」交互タップで走る</li>
        <li><b>タップの速さでペースを調整</b>する</li>
      </ol>
      <h3>💡 コツ</h3>
      <ul>
        <li>速く走るほど<b>スタミナゲージ</b>が減る</li>
        <li>スタミナが45%を切ると疲れて<b>失速</b>…</li>
        <li>最初から全力だと後半にバテる！</li>
        <li>PACEメーターの<b>緑のゾーン</b>（8割くらい）で巡航し、残り150mから全力スパート</li>
      </ul>`,
  });
})();
