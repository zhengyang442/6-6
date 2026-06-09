(function (global) {
  "use strict";
  var OppositeGame = global.OppositeGame;
  var COLOR_DANGER = global.OppositeGameUI.COLOR_DANGER;
  var COLOR_PRIMARY = global.OppositeGameUI.COLOR_PRIMARY;

  // ═══════════════════════════════════════════════════
  //  在线 PK — Socket.IO 系统
  // ═══════════════════════════════════════════════════

  /**
   * 规范化服务端推送的题目格式（对齐 QuestionBank.normalizeQuestion 输出）。
   * 确保前端渲染代码无差别处理单人/联机题目。
   */
  function normalizeOnlineQuestion(q) {
    if (!q) return null;
    var options = (q.options || []).map(function (o) {
      return {
        id: o.id || o.action || '',
        label: o.label || o.action || '',
        action: o.action || o.id || '',
        color: o.color,
        textColor: o.textColor,
        scale: o.scale,
        blur: o.blur,
        brightness: o.brightness,
        position: o.position,
      };
    });
    if (!options.length && q.type === 'action' && q.correct_action === 'tap') {
      options = [{ id: 'tap', label: '点一下', action: 'tap' }];
    }
    return {
      id: q.id || '',
      type: q.type || 'action',
      source_type: q.type,
      instruction_text: q.instruction_text || '',
      prompt_color: q.prompt_color || '#FFFFFF',
      correct_action: q.correct_action,
      options: options,
      time_limit_ms: q.time_limit_ms || 3000,
      difficulty: q.difficulty || 1,
      difficulty_level: q.difficulty,
      difficulty_name: q.difficulty_name,
      trap: q.trap || '',
      source: q.source || 'online',
    };
  }

  OppositeGame.prototype.initSocket = function () {
    var self = this;
    var serverUrl = window.location.origin;

    try {
      this.socket = io(serverUrl, {
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: 8,
        reconnectionDelay: 1500
      });
    } catch (e) {
      console.log('[PK] Socket.IO 初始化失败，在线 PK 不可用:', e);
      this.socket = null;
      return;
    }

    global.addEventListener('beforeunload', function () {
      if (self.socket) self.socket.disconnect();
    }, { once: true });

    this.socket.on('connect', function () {
      console.log('[PK] Socket 已连接');
      self.onlineSid = self.socket.id;
      if (self.page === 'online_pk' && self.onlinePkState === 'idle') {
        self.homeNotice = '';
        self.render();
      }
    });

    this.socket.on('connected', function (data) {
      self.onlineSid = data.sid || self.socket.id;
    });

    this.socket.on('disconnect', function () {
      console.log('[PK] Socket 断开');
      if (self.onlinePkState === 'queuing' || self.onlinePkState === 'matched' || self.onlinePkState === 'playing') {
        self.homeNotice = '连接断开，请重试';
        self.onlinePkState = 'idle';
        self.roomId = null;
        self.opponentSid = '';
        self.onlineRoundToken = '';
        self.page = 'online_pk';
        self.render();
      }
    });

    // 队列状态
    this.socket.on('queue_status', function (data) {
      self.onlineQueuePos = data.position || -1;
      if (data.status === 'left' || data.status === 'cancelled') {
        self.onlinePkState = 'idle';
        self.onlineQueuePos = -1;
      }
      self.render();
    });

    // 匹配成功
    this.socket.on('match_found', function (data) {
      console.log('[PK] 匹配成功:', data);
      self.roomId = data.room_id;
      self.onlineSid = data.player_id || self.socket.id;
      self.opponentSid = data.opponent_id || '';
      self.opponentName = data.opponent || '对手';
      self.onlinePkState = 'matched';
      self.onlineScores.me = 0;
      self.opponentScore = 0;
      self.onlineRound = 0;
      self._matchFoundTime = Date.now();
      self.render();
    });

    // 收到题目
    this.socket.on('new_question', function (data) {
      if (!data || data.room_id !== self.roomId) return;
      console.log('[PK] 新题目 round=' + data.round, data);
      var q = normalizeOnlineQuestion(data.question);
      self.question = q;
      self.timeLimit = data.time_limit_ms || 3000;
      self.onlineTimeLimit = data.time_limit_ms || 3000;
      self.timerProgress = 1;
      self.onlineRound = data.round;
      self.onlineRoundToken = data.round_token;
      self.onlineTotalRounds = data.total;
      self.onlineQuestionStartMs = Date.now();
      self.questionAnswered = false;
      self.feedbackLines = [];
      self.onlinePkState = 'playing';
      self.page = 'online_pk';
      self.buttons = [];
      self.render();
    });

    // 分数更新
    this.socket.on('score_update', function (data) {
      if (!data || data.room_id !== self.roomId) return;
      var scores = data.scores_by_sid || {};
      var combos = data.combos_by_sid || {};
      self.onlineScores.me = scores[self.onlineSid] || 0;
      self.combo = combos[self.onlineSid] || 0;
      self.opponentScore = scores[self.opponentSid] || 0;
      self.opponentCombo = combos[self.opponentSid] || 0;
      self.render();
    });

    this.socket.on('answer_result', function (data) {
      if (!data || data.room_id !== self.roomId || data.round !== self.onlineRound) return;
      self.onlineScores.me = data.score || 0;
      self.combo = data.combo || 0;
      if (data.timed_out) {
        self.showFeedback([{ text: 'TIME OUT', color: COLOR_DANGER, size: 34 }]);
        if (typeof playSound === 'function' && global.AudioManager) {
          playSound(global.AudioManager.gameplay.wrong);
        }
      } else if (data.correct) {
        self.showFeedback([{ text: '✓ 正确', color: COLOR_PRIMARY, size: 34 }]);
        self.showScreenFlash('rgba(0,255,157,0.10)', 180);
        if (typeof playSound === 'function' && global.AudioManager) {
          playSound(global.AudioManager.gameplay.correct);
        }
      } else {
        self.showFeedback([{ text: '✗ 错误', color: COLOR_DANGER, size: 34 }]);
        self.showScreenFlash('rgba(255,61,90,0.18)', 180);
        if (typeof playSound === 'function' && global.AudioManager) {
          playSound(global.AudioManager.gameplay.wrong);
        }
      }
      self.render();
    });

    // 游戏结束
    this.socket.on('game_over', function (data) {
      if (!data || data.room_id !== self.roomId) return;
      console.log('[PK] 游戏结束:', data);
      var result = data.result_by_sid || {};
      var myResult = result[self.onlineSid] || {};
      var opponentResult = result[self.opponentSid] || {};
      var winner = myResult.outcome === 'win'
        ? 'me'
        : myResult.outcome === 'lose'
        ? 'them'
        : 'draw';

      self.onlineResult = {
        winner: winner,
        myScore: myResult.score || 0,
        opponentScore: (opponentResult ? opponentResult.score : 0) || 0,
        myTotalTimeMs: myResult.total_time_ms || 0,
        opponentTotalTimeMs: (opponentResult ? opponentResult.total_time_ms : 0) || 0,
        myMaxCombo: myResult.max_combo || 0,
        opponentMaxCombo: (opponentResult ? opponentResult.max_combo : 0) || 0,
      };
      self.onlineScores.me = myResult.score || 0;
      self.opponentScore = (opponentResult ? opponentResult.score : 0) || 0;
      self.onlineRound = self.onlineTotalRounds;
      self.onlinePkState = 'result';
      self.page = 'online_pk';
      self.buttons = [];
      self.render();
    });

    // 对手离开
    this.socket.on('player_left', function (data) {
      if (!data || data.room_id !== self.roomId) return;
      console.log('[PK] 对手离开:', data);
      if (self.onlinePkState === 'playing' || self.onlinePkState === 'matched') {
        self.homeNotice = data.username + ' 离开了游戏';
        self.onlinePkState = 'idle';
        self.onlineResult = null;
        self.roomId = null;
        self.page = 'online_pk';
        self.render();
      }
    });

    // 错误
    this.socket.on('error', function (data) {
      console.warn('[PK] 错误:', data);
      self.homeNotice = data.msg || '发生错误';
      self.render();
    });
  };

  // 离开在线匹配
  OppositeGame.prototype.leaveOnlineMatch = function () {
    if (this.socket) {
      if (this.onlinePkState === 'queuing') {
        this.socket.emit('leave_queue');
      } else if (this.roomId) {
        this.socket.emit('leave_match', { room_id: this.roomId });
      }
    }
    this.onlinePkState = 'idle';
    this.roomId = null;
    this.opponentName = '';
    this.opponentSid = '';
    this.onlineRoundToken = '';
    this.onlineScores = { me: 0, opponent: 0 };
    this.onlineResult = null;
    this.isOnlineGame = false;
    this.question = null;
  };

  // 显示昵称输入
  OppositeGame.prototype.showPkNameOverlay = function () {
    var self = this;
    var overlay = document.getElementById('pkNameOverlay');
    var input = document.getElementById('pkNameInput');
    var confirmBtn = document.getElementById('pkNameConfirmBtn');
    var cancelBtn = document.getElementById('pkNameCancelBtn');

    if (!overlay || !input) return;

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    input.value = this.onlinePlayerName || '';
    input.focus();

    var doMatch = function () {
      var name = input.value.trim() || ('玩家' + Math.floor(Math.random() * 9999));
      name = name.slice(0, 8);
      if (typeof self.setLeaderboardPlayerName === 'function') {
        self.setLeaderboardPlayerName(name);
      } else {
        self.onlinePlayerName = name;
      }
      input.blur();
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      if (global.AudioManager) global.AudioManager.unlock();
      self.startOnlineMatchmaking(name);
      cleanup();
    };

    var doCancel = function () {
      input.blur();
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      self.canvas.focus();
      cleanup();
    };

    var onKey = function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        doMatch();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        doCancel();
      }
    };

    var cleanup = function () {
      confirmBtn.removeEventListener('click', doMatch);
      cancelBtn.removeEventListener('click', doCancel);
      input.removeEventListener('keydown', onKey);
    };

    confirmBtn.addEventListener('click', doMatch);
    cancelBtn.addEventListener('click', doCancel);
    input.addEventListener('keydown', onKey);
  };

  // 开始在线匹配
  OppositeGame.prototype.startOnlineMatchmaking = function (name) {
    if (!this.socket || !this.socket.connected) {
      this.homeNotice = '服务器未连接，请刷新页面后重试';
      this.onlinePkState = 'idle';
      this.render();
      return;
    }
    this.onlinePkState = 'queuing';
    this.onlineQueuePos = 1;
    this.homeNotice = '';
    this.page = 'online_pk';
    this.socket.emit('join_queue', { username: name });
    this.render();
  };

  // 在线提交答案
  OppositeGame.prototype.submitOnlineAnswer = function (action, reactionMs) {
    if (!this.socket || !this.roomId || this.questionAnswered) return;
    var q = this.question;
    if (!q) return;

    // 找到玩家选择的选项索引
    var answerIdx = -1;
    if (q.options && q.options.length) {
      for (var i = 0; i < q.options.length; i++) {
        if (q.options[i].action === action) {
          answerIdx = i;
          break;
        }
      }
    }
    this.socket.emit('submit_answer', {
      room_id: this.roomId,
      round: this.onlineRound,
      round_token: this.onlineRoundToken,
      answer: answerIdx,
      action: action,
      reaction_time_ms: reactionMs,
      timed_out: action === 'timeout'
    });

    this.questionAnswered = true;
    this.showFeedback([{
      text: action === 'timeout' ? 'TIME OUT' : '已锁定',
      color: action === 'timeout' ? COLOR_DANGER : COLOR_PRIMARY,
      size: 34
    }]);
    this.render();
  };

  // 在线超时
  OppositeGame.prototype.handleOnlineTimeout = function () {
    if (this.questionAnswered) return;
    this.submitOnlineAnswer('timeout', this.onlineTimeLimit);
  };

})(window);
