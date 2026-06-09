/**
 * 《反着来》API 客户端
 * 同源 API 客户端。供页面功能和调试工具复用。
 *
 * @author 四个菜鸟想上天团队
 *
 * [未使用] fetchAIQuestionBatch() — AI神经挑战已从首页移除
 * [未使用] getDailyChallenge() — 每日挑战已从首页移除
 */
(function () {
  'use strict';

  var API_BASE = '';  // 同源请求，Flask 托管时无 CORS 问题

  // ── 获取题目（核心接口）────────────────────────────
  function fetchQuestion(difficulty, excludeTypes, forceType, callback) {
    var url = API_BASE + '/api/generate-question';
    var body = {
      difficulty: difficulty || 1,
      exclude_types: excludeTypes || [],
      type: forceType || 'any'
    };

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      callback(null, data);
    })
    .catch(function (err) {
      callback(err, null);
    });
  }

  // ── 分析表现 ───────────────────────────────────
  function analyzePerformance(answers, callback) {
    fetch(API_BASE + '/api/analyze-performance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: answers })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) { callback(null, data); })
    .catch(function (err) { callback(err, null); });
  }

  // ── 生成分享文案 ───────────────────────────────
  function generateShareText(score, maxCombo, fastestMs, weakness, callback) {
    fetch(API_BASE + '/api/generate-share-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        score: score,
        max_combo: maxCombo,
        fastest_reaction_ms: fastestMs,
        weakness: weakness
      })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) { callback(null, data); })
    .catch(function (err) { callback(err, null); });
  }

  // ── 创建挑战 ───────────────────────────────────
  function createChallenge(playerName, score, questions, callback) {
    fetch(API_BASE + '/api/create-challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_name: playerName,
        score: score,
        questions: questions
      })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) { callback(null, data); })
    .catch(function (err) { callback(err, null); });
  }

  // ── 获取挑战 ───────────────────────────────────
  function getChallenge(code, callback) {
    fetch(API_BASE + '/api/challenge/' + encodeURIComponent(code))
      .then(function (res) { return res.json(); })
      .then(function (data) { callback(null, data); })
      .catch(function (err) { callback(err, null); });
  }

  function health(callback) {
    fetch(API_BASE + '/health')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) { callback(null, data); })
      .catch(function (err) { callback(err, null); });
  }

  function submitLeaderboard(entry, callback) {
    fetch(API_BASE + '/api/leaderboard/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_name: entry.playerName,
        score: entry.totalScore,
        max_combo: entry.maxCombo,
        fastest_reaction_ms: entry.fastestReaction === null ||
          entry.fastestReaction === undefined
          ? 999999
          : entry.fastestReaction,
        answers: entry.answers || []
      })
    })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) { callback(null, data); })
    .catch(function (err) { callback(err, null); });
  }

  function getLeaderboard(callback) {
    fetch(API_BASE + '/api/leaderboard/top')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) { callback(null, data); })
      .catch(function (err) { callback(err, null); });
  }

  // ── AI 批量出题 ───────────────────────────────
  function fetchAIQuestionBatch(count, difficulty, excludeTypes, onEach, onDone) {
    var fetched = [];
    var errors = 0;
    var done = false;
    var maxConcurrent = 3;

    function tryFetch() {
      if (done) return;
      if (fetched.length + errors >= count * 2) {
        // 所有请求已返回（含失败），结束
        finish();
        return;
      }
    }

    function finish() {
      if (done) return;
      done = true;
      onDone(fetched);
    }

    // 并发请求，每个题目独立获取
    var pending = 0;
    function next() {
      while (pending < maxConcurrent && fetched.length + errors + pending < count) {
        pending++;
        fetchQuestion(
          difficulty,
          excludeTypes || [],
          'any',
          (function () {
            var called = false;
            return function (err, question) {
              pending--;
              if (called) return;
              called = true;
              if (!err && question) {
                fetched.push(question);
                if (onEach) onEach(fetched.length, count);
              } else {
                errors++;
              }
              if (fetched.length >= count) {
                finish();
              } else if (fetched.length + errors >= count * 2) {
                finish();
              } else {
                next();
              }
            };
          })()
        );
      }
    }

    next();

    // 超时兜底（10 秒）
    setTimeout(function () {
      if (!done && fetched.length === 0) {
        finish();
      }
    }, 10000);
  }

  function getDailyChallenge(callback) {
    fetch(API_BASE + '/api/daily-challenge')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) { callback(null, data); })
      .catch(function (err) { callback(err, null); });
  }

  // 暴露到全局
  window.AppApi = {
    fetchQuestion: fetchQuestion,
    analyzePerformance: analyzePerformance,
    generateShareText: generateShareText,
    createChallenge: createChallenge,
    getChallenge: getChallenge,
    health: health,
    submitLeaderboard: submitLeaderboard,
    getLeaderboard: getLeaderboard,
    fetchAIQuestionBatch: fetchAIQuestionBatch,
    getDailyChallenge: getDailyChallenge
  };

  console.log('[反着来] API Client 加载完成，BASE =', API_BASE);

})();
