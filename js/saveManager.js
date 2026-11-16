/* セーブデータ管理（LocalStorage・破損対策つき） */
(function () {
  'use strict';
  const PPO = (window.PPO = window.PPO || {});

  const KEY = 'pugpugOlympic.save.v1';
  const BACKUP_KEY = 'pugpugOlympic.save.backup';
  const CORRUPT_KEY = 'pugpugOlympic.save.corrupt';
  const EVENT_IDS = ['sprint100', 'hurdles110', 'longJump', 'javelin', 'highJump', 'run400', 'relay'];
  const PUG_IDS = ['fawn', 'black', 'white', 'silver', 'apricot'];
  const DEFAULT_UNLOCKED = ['fawn', 'black', 'apricot'];

  function defaults() {
    const records = {};
    EVENT_IDS.forEach((id) => { records[id] = { best: null, pug: null, date: null, plays: 0 }; });
    return {
      version: 1,
      selectedPug: 'fawn',
      difficulty: 'normal',
      records,
      worldRecords: {},          // プレイヤーがパグ世界記録を更新した場合のみ入る
      medals: { gold: 0, silver: 0, bronze: 0 },
      tournament: { played: 0, wins: 0, podiums: 0, bestRank: null, history: [] },
      unlocked: DEFAULT_UNLOCKED.slice(),
      sound: { bgm: 0.55, sfx: 0.8, muted: false },
      settings: { vibration: true, hints: true },
      tournamentInProgress: null,
      stats: { totalPlays: 0 },
    };
  }

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const clamp01 = (v, d) => (isNum(v) ? Math.max(0, Math.min(1, v)) : d);

  // 読み込んだデータを型チェックしながら既定値にマージする
  function sanitize(raw) {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    if (PUG_IDS.includes(raw.selectedPug)) d.selectedPug = raw.selectedPug;
    if (['easy', 'normal', 'hard'].includes(raw.difficulty)) d.difficulty = raw.difficulty;
    if (raw.records && typeof raw.records === 'object') {
      EVENT_IDS.forEach((id) => {
        const r = raw.records[id];
        if (r && typeof r === 'object') {
          d.records[id].best = isNum(r.best) && r.best > 0 ? r.best : null;
          d.records[id].pug = PUG_IDS.includes(r.pug) ? r.pug : null;
          d.records[id].date = typeof r.date === 'string' ? r.date.slice(0, 32) : null;
          d.records[id].plays = isNum(r.plays) && r.plays >= 0 ? Math.floor(r.plays) : 0;
        }
      });
    }
    if (raw.worldRecords && typeof raw.worldRecords === 'object') {
      EVENT_IDS.forEach((id) => { if (isNum(raw.worldRecords[id]) && raw.worldRecords[id] > 0) d.worldRecords[id] = raw.worldRecords[id]; });
    }
    if (raw.medals && typeof raw.medals === 'object') {
      ['gold', 'silver', 'bronze'].forEach((k) => { if (isNum(raw.medals[k]) && raw.medals[k] >= 0) d.medals[k] = Math.floor(raw.medals[k]); });
    }
    if (raw.tournament && typeof raw.tournament === 'object') {
      const t = raw.tournament;
      ['played', 'wins', 'podiums'].forEach((k) => { if (isNum(t[k]) && t[k] >= 0) d.tournament[k] = Math.floor(t[k]); });
      if (isNum(t.bestRank) && t.bestRank >= 1) d.tournament.bestRank = Math.floor(t.bestRank);
      if (Array.isArray(t.history)) {
        d.tournament.history = t.history.filter((h) => h && typeof h === 'object' && isNum(h.rank)).slice(-20)
          .map((h) => ({ rank: h.rank, points: isNum(h.points) ? h.points : 0, mode: h.mode === 'full' ? 'full' : 'short', date: typeof h.date === 'string' ? h.date.slice(0, 32) : '', pug: PUG_IDS.includes(h.pug) ? h.pug : 'fawn', difficulty: ['easy', 'normal', 'hard'].includes(h.difficulty) ? h.difficulty : 'normal' }));
      }
    }
    if (Array.isArray(raw.unlocked)) {
      const u = raw.unlocked.filter((p) => PUG_IDS.includes(p));
      d.unlocked = Array.from(new Set(DEFAULT_UNLOCKED.concat(u)));
    }
    if (!d.unlocked.includes(d.selectedPug)) d.selectedPug = 'fawn';
    if (raw.sound && typeof raw.sound === 'object') {
      d.sound.bgm = clamp01(raw.sound.bgm, d.sound.bgm);
      d.sound.sfx = clamp01(raw.sound.sfx, d.sound.sfx);
      d.sound.muted = !!raw.sound.muted;
    }
    if (raw.settings && typeof raw.settings === 'object') {
      d.settings.vibration = raw.settings.vibration !== false;
      d.settings.hints = raw.settings.hints !== false;
    }
    if (raw.tournamentInProgress && typeof raw.tournamentInProgress === 'object') {
      d.tournamentInProgress = raw.tournamentInProgress; // 中身は tournament.js 側で検証
    }
    if (raw.stats && isNum(raw.stats.totalPlays)) d.stats.totalPlays = Math.max(0, Math.floor(raw.stats.totalPlays));
    return d;
  }

  function storageOK() {
    try {
      const k = '__ppo_test__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  const SaveManager = {
    data: defaults(),
    available: true,
    loadWarning: null,

    load() {
      this.available = storageOK();
      if (!this.available) {
        this.loadWarning = 'この環境では記録を保存できません（プライベートモード等）。';
        this.data = defaults();
        return this.data;
      }
      let text = null;
      try { text = localStorage.getItem(KEY); } catch (e) { text = null; }
      if (!text) { this.data = defaults(); return this.data; }
      try {
        this.data = sanitize(JSON.parse(text));
      } catch (e) {
        // 破損：退避してバックアップから復元を試みる
        try { localStorage.setItem(CORRUPT_KEY, text); } catch (e2) { /* noop */ }
        let restored = null;
        try {
          const b = localStorage.getItem(BACKUP_KEY);
          if (b) restored = sanitize(JSON.parse(b));
        } catch (e3) { restored = null; }
        this.data = restored || defaults();
        this.loadWarning = restored ? 'セーブデータが壊れていたため、バックアップから復元しました。' : 'セーブデータが読み込めなかったため、初期状態で開始します。';
        this.save();
      }
      return this.data;
    },

    save() {
      if (!this.available) return false;
      try {
        const text = JSON.stringify(this.data);
        const prev = localStorage.getItem(KEY);
        if (prev) localStorage.setItem(BACKUP_KEY, prev);
        localStorage.setItem(KEY, text);
        return true;
      } catch (e) {
        this.loadWarning = '記録の保存に失敗しました（容量不足の可能性）。';
        return false;
      }
    },

    reset() {
      const keepSound = this.data.sound;
      this.data = defaults();
      this.data.sound = keepSound;
      try {
        localStorage.removeItem(BACKUP_KEY);
        localStorage.removeItem(CORRUPT_KEY);
      } catch (e) { /* noop */ }
      this.save();
    },

    EVENT_IDS,
    PUG_IDS,
    defaults,
    sanitize,
  };

  PPO.Save = SaveManager;
})();
