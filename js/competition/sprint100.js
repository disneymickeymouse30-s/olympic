/* 競技① 100m走 */
(function () {
  'use strict';
  const PPO = window.PPO;

  class Sprint100 extends PPO.RaceBase {
    constructor(cx) {
      super('sprint100', cx, { distance: 100, theme: 'day', maxSpeed: 11.8 });
    }
    // CPU：反応時間・加速・終盤のわずかな失速を能力ごとに再現
    cpuRatio(a, t) {
      if (t < a.react) return 0;
      const ramp = PPO.U.clamp((t - a.react) / 0.7 + 0.35, 0, 1);
      const late = a.body.x > 80 ? 1 - (1 - a.skill) * 0.25 : 1;
      return PPO.U.clamp(a.skill * late * (1 + 0.018 * Math.sin(t * 2.1 + a.wph)), 0, 1) * ramp;
    }
  }

  PPO.registerCompetition('sprint100', {
    create: (cx) => new Sprint100(cx),
    howto: `
      <h3>🎯 目標</h3><p>100mをいちばん速く走りぬけよう！</p>
      <h3>🕹 操作</h3>
      <ol>
        <li>「よーい」のあと、<b>ドン！</b>の合図を待つ</li>
        <li><b>「ひだり」「みぎ」を交互にタップ</b>して加速</li>
        <li>リズムよく速く交互に押すほどスピードアップ</li>
      </ol>
      <h3>💡 コツ</h3>
      <ul>
        <li>同じボタンの連打ではほとんど加速しない</li>
        <li>合図の前に押すと<b>フライング</b>。2回で失格</li>
        <li>光っているボタンが次に押す側</li>
      </ul>`,
  });
})();
