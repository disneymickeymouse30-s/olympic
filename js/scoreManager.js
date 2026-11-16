/* 競技データ・記録・ポイント・CPU選手の管理 */
(function () {
  'use strict';
  const PPO = (window.PPO = window.PPO || {});
  const U = PPO.U;

  // パグ世界記録（ゲーム内の公式目標値）。練習すれば届くように調整済み
  const EVENTS = {
    sprint100: { id: 'sprint100', name: '100m走', short: '100m', icon: '⚡', color: '#ffd84f', unit: '秒', kind: 'time', better: 'lower', wr: 9.80, decimals: 2 },
    hurdles110: { id: 'hurdles110', name: '110mハードル', short: '110mH', icon: '🚧', color: '#ffb05c', unit: '秒', kind: 'time', better: 'lower', wr: 11.45, decimals: 2 },
    longJump: { id: 'longJump', name: '走り幅跳び', short: '幅跳び', icon: '🏖', color: '#ffe1a8', unit: 'm', kind: 'distance', better: 'higher', wr: 8.60, decimals: 2 },
    javelin: { id: 'javelin', name: 'やり投げ', short: 'やり投げ', icon: '🎯', color: '#c6f0a8', unit: 'm', kind: 'distance', better: 'higher', wr: 90.00, decimals: 2 },
    highJump: { id: 'highJump', name: '走り高跳び', short: '高跳び', icon: '🌙', color: '#c8c8ff', unit: 'm', kind: 'height', better: 'higher', wr: 2.40, decimals: 2 },
    run400: { id: 'run400', name: '400m走', short: '400m', icon: '🔥', color: '#ffb0c8', unit: '秒', kind: 'time', better: 'lower', wr: 45.00, decimals: 2 },
    relay: { id: 'relay', name: '4×100mリレー', short: 'リレー', icon: '🎽', color: '#a8e6ff', unit: '秒', kind: 'time', better: 'lower', wr: 35.60, decimals: 2 },
  };
  const ORDER = ['sprint100', 'hurdles110', 'longJump', 'javelin', 'highJump', 'run400', 'relay'];

  const LEVELS = {
    beginner: { id: 'beginner', name: '初心者', skill: 0.80 },
    intermediate: { id: 'intermediate', name: '中級者', skill: 0.875 },
    advanced: { id: 'advanced', name: '上級者', skill: 0.935 },
    champion: { id: 'champion', name: '世界チャンピオン', skill: 0.97 },
  };
  const LINEUPS = {
    easy: ['beginner', 'beginner', 'beginner', 'intermediate', 'intermediate'],
    normal: ['beginner', 'intermediate', 'intermediate', 'advanced', 'advanced'],
    hard: ['intermediate', 'advanced', 'advanced', 'advanced', 'champion'],
  };
  const DIFF = {
    easy: { name: 'EASY', idealCadence: 7.0, window: 1.5, aid: true, desc: '判定がゆるく、CPUもやさしい。はじめての人向け。' },
    normal: { name: 'NORMAL', idealCadence: 8.0, window: 1.0, aid: true, desc: '標準的な難しさ。練習すれば上級者にも勝てる。' },
    hard: { name: 'HARD', idealCadence: 8.6, window: 0.62, aid: false, desc: 'タイミング判定がシビア。世界チャンピオンが出場。' },
  };
  const CPU_NAMES = ['マックス', 'チョコ', 'ハナ', 'モモ', 'ブン', 'ゴン', 'ラッキー', 'ココ', 'ペコ', 'ダイズ', 'コテツ', 'ポン太', 'きなこ', 'ジロー', 'オハギ', 'ミント'];
  const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];

  function fmt(eventId, v) {
    if (v == null || !isFinite(v)) return '—';
    const e = EVENTS[eventId];
    return v.toFixed(e.decimals);
  }
  function fmtU(eventId, v) {
    if (v == null || !isFinite(v)) return '記録なし';
    return fmt(eventId, v) + (EVENTS[eventId].unit === '秒' ? '秒' : 'm');
  }
  function isBetter(eventId, a, b) {
    if (a == null) return false;
    if (b == null) return true;
    return EVENTS[eventId].better === 'lower' ? a < b - 1e-9 : a > b + 1e-9;
  }

  const Score = {
    EVENTS, ORDER, LEVELS, LINEUPS, DIFF, POINTS, fmt, fmtU, isBetter,

    worldRecord(eventId) {
      const save = PPO.Save.data;
      const mine = save.worldRecords[eventId];
      const off = EVENTS[eventId].wr;
      if (mine != null && isBetter(eventId, mine, off)) return { value: mine, holder: 'あなた' };
      return { value: off, holder: '公式' };
    },

    // CPU選手のエントリーを作る（同じパグの毛色が偏らないように）
    makeCPUs(difficulty, playerPug, count) {
      const lineup = (LINEUPS[difficulty] || LINEUPS.normal).slice(0, count || 5);
      const names = U.shuffle(CPU_NAMES.slice());
      const pugIds = Object.keys(PPO.PUGS);
      return lineup.map((lv, i) => {
        const L = LEVELS[lv];
        const pug = pugIds[(i + pugIds.indexOf(playerPug) + 1) % pugIds.length];
        return {
          id: 'cpu' + i,
          name: lv === 'champion' ? 'キング' : names[i],
          pug,
          level: lv,
          levelName: L.name,
          skill: U.clamp(L.skill + U.randn() * 0.012, 0.6, 0.995),
          isPlayer: false,
          number: 10 + i * 7 + U.randi(0, 6),
        };
      });
    },
    playerEntry(pugId) {
      return { id: 'player', name: PPO.PUGS[pugId].name + '（あなた）', pug: pugId, level: 'player', levelName: 'あなた', isPlayer: true, number: 1 };
    },

    // 順位付け（ファウル・失格は最下位扱い）
    rank(eventId, entries) {
      const better = EVENTS[eventId].better;
      const arr = entries.slice();
      arr.sort((a, b) => {
        const av = a.value, bv = b.value;
        const ai = av == null || a.dq, bi = bv == null || b.dq;
        if (ai && bi) return 0;
        if (ai) return 1;
        if (bi) return -1;
        return better === 'lower' ? av - bv : bv - av;
      });
      let lastV = null, lastRank = 0;
      arr.forEach((e, i) => {
        if (e.value != null && !e.dq && lastV != null && Math.abs(e.value - lastV) < 1e-9) e.rank = lastRank;
        else { e.rank = i + 1; lastRank = i + 1; }
        lastV = e.dq ? null : e.value;
        e.points = e.value == null || e.dq ? 0 : POINTS[e.rank - 1] || 0;
      });
      return arr;
    },

    /* 競技終了時の記録処理。戻り値に自己ベスト・世界記録・メダル・解放情報 */
    commitResult(eventId, value, pugId, rank, opts) {
      const save = PPO.Save.data;
      const rec = save.records[eventId];
      const out = { pb: false, wr: false, prevBest: rec.best, medal: null, unlocked: [] };
      rec.plays++;
      save.stats.totalPlays++;
      if (value != null && isFinite(value)) {
        const wrBefore = this.worldRecord(eventId).value;
        if (isBetter(eventId, value, rec.best)) {
          rec.best = value; rec.pug = pugId; rec.date = new Date().toISOString().slice(0, 10);
          out.pb = true;
          out.firstRecord = out.prevBest == null;
        }
        if (isBetter(eventId, value, wrBefore)) {
          save.worldRecords[eventId] = value;
          out.wr = true;
        }
      }
      if (!(opts && opts.noMedal) && value != null && rank >= 1 && rank <= 3) {
        const k = ['gold', 'silver', 'bronze'][rank - 1];
        save.medals[k]++;
        out.medal = k;
      }
      out.unlocked = this.checkUnlocks();
      PPO.Save.save();
      return out;
    },

    checkUnlocks() {
      const save = PPO.Save.data;
      const got = [];
      Object.keys(PPO.UNLOCK_RULES).forEach((id) => {
        if (!save.unlocked.includes(id) && PPO.UNLOCK_RULES[id].check(save)) {
          save.unlocked.push(id);
          got.push(id);
        }
      });
      return got;
    },
  };

  PPO.Score = Score;
})();
