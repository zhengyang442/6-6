/**
 * 《反着来》题库适配层
 * 依赖：data/question-pool/*Questions.js（由 content/questions 生成）
 *
 * @author 四个菜鸟想上天团队
 */
const QuestionBank = (function (global) {
  "use strict";

  var parts = global.QuestionPoolParts || {};
  var difficulties = ["easy", "medium", "hard", "boss"];
  var pools = {
    easy: parts.easy || [],
    medium: parts.medium || [],
    hard: parts.hard || [],
    boss: parts.boss || [],
    motion: [],
  };

  // 加载体感题（来自独立的 MotionQuestionPool）
  if (global.MotionQuestionPool) {
    pools.motion = global.MotionQuestionPool;
  }

  var challengeCurve = [
    { difficulty: "easy", count: 5 },
    { difficulty: "medium", count: 7 },
    { difficulty: "hard", count: 6 },
    { difficulty: "boss", count: 2 },
  ];

  function shuffle(items) {
    var result = items.slice();
    for (var i = result.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = result[i];
      result[i] = result[j];
      result[j] = tmp;
    }
    return result;
  }

  function createDirectionalOptions(action) {
    if (action === "click_left" || action === "click_right") {
      return [
        { id: "left", label: "左", action: "click_left", position: "left" },
        { id: "right", label: "右", action: "click_right", position: "right" },
      ];
    }
    if (action === "click_top" || action === "click_bottom") {
      return [
        { id: "top", label: "上", action: "click_top", position: "top" },
        { id: "bottom", label: "下", action: "click_bottom", position: "bottom" },
      ];
    }
    return null;
  }

  function normalizeQuestion(question) {
    var options = Array.isArray(question.options)
      ? question.options.map(function (option) {
          return {
            id: option.id || option.action,
            label: option.label || option.id || option.action,
            action: option.action || option.id,
            color: option.color,
            textColor: option.textColor,
            scale: option.scale,
            blur: option.blur,
            brightness: option.brightness,
            position: option.position,
          };
        })
      : createDirectionalOptions(question.correctAction);

    if (!options && question.type === "action" && question.correctAction === "tap") {
      options = [{ id: "tap", label: "点一下", action: "tap" }];
    }

    return {
      id: question.id,
      type: question.type === "double_negative" ? "double_neg" : question.type,
      source_type: question.type,
      instruction_text: question.prompt,
      prompt_color: question.fontColor || "#FFFFFF",
      correct_action: question.correctAction,
      options: options,
      time_limit_ms: question.timeLimit || 1200,
      difficulty: question.difficulty,
      difficulty_level: question.difficultyLevel,
      trap: question.trap || "",
      mode_tags: question.modeTags || [],
      implementation_level: question.implementationLevel || "P2",
      experimental: Boolean(question.experimental),
    };
  }

  function isStableP0(question) {
    var stableTypes = {
      action: true,
      color: true,
      direction: true,
      logic_reversal: true,
    };
    var requiredTags = {
      easy: "challenge_warmup",
      medium: "challenge_middle",
      hard: "challenge_hard",
      boss: "challenge_boss",
    };

    if (!question || question.implementationLevel !== "P0") return false;
    if (!question.id || !question.type || !question.correctAction) return false;
    if (!stableTypes[question.type] || question.experimental) return false;
    if (
      requiredTags[question.difficulty] &&
      (!Array.isArray(question.modeTags) ||
        !question.modeTags.includes(requiredTags[question.difficulty]))
    ) {
      return false;
    }

    if (/^swipe_(left|right|up|down)$/.test(question.correctAction)) {
      return question.type === "direction";
    }

    if (/^click_(left|right|top|bottom)$/.test(question.correctAction)) {
      return question.type === "direction";
    }

    if (question.type === "action") {
      return question.correctAction === "tap" || question.correctAction === "wait";
    }

    if (!Array.isArray(question.options)) return false;
    if (question.options.length < 1 || question.options.length > 3) return false;

    return question.options.some(function (option) {
      return (option.id || option.action) === question.correctAction;
    });
  }

  function sampleStable(difficulty, count) {
    var stable = pools[difficulty].filter(isStableP0);
    if (!stable.length) return [];

    var shuffled = shuffle(stable);
    var selected = [];
    for (var i = 0; i < Math.min(count, shuffled.length); i++) {
      selected.push(normalizeQuestion(shuffled[i]));
    }
    return selected;
  }

  function getChallengeQuestions() {
    var selected = challengeCurve.reduce(function (questions, stage) {
      return questions.concat(sampleStable(stage.difficulty, stage.count));
    }, []);
    return selected.filter(function (question, index) {
      return selected.findIndex(function (candidate) {
        return candidate.id === question.id;
      }) === index;
    });
  }

  function getPracticeQuestions(count) {
    return sampleStable("easy", count || 8).map(function (question) {
      question.time_limit_ms = Math.max(2000, question.time_limit_ms * 1.6);
      return question;
    });
  }

  function getLevelQuestions(difficultyOrMix, count, timeLimit) {
    var requestedCount = count || 10;
    var selected;

    if (Array.isArray(difficultyOrMix)) {
      selected = difficultyOrMix.reduce(function (questions, stage) {
        if (stage.difficulty === 'motion') {
          // 体感题直接规范化，不经过 P0 过滤
          var motionPool = (pools.motion || []).slice();
          var picked = shuffle(motionPool).slice(0, stage.count);
          return questions.concat(picked.map(normalizeQuestion));
        }
        return questions.concat(sampleStable(stage.difficulty, stage.count));
      }, []);
      selected = shuffle(selected).filter(function (question, index, questions) {
        return questions.findIndex(function (candidate) {
          return candidate.id === question.id;
        }) === index;
      }).slice(0, requestedCount);
    } else if (difficultyOrMix === 'motion') {
      var motionPool = (pools.motion || []).slice();
      selected = shuffle(motionPool).slice(0, requestedCount).map(normalizeQuestion);
    } else {
      if (!pools[difficultyOrMix]) return [];
      selected = sampleStable(difficultyOrMix, requestedCount);
    }

    return selected.map(function (question) {
      question.time_limit_ms = timeLimit || question.time_limit_ms;
      return question;
    });
  }

  function getMotionQuestions() {
    var motionPool = global.MotionQuestionPool || [];
    return motionPool.map(normalizeQuestion);
  }

  /**
   * @param {number|object} request
   * @returns {Array}
   */
  function getQuestions(request) {
    if (typeof request === "number") {
      return getChallengeQuestions().slice(0, request);
    }

    request = request || {};
    if (request.mode === "practice") {
      return getPracticeQuestions(request.count || 8);
    }
    if (request.mode === "level") {
      return getLevelQuestions(
        request.difficulty || "easy",
        request.count || 10,
        request.timeLimit
      );
    }
    if (request.mode === "motion") {
      return getMotionQuestions();
    }
    return getChallengeQuestions();
  }

  function getDiagnostics() {
    var byDifficulty = {};
    difficulties.forEach(function (difficulty) {
      byDifficulty[difficulty] = {
        total: pools[difficulty].length,
        stableP0: pools[difficulty].filter(isStableP0).length,
      };
    });
    byDifficulty.motion = {
      total: pools.motion.length,
      stableP0: pools.motion.length,
    };
    return {
      total: difficulties.reduce(function (sum, difficulty) {
        return sum + pools[difficulty].length;
      }, 0) + pools.motion.length,
      byDifficulty: byDifficulty,
    };
  }

  return {
    getQuestions: getQuestions,
    getLevelQuestions: getLevelQuestions,
    getDiagnostics: getDiagnostics,
    getQuestionsByDifficulty: function (difficulty) {
      return (pools[difficulty] || []).map(normalizeQuestion);
    },
  };
})(window);

window.QuestionBank = QuestionBank;
