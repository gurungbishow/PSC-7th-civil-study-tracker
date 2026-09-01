/**
 * PSC 7th Level Study & Revision Tracker - Main Application Logic
 * Supports Segmented Paper/Part Selection & Granular Micro-Topic Spaced Repetition (1-3-7-21)
 */

// Application State
const AppState = {
  // Sub-Topic ID -> { status, studyStatus, currentStep, initialStudyDate, completedDate, nextRevisionDate, lastReviewDate, confidence, notes, history: [] }
  studyState: {},

  // Date-based daily study logs { 'YYYY-MM-DD': [ { subtopicId, status: 'completed'|'remaining', loggedDate, completedAt, notes } ] }
  dailyStudyLog: {},

  // Selected date for Daily Study Tracker component (defaults to today)
  selectedStudyTrackerDateStr: null,

  // App configuration
  settings: {
    examDate: '2026-11-20',
    intervals: [1, 3, 7, 21, 60],
    theme: 'dark'
  },

  // Daily activity log { 'YYYY-MM-DD': reviewCount }
  activityLog: {},

  // Current UI states
  currentTab: 'dashboard-view',
  syllabusPaperFilter: 'all',
  syllabusPartFilter: 'all',
  syllabusStatusFilter: 'all',
  searchQuery: '',
  calendarMonth: new Date(),
  selectedCalendarDateStr: null,
  activeDrawerTopicId: null,

  // Dashboard Logger Cascaded State
  loggerSelectedPartId: 'p1_part1',
  loggerSelectedTopicId: null,
  loggerSelectedSubtopicId: null,

  // Active Focus Reading & Study Timer State
  timerState: {
    activeSubtopicId: null,
    mode: 'stopwatch', // 'stopwatch' | 'countdown'
    targetSeconds: 25 * 60,
    elapsedSeconds: 0,
    remainingSeconds: 25 * 60,
    isRunning: false,
    timerIntervalId: null,
    accumulatedSeconds: {} // subtopicId -> total seconds
  }
};

// LocalStorage Keys
const STORAGE_KEYS = {
  STUDY_STATE: 'psc7_subtopics_study_state_v2',
  DAILY_STUDY_LOG: 'psc7_daily_study_log_v2',
  TIMER_ACCUMULATED: 'psc7_timer_accumulated_v2',
  SETTINGS: 'psc7_settings_v2',
  ACTIVITY_LOG: 'psc7_activity_log_v2'
};

// Initialize Application Lifecycle (Immediate & DOMContentLoaded safe)
function initApp() {
  AppState.selectedStudyTrackerDateStr = formatDate(new Date());
  loadStoredData();
  setupEventListeners();
  applyTheme(AppState.settings.theme);
  updateCountdown();
  populateLoggerTopics();
  renderCurrentTab();
  calculateDailyStreak();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Load Data from LocalStorage with Backward-Compatible Migration
function loadStoredData() {
  try {
    const savedStudyState = localStorage.getItem(STORAGE_KEYS.STUDY_STATE);
    if (savedStudyState) AppState.studyState = JSON.parse(savedStudyState);

    const savedDailyLog = localStorage.getItem(STORAGE_KEYS.DAILY_STUDY_LOG);
    if (savedDailyLog) AppState.dailyStudyLog = JSON.parse(savedDailyLog);

    const savedTimer = localStorage.getItem(STORAGE_KEYS.TIMER_ACCUMULATED);
    if (savedTimer) AppState.timerState.accumulatedSeconds = JSON.parse(savedTimer);

    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (savedSettings) AppState.settings = { ...AppState.settings, ...JSON.parse(savedSettings) };

    const savedActivity = localStorage.getItem(STORAGE_KEYS.ACTIVITY_LOG);
    if (savedActivity) AppState.activityLog = JSON.parse(savedActivity);

    // Migration: ensure every studyState item has studyStatus and appears in dailyStudyLog
    for (const [subId, s] of Object.entries(AppState.studyState)) {
      if (!s.studyStatus) {
        if (s.status === 'mastered' || s.nextRevisionDate || s.currentStep > 0) {
          s.studyStatus = 'completed';
          s.completedDate = s.initialStudyDate || formatDate(new Date());
        } else {
          s.studyStatus = 'remaining';
        }
      }

      const logDate = s.initialStudyDate || formatDate(new Date());
      if (!AppState.dailyStudyLog[logDate]) {
        AppState.dailyStudyLog[logDate] = [];
      }
      const existing = AppState.dailyStudyLog[logDate].find(item => item.subtopicId === subId);
      if (!existing) {
        AppState.dailyStudyLog[logDate].push({
          subtopicId: subId,
          status: s.studyStatus,
          loggedDate: logDate
        });
      }
    }
  } catch (err) {
    console.error('Failed to load local data:', err);
  }
}

// Save Data to LocalStorage
// Save Data to LocalStorage
function persistData() {
  try {
    localStorage.setItem(STORAGE_KEYS.STUDY_STATE, JSON.stringify(AppState.studyState));
    localStorage.setItem(STORAGE_KEYS.DAILY_STUDY_LOG, JSON.stringify(AppState.dailyStudyLog));
    localStorage.setItem(STORAGE_KEYS.TIMER_ACCUMULATED, JSON.stringify(AppState.timerState.accumulatedSeconds || {}));
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(AppState.settings));
    localStorage.setItem(STORAGE_KEYS.ACTIVITY_LOG, JSON.stringify(AppState.activityLog));
  } catch (err) {
    console.error('Failed to persist data:', err);
  }
}

// Format Date Utility: YYYY-MM-DD
function formatDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Add Days Utility
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

// Difference in Days between two YYYY-MM-DD
function daysDiff(targetDateStr, baseDateStr = formatDate(new Date())) {
  const t = new Date(targetDateStr);
  const b = new Date(baseDateStr);
  const diffTime = t.getTime() - b.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// ==========================================================================
// Hierarchy Lookup Utilities
// ==========================================================================

function findSubtopicById(subtopicId) {
  for (const paper of PSC_SYLLABUS.papers) {
    for (const part of paper.parts) {
      for (const ch of part.chapters) {
        for (const t of ch.topics) {
          for (const sub of (t.subtopics || [])) {
            if (sub.id === subtopicId) {
              return {
                ...sub,
                parentTopicId: t.id,
                parentTopicCode: t.code,
                parentTopicName: t.name,
                chapterId: ch.id,
                chapterName: ch.name,
                partId: part.id,
                partName: part.name,
                paperId: paper.id,
                paperName: paper.name,
                chapterMarks: ch.marks
              };
            }
          }
        }
      }
    }
  }
  return null;
}

function findParentTopicById(topicId) {
  for (const paper of PSC_SYLLABUS.papers) {
    for (const part of paper.parts) {
      for (const ch of part.chapters) {
        for (const t of ch.topics) {
          if (t.id === topicId) {
            return {
              ...t,
              chapterId: ch.id,
              chapterName: ch.name,
              partId: part.id,
              partName: part.name,
              paperId: paper.id,
              paperName: paper.name,
              chapterMarks: ch.marks
            };
          }
        }
      }
    }
  }
  return null;
}

function getAllSubtopics() {
  const list = [];
  for (const paper of PSC_SYLLABUS.papers) {
    for (const part of paper.parts) {
      for (const ch of part.chapters) {
        for (const t of ch.topics) {
          for (const sub of (t.subtopics || [])) {
            list.push({
              ...sub,
              parentTopicId: t.id,
              parentTopicCode: t.code,
              parentTopicName: t.name,
              chapterId: ch.id,
              chapterName: ch.name,
              partId: part.id,
              partName: part.name,
              paperId: paper.id,
              paperName: paper.name,
              chapterMarks: ch.marks
            });
          }
        }
      }
    }
  }
  return list;
}

// ==========================================================================
// Cascaded Segmented Topic Selector & Logger Handlers
// ==========================================================================

window.setLoggerPart = function (partId) {
  AppState.loggerSelectedPartId = partId;
  document.querySelectorAll('.part-segment-btn').forEach(btn => {
    if (btn.getAttribute('data-part-id') === partId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  populateLoggerTopics();
};

window.handleLoggerTopicChange = function (topicId) {
  AppState.loggerSelectedTopicId = topicId;
  refreshLoggerSubtopicsList();
};

window.selectLoggerSubtopic = function (subtopicId) {
  AppState.loggerSelectedSubtopicId = subtopicId;
  document.querySelectorAll('.subtopic-choice-card').forEach(c => c.classList.remove('selected'));
  const radio = document.querySelector(`input[name="logger_subtopic_radio"][value="${subtopicId}"]`);
  if (radio) {
    radio.checked = true;
    radio.closest('.subtopic-choice-card')?.classList.add('selected');
  }
};

window.handleLoggerAddStudy = function (status = 'remaining') {
  if (!AppState.loggerSelectedSubtopicId) {
    showToast('Please select a sub-topic from the list below.', 'error');
    return;
  }
  const targetDate = AppState.selectedStudyTrackerDateStr || formatDate(new Date());
  addTopicToDate(AppState.loggerSelectedSubtopicId, targetDate, status);
};

window.handleLoggerStartStudy = function () {
  window.handleLoggerAddStudy('remaining');
};

function populateLoggerTopics() {
  const topicSelect = document.getElementById('logger-topic-select');
  if (!topicSelect) return;

  const partId = AppState.loggerSelectedPartId || 'p1_part1';
  let matchingTopics = [];

  for (const paper of PSC_SYLLABUS.papers) {
    for (const part of paper.parts) {
      if (part.id === partId) {
        for (const ch of part.chapters) {
          for (const t of ch.topics) {
            matchingTopics.push({ ...t, chapterName: ch.name });
          }
        }
      }
    }
  }

  let html = '';
  matchingTopics.forEach(t => {
    html += `<option value="${t.id}">${t.code} - ${t.name.substring(0, 70)}...</option>`;
  });

  topicSelect.innerHTML = html;
  AppState.loggerSelectedTopicId = matchingTopics[0]?.id || null;
  refreshLoggerSubtopicsList();
}

function refreshLoggerSubtopicsList() {
  const container = document.getElementById('logger-subtopics-list');
  const countLabel = document.getElementById('logger-subtopic-count');
  if (!container) return;

  const topicId = AppState.loggerSelectedTopicId;
  const parentTopic = findParentTopicById(topicId);

  if (!parentTopic || !parentTopic.subtopics || parentTopic.subtopics.length === 0) {
    container.innerHTML = `<div style="font-size:12px; color:var(--text-muted); padding:10px;">No sub-topics found for this topic.</div>`;
    if (countLabel) countLabel.textContent = '';
    AppState.loggerSelectedSubtopicId = null;
    return;
  }

  const subtopics = parentTopic.subtopics;
  const studiedCount = subtopics.filter(s => AppState.studyState[s.id] && AppState.studyState[s.id].studyStatus === 'completed').length;
  if (countLabel) countLabel.textContent = `(${studiedCount}/${subtopics.length} completed)`;

  const firstUnstudied = subtopics.find(s => !AppState.studyState[s.id] || AppState.studyState[s.id].studyStatus !== 'completed');
  AppState.loggerSelectedSubtopicId = firstUnstudied ? firstUnstudied.id : subtopics[0].id;

  const todayStr = formatDate(new Date());

  let html = '';
  subtopics.forEach(sub => {
    const isSelected = sub.id === AppState.loggerSelectedSubtopicId;
    const state = AppState.studyState[sub.id];

    let statusText = 'Not Started';
    let statusClass = 'not-started';

    if (state) {
      if (state.status === 'mastered') {
        statusText = '🏆 Mastered';
        statusClass = 'mastered';
      } else if (state.studyStatus === 'remaining') {
        statusText = '⏳ Remaining (In Progress)';
        statusClass = 'remaining';
      } else if (state.nextRevisionDate && state.nextRevisionDate <= todayStr) {
        statusText = '⏰ Revision Due';
        statusClass = 'revision-due';
      } else if (state.studyStatus === 'completed') {
        statusText = `Step ${state.currentStep + 1} (${state.nextRevisionDate || 'Active'})`;
        statusClass = 'studying';
      }
    }

    html += `
      <div class="subtopic-choice-card ${isSelected ? 'selected' : ''}" onclick="selectLoggerSubtopic('${sub.id}')">
        <input type="radio" name="logger_subtopic_radio" value="${sub.id}" ${isSelected ? 'checked' : ''}>
        <div class="subtopic-choice-info">
          <div class="subtopic-choice-title">${sub.code} - ${sub.name}</div>
          <div class="subtopic-choice-meta">
            Status: <span class="topic-status-badge ${statusClass}">${statusText}</span>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ==========================================================================
// Daily Study Tracker & Date-Based History Handlers
// ==========================================================================

window.changeDailyTrackerDate = function (dateStr) {
  if (!dateStr) return;
  AppState.selectedStudyTrackerDateStr = dateStr;
  renderDailyStudyTracker();
};

window.changeDailyTrackerToToday = function () {
  AppState.selectedStudyTrackerDateStr = formatDate(new Date());
  renderDailyStudyTracker();
};

window.navigateDailyTrackerDate = function (offsetDays) {
  const curr = AppState.selectedStudyTrackerDateStr || formatDate(new Date());
  AppState.selectedStudyTrackerDateStr = addDays(curr, offsetDays);
  renderDailyStudyTracker();
};

window.addTopicToDate = function (subtopicId, dateStr, status = 'remaining') {
  const sub = findSubtopicById(subtopicId);
  if (!sub) return;

  if (!AppState.dailyStudyLog[dateStr]) {
    AppState.dailyStudyLog[dateStr] = [];
  }

  const existingIndex = AppState.dailyStudyLog[dateStr].findIndex(i => i.subtopicId === subtopicId);
  if (existingIndex >= 0) {
    AppState.dailyStudyLog[dateStr][existingIndex].status = status;
  } else {
    AppState.dailyStudyLog[dateStr].push({
      subtopicId: subtopicId,
      status: status,
      loggedDate: dateStr,
      completedAt: status === 'completed' ? new Date().toISOString() : null
    });
  }

  const intervals = AppState.settings.intervals;
  const firstInterval = intervals[0] || 1;
  const isCompleted = status === 'completed';
  const nextRev = isCompleted ? addDays(dateStr, firstInterval) : null;

  if (!AppState.studyState[subtopicId]) {
    AppState.studyState[subtopicId] = {
      status: 'studying',
      studyStatus: status,
      currentStep: 0,
      initialStudyDate: dateStr,
      completedDate: isCompleted ? dateStr : null,
      lastReviewDate: isCompleted ? dateStr : null,
      nextRevisionDate: nextRev,
      confidence: 'good',
      notes: '',
      priority: 'medium',
      history: [
        {
          date: dateStr,
          action: isCompleted ? 'Initial Study (Completed)' : 'Added to Daily Plan (Remaining)',
          confidence: isCompleted ? 'initial' : 'pending',
          nextInterval: isCompleted ? `${firstInterval}d (${nextRev})` : 'Paused (Pending completion)'
        }
      ]
    };
  } else {
    const s = AppState.studyState[subtopicId];
    s.studyStatus = status;
    if (isCompleted) {
      s.completedDate = dateStr;
      s.lastReviewDate = dateStr;
      s.nextRevisionDate = nextRev;
      s.history.push({
        date: dateStr,
        action: 'Marked Completed',
        confidence: 'good',
        nextInterval: `${firstInterval}d (${nextRev})`
      });
    } else {
      s.nextRevisionDate = null;
      s.history.push({
        date: dateStr,
        action: 'Marked Remaining',
        confidence: 'pending',
        nextInterval: 'Paused'
      });
    }
  }

  if (isCompleted) {
    logActivity(dateStr);
  }

  persistData();
  renderCurrentTab();
  refreshLoggerSubtopicsList();

  if (isCompleted) {
    showToast(`✅ "${sub.code} - ${sub.name.substring(0, 30)}..." Completed! 1st revision scheduled for ${nextRev}.`, 'success');
  } else {
    showToast(`⏳ "${sub.code} - ${sub.name.substring(0, 30)}..." added to ${dateStr} as Remaining.`);
  }
};

window.toggleTopicCompletion = function (subtopicId, dateStr) {
  const sub = findSubtopicById(subtopicId);
  if (!sub) return;

  const logEntries = AppState.dailyStudyLog[dateStr] || [];
  const logItem = logEntries.find(i => i.subtopicId === subtopicId);
  const s = AppState.studyState[subtopicId];
  if (!s && !logItem) return;

  const currentStatus = logItem ? logItem.status : (s ? s.studyStatus : 'remaining');
  const newStatus = currentStatus === 'completed' ? 'remaining' : 'completed';

  if (logItem) {
    logItem.status = newStatus;
    logItem.completedAt = newStatus === 'completed' ? new Date().toISOString() : null;
  } else {
    if (!AppState.dailyStudyLog[dateStr]) AppState.dailyStudyLog[dateStr] = [];
    AppState.dailyStudyLog[dateStr].push({
      subtopicId,
      status: newStatus,
      loggedDate: dateStr,
      completedAt: newStatus === 'completed' ? new Date().toISOString() : null
    });
  }

  const intervals = AppState.settings.intervals;
  const firstInterval = intervals[0] || 1;

  if (s) {
    s.studyStatus = newStatus;
    if (newStatus === 'completed') {
      s.completedDate = dateStr;
      s.lastReviewDate = dateStr;
      s.nextRevisionDate = addDays(dateStr, firstInterval);
      s.history.push({
        date: dateStr,
        action: 'Completed Study',
        confidence: 'good',
        nextInterval: `${firstInterval}d (${s.nextRevisionDate})`
      });
      logActivity(dateStr);
      showToast(`🏆 "${sub.code}" Marked Completed! Next revision scheduled for ${s.nextRevisionDate}.`, 'success');
    } else {
      s.completedDate = null;
      s.nextRevisionDate = null; // Strictly remove revision notification when remaining!
      s.history.push({
        date: dateStr,
        action: 'Set to Remaining',
        confidence: 'pending',
        nextInterval: 'Paused'
      });
      showToast(`⏳ "${sub.code}" Marked Remaining. Revision schedule paused.`);
    }
  }

  persistData();
  renderCurrentTab();
  refreshLoggerSubtopicsList();
};

window.removeTopicFromDate = function (subtopicId, dateStr) {
  if (AppState.dailyStudyLog[dateStr]) {
    AppState.dailyStudyLog[dateStr] = AppState.dailyStudyLog[dateStr].filter(i => i.subtopicId !== subtopicId);
  }

  // Check if topic is recorded on any other dates
  let foundElsewhere = false;
  for (const [d, items] of Object.entries(AppState.dailyStudyLog)) {
    if (items.some(i => i.subtopicId === subtopicId && i.status === 'completed')) {
      foundElsewhere = true;
      break;
    }
  }

  if (!foundElsewhere && AppState.studyState[subtopicId] && AppState.studyState[subtopicId].status !== 'mastered') {
    delete AppState.studyState[subtopicId];
  }

  persistData();
  renderCurrentTab();
  refreshLoggerSubtopicsList();
  showToast('Removed from selected date study log.');
};

window.handleRollOverRemaining = function () {
  const fromDate = AppState.selectedStudyTrackerDateStr;
  const todayStr = formatDate(new Date());
  if (!fromDate || fromDate >= todayStr) return;

  const entries = AppState.dailyStudyLog[fromDate] || [];
  const remaining = entries.filter(i => i.status === 'remaining');

  if (remaining.length === 0) {
    showToast('No remaining topics to roll over.', 'info');
    return;
  }

  if (!AppState.dailyStudyLog[todayStr]) {
    AppState.dailyStudyLog[todayStr] = [];
  }

  let count = 0;
  remaining.forEach(item => {
    // Add to today if not present
    if (!AppState.dailyStudyLog[todayStr].some(i => i.subtopicId === item.subtopicId)) {
      AppState.dailyStudyLog[todayStr].push({
        subtopicId: item.subtopicId,
        status: 'remaining',
        loggedDate: todayStr
      });
      count++;
    }
  });

  // Remove from past date
  AppState.dailyStudyLog[fromDate] = entries.filter(i => i.status !== 'remaining');

  AppState.selectedStudyTrackerDateStr = todayStr;
  persistData();
  renderCurrentTab();
  showToast(`⏩ Moved ${count} remaining topic(s) to Today's study list!`, 'success');
};

// ==========================================================================
// Active Focus Reading Timer Engine (Stopwatch & Countdown Pomodoro)
// ==========================================================================

function formatTimerDigits(totalSecs) {
  const s = Math.max(0, Math.floor(totalSecs));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatDurationReadable(totalSecs) {
  const s = Math.max(0, Math.floor(totalSecs));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  return `${secs}s`;
}

function updateTimerUI() {
  const timerBar = document.getElementById('active-focus-timer-bar');
  const digits = document.getElementById('timer-display-digits');
  const tag = document.getElementById('timer-topic-tag');
  const code = document.getElementById('timer-topic-code');
  const title = document.getElementById('timer-topic-title');
  const playIcon = document.getElementById('timer-play-icon');
  const playText = document.getElementById('timer-play-text');
  const liveDot = document.getElementById('timer-live-dot');
  const progressFill = document.getElementById('timer-progress-fill');

  if (!AppState.timerState.activeSubtopicId) {
    if (timerBar) timerBar.style.display = 'none';
    return;
  }

  const sub = findSubtopicById(AppState.timerState.activeSubtopicId);
  if (!sub) return;

  if (timerBar) timerBar.style.display = 'flex';

  if (tag) {
    tag.textContent = sub.paperId === 'paper1' ? 'Paper I' : 'Paper II';
    tag.className = `rev-paper-tag ${sub.paperId === 'paper1' ? 'p1' : 'p2'}`;
  }
  if (code) code.textContent = sub.code;
  if (title) title.textContent = sub.name;

  const currentSecs = AppState.timerState.mode === 'countdown'
    ? AppState.timerState.remainingSeconds
    : AppState.timerState.elapsedSeconds;

  if (digits) digits.textContent = formatTimerDigits(currentSecs);

  if (playIcon && playText) {
    if (AppState.timerState.isRunning) {
      playIcon.textContent = '⏸️';
      playText.textContent = 'Pause';
    } else {
      playIcon.textContent = '▶️';
      playText.textContent = 'Resume';
    }
  }

  if (liveDot) {
    if (AppState.timerState.isRunning) {
      liveDot.classList.add('pulse');
    } else {
      liveDot.classList.remove('pulse');
    }
  }

  if (progressFill) {
    if (AppState.timerState.mode === 'countdown') {
      const pct = Math.min(100, Math.max(0, ((AppState.timerState.targetSeconds - AppState.timerState.remainingSeconds) / AppState.timerState.targetSeconds) * 100));
      progressFill.style.width = `${pct}%`;
    } else {
      const pct = Math.min(100, (AppState.timerState.elapsedSeconds / 1800) * 100);
      progressFill.style.width = `${pct}%`;
    }
  }

  // Update mode buttons
  ['stopwatch', '25m', '45m', '60m'].forEach(m => {
    const btn = document.getElementById(`timer-mode-${m}`);
    if (btn) {
      if ((m === 'stopwatch' && AppState.timerState.mode === 'stopwatch') ||
          (m === '25m' && AppState.timerState.mode === 'countdown' && AppState.timerState.targetSeconds === 25 * 60) ||
          (m === '45m' && AppState.timerState.mode === 'countdown' && AppState.timerState.targetSeconds === 45 * 60) ||
          (m === '60m' && AppState.timerState.mode === 'countdown' && AppState.timerState.targetSeconds === 60 * 60)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  });
}

window.startTopicReading = function(subtopicId, mode = 'stopwatch', targetMinutes = 25) {
  const sub = findSubtopicById(subtopicId);
  if (!sub) return;

  if (AppState.timerState.timerIntervalId) {
    clearInterval(AppState.timerState.timerIntervalId);
    AppState.timerState.timerIntervalId = null;
  }

  AppState.timerState.activeSubtopicId = subtopicId;
  AppState.timerState.mode = mode;
  AppState.timerState.targetSeconds = targetMinutes * 60;
  AppState.timerState.elapsedSeconds = 0;
  AppState.timerState.remainingSeconds = targetMinutes * 60;
  AppState.timerState.isRunning = true;

  AppState.timerState.timerIntervalId = setInterval(() => {
    if (!AppState.timerState.isRunning) return;

    if (AppState.timerState.mode === 'countdown') {
      AppState.timerState.remainingSeconds--;
      AppState.timerState.elapsedSeconds++;
      if (AppState.timerState.remainingSeconds <= 0) {
        clearInterval(AppState.timerState.timerIntervalId);
        AppState.timerState.timerIntervalId = null;
        AppState.timerState.isRunning = false;
        showToast(`⏰ Focus Session Complete for ${sub.code}! Finished ${targetMinutes} mins.`, 'success');
        finishTopicReading(true);
        return;
      }
    } else {
      AppState.timerState.elapsedSeconds++;
    }
    updateTimerUI();
  }, 1000);

  updateTimerUI();
  renderCurrentTab();
  showToast(`📖 Focus Reading started for ${sub.code}: ${sub.name.substring(0, 25)}...`);
};

window.toggleTimerPauseResume = function() {
  if (!AppState.timerState.activeSubtopicId) return;

  AppState.timerState.isRunning = !AppState.timerState.isRunning;
  updateTimerUI();
  renderCurrentTab();
  if (AppState.timerState.isRunning) {
    showToast('▶️ Focus timer resumed.');
  } else {
    showToast('⏸️ Focus timer paused.');
  }
};

window.resetTopicTimer = function() {
  if (!AppState.timerState.activeSubtopicId) return;

  AppState.timerState.elapsedSeconds = 0;
  if (AppState.timerState.mode === 'countdown') {
    AppState.timerState.remainingSeconds = AppState.timerState.targetSeconds;
  }
  updateTimerUI();
  showToast('↺ Focus timer reset.');
};

window.setTimerMode = function(mode, targetMinutes = 25) {
  if (!AppState.timerState.activeSubtopicId) return;

  AppState.timerState.mode = mode;
  AppState.timerState.targetSeconds = targetMinutes * 60;
  AppState.timerState.remainingSeconds = targetMinutes * 60;
  AppState.timerState.elapsedSeconds = 0;
  updateTimerUI();
  showToast(`⏱️ Switched to ${mode === 'countdown' ? targetMinutes + 'm Countdown' : 'Stopwatch'} mode.`);
};

window.finishTopicReading = function(markCompleted = true) {
  const subId = AppState.timerState.activeSubtopicId;
  if (!subId) return;

  if (AppState.timerState.timerIntervalId) {
    clearInterval(AppState.timerState.timerIntervalId);
    AppState.timerState.timerIntervalId = null;
  }

  const secondsSpent = AppState.timerState.elapsedSeconds;
  AppState.timerState.accumulatedSeconds[subId] = (AppState.timerState.accumulatedSeconds[subId] || 0) + secondsSpent;
  const timeReadable = formatDurationReadable(secondsSpent);

  const sub = findSubtopicById(subId);
  const targetDate = AppState.selectedStudyTrackerDateStr || formatDate(new Date());

  if (markCompleted) {
    addTopicToDate(subId, targetDate, 'completed');
    if (AppState.studyState[subId]) {
      AppState.studyState[subId].history.push({
        date: targetDate,
        action: `Reading Focus (${timeReadable})`,
        confidence: 'good',
        nextInterval: `${AppState.settings.intervals[0] || 1}d`
      });
    }
  }

  AppState.timerState.isRunning = false;
  AppState.timerState.activeSubtopicId = null;
  persistData();
  updateTimerUI();
  renderCurrentTab();

  if (markCompleted) {
    showToast(`🎉 Logged ${timeReadable} of study for ${sub?.code} & marked Completed!`, 'success');
  } else {
    showToast(`⏱️ Logged ${timeReadable} of focus reading.`);
  }
};

window.closeTimerBar = function() {
  if (AppState.timerState.timerIntervalId) {
    clearInterval(AppState.timerState.timerIntervalId);
    AppState.timerState.timerIntervalId = null;
  }
  AppState.timerState.isRunning = false;
  AppState.timerState.activeSubtopicId = null;
  updateTimerUI();
  renderCurrentTab();
};

function renderDailyStudyTracker() {
  const container = document.getElementById('daily-topics-list-container');
  const titleText = document.getElementById('daily-tracker-title-text');
  const statsText = document.getElementById('daily-tracker-stats-text');
  const pctText = document.getElementById('daily-tracker-pct-text');
  const progressFill = document.getElementById('daily-tracker-progress-fill');
  const dateInput = document.getElementById('daily-tracker-date-input');
  const todayBtn = document.getElementById('tracker-today-date-btn');
  const rolloverBtn = document.getElementById('rollover-topics-btn');

  if (!container) return;

  const todayStr = formatDate(new Date());
  const selectedDate = AppState.selectedStudyTrackerDateStr || todayStr;

  if (dateInput) dateInput.value = selectedDate;
  if (todayBtn) {
    if (selectedDate === todayStr) {
      todayBtn.classList.add('active-date-pill');
    } else {
      todayBtn.classList.remove('active-date-pill');
    }
  }

  // Format readable date
  const dateObj = new Date(selectedDate + 'T00:00:00');
  const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  const readableDate = dateObj.toLocaleDateString('en-US', options);

  if (titleText) {
    titleText.textContent = selectedDate === todayStr
      ? `Today's Study Topics (${readableDate})`
      : `Study Topics for ${readableDate}`;
  }

  const entries = AppState.dailyStudyLog[selectedDate] || [];
  const totalTopics = entries.length;
  const completedTopics = entries.filter(e => e.status === 'completed').length;
  const remainingTopics = totalTopics - completedTopics;
  const pct = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

  if (statsText) {
    statsText.textContent = `${totalTopics} Topic${totalTopics === 1 ? '' : 's'} Logged (${completedTopics} Completed, ${remainingTopics} Remaining)`;
  }
  if (pctText) pctText.textContent = `${pct}% Done`;
  if (progressFill) progressFill.style.width = `${pct}%`;

  if (rolloverBtn) {
    if (selectedDate < todayStr && remainingTopics > 0) {
      rolloverBtn.style.display = 'inline-flex';
      rolloverBtn.textContent = `⏩ Move ${remainingTopics} Remaining to Today`;
    } else {
      rolloverBtn.style.display = 'none';
    }
  }

  if (totalTopics === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:24px 16px;">
        <span class="empty-icon" style="font-size:28px;">📅</span>
        <h4 style="font-size:14px; margin-bottom:4px;">No topics logged for ${selectedDate === todayStr ? 'Today' : readableDate}</h4>
        <p style="font-size:12px; max-width:380px;">
          Choose a sub-topic from <strong>"Start Studying a Micro-Topic"</strong> on the right to add it to this day's plan.
        </p>
      </div>
    `;
    return;
  }

  let html = '';
  entries.forEach(entry => {
    const sub = findSubtopicById(entry.subtopicId);
    if (!sub) return;

    const isCompleted = entry.status === 'completed';
    const s = AppState.studyState[sub.id];
    const paperClass = sub.paperId === 'paper1' ? 'p1' : 'p2';
    const paperLabel = sub.paperId === 'paper1' ? 'Paper I' : 'Paper II';

    const isReadingThis = AppState.timerState.activeSubtopicId === sub.id;
    const isTimerRunning = isReadingThis && AppState.timerState.isRunning;

    const totalReadSecs = AppState.timerState.accumulatedSeconds[sub.id] || 0;
    const readDurationText = totalReadSecs > 0 ? `⏱️ ${formatDurationReadable(totalReadSecs)} read` : '';

    let srsInfoHTML = '';
    if (isCompleted && s && s.nextRevisionDate) {
      srsInfoHTML = `
        <div class="daily-topic-srs-status srs-active">
          <span>🔔</span>
          <span>Next SRS Revision: <strong>${s.nextRevisionDate}</strong> (Step ${s.currentStep + 1})</span>
        </div>
      `;
    } else {
      srsInfoHTML = `
        <div class="daily-topic-srs-status srs-pending">
          <span>⏸️</span>
          <span>SRS Inactive: Mark Completed to trigger revision alerts</span>
        </div>
      `;
    }

    html += `
      <div class="daily-topic-card ${isCompleted ? 'completed' : 'remaining'} ${isReadingThis ? 'reading-active' : ''}" data-subtopic-id="${sub.id}">
        <div class="daily-topic-header">
          <div class="daily-topic-title-group">
            <span class="daily-topic-code-tag ${paperClass}">${paperLabel} &bull; ${sub.code}</span>
            <h4 class="daily-topic-title">${sub.name}</h4>
            <div class="daily-topic-subtext">${sub.parentTopicCode} ${sub.parentTopicName} &bull; ${sub.chapterName}</div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
            <span class="topic-status-badge ${isCompleted ? 'completed' : 'remaining'}">
              ${isCompleted ? '🟢 Completed' : '⏳ Remaining'}
            </span>
            ${readDurationText ? `<span class="topic-read-badge">${readDurationText}</span>` : ''}
          </div>
        </div>

        ${srsInfoHTML}

        <div class="daily-topic-actions">
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            ${isReadingThis ? `
              <button type="button" class="btn-read-timer ${isTimerRunning ? 'running' : 'paused'}" onclick="toggleTimerPauseResume()" title="Pause / Resume Reading Timer">
                ${isTimerRunning ? '⏸️ Reading (Pause)' : '▶️ Resume Reading'}
              </button>
            ` : `
              <button type="button" class="btn-read-timer" onclick="startTopicReading('${sub.id}')" title="Start Focus Reading Timer">
                📖 Start Reading
              </button>
            `}

            ${isCompleted ? `
              <button type="button" class="btn-toggle-status mark-remaining" onclick="toggleTopicCompletion('${sub.id}', '${selectedDate}')" title="Set topic status to remaining">
                ↺ Mark Remaining
              </button>
            ` : `
              <button type="button" class="btn-toggle-status mark-completed" onclick="toggleTopicCompletion('${sub.id}', '${selectedDate}')" title="Mark topic completed and activate SRS revision">
                ✓ Mark Completed
              </button>
            `}
          </div>

          <div style="display:flex; align-items:center; gap:6px;">
            <button type="button" class="notes-btn" onclick="openTopicDrawer('${sub.id}')" title="Notes & Formulas">
              📝 Notes
            </button>
            <button type="button" class="btn-remove-date-item" onclick="removeTopicFromDate('${sub.id}', '${selectedDate}')" title="Remove from date">
              ✕
            </button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ==========================================================================
// Spaced Repetition Engine
// ==========================================================================

window.startStudyingSubtopic = function (subtopicId, customDate = null) {
  const targetDate = customDate || AppState.selectedStudyTrackerDateStr || formatDate(new Date());
  addTopicToDate(subtopicId, targetDate, 'remaining');
};

window.recordSubtopicRevision = function (subtopicId, confidence = 'good') {
  const item = AppState.studyState[subtopicId];
  if (!item) return;

  const todayStr = formatDate(new Date());
  const intervals = AppState.settings.intervals;
  let nextStep = item.currentStep;
  let nextIntervalDays = 1;
  let newStatus = 'studying';

  if (confidence === 'hard') {
    nextIntervalDays = 1;
    nextStep = Math.max(0, item.currentStep - 1);
  } else if (confidence === 'good') {
    nextStep = item.currentStep + 1;
    if (nextStep >= intervals.length) {
      newStatus = 'mastered';
      nextIntervalDays = intervals[intervals.length - 1];
    } else {
      nextIntervalDays = intervals[nextStep];
    }
  } else if (confidence === 'easy') {
    nextStep = item.currentStep + 2;
    if (nextStep >= intervals.length) {
      newStatus = 'mastered';
      nextIntervalDays = 60;
    } else {
      nextIntervalDays = intervals[nextStep];
    }
  }

  const nextRevDate = addDays(todayStr, nextIntervalDays);

  item.status = newStatus;
  item.studyStatus = 'completed';
  item.currentStep = nextStep;
  item.lastReviewDate = todayStr;
  item.nextRevisionDate = nextRevDate;
  item.confidence = confidence;
  item.history.push({
    date: todayStr,
    action: `Revision (Step ${item.currentStep})`,
    confidence: confidence,
    nextInterval: `${nextIntervalDays}d (${nextRevDate})`
  });

  logActivity(todayStr);
  persistData();
  renderCurrentTab();
  refreshLoggerSubtopicsList();

  const sub = findSubtopicById(subtopicId);
  if (newStatus === 'mastered') {
    showToast(`🏆 Mastered: ${sub?.code} ${sub?.name.substring(0, 30)}...`, 'success');
  } else {
    showToast(`✅ Reviewed [${confidence.toUpperCase()}]. Next revision in ${nextIntervalDays} day(s).`);
  }
};

window.snoozeSubtopic = function (subtopicId, days = 1) {
  const item = AppState.studyState[subtopicId];
  if (!item || item.studyStatus !== 'completed') return;

  const todayStr = formatDate(new Date());
  item.nextRevisionDate = addDays(todayStr, days);
  persistData();
  renderCurrentTab();
  showToast(`⏰ Postponed revision by ${days} day.`);
};

window.markSubtopicMastered = function (subtopicId) {
  const todayStr = formatDate(new Date());
  if (!AppState.studyState[subtopicId]) {
    AppState.studyState[subtopicId] = {
      status: 'mastered',
      studyStatus: 'completed',
      currentStep: 4,
      initialStudyDate: todayStr,
      completedDate: todayStr,
      lastReviewDate: todayStr,
      nextRevisionDate: addDays(todayStr, 60),
      confidence: 'easy',
      notes: '',
      priority: 'medium',
      history: [{ date: todayStr, action: 'Direct Mastery', confidence: 'easy', nextInterval: '60d' }]
    };
  } else {
    AppState.studyState[subtopicId].status = 'mastered';
    AppState.studyState[subtopicId].studyStatus = 'completed';
    AppState.studyState[subtopicId].completedDate = todayStr;
    AppState.studyState[subtopicId].currentStep = 4;
    AppState.studyState[subtopicId].lastReviewDate = todayStr;
    AppState.studyState[subtopicId].nextRevisionDate = addDays(todayStr, 60);
  }

  if (!AppState.dailyStudyLog[todayStr]) {
    AppState.dailyStudyLog[todayStr] = [];
  }
  const existing = AppState.dailyStudyLog[todayStr].find(i => i.subtopicId === subtopicId);
  if (existing) {
    existing.status = 'completed';
  } else {
    AppState.dailyStudyLog[todayStr].push({ subtopicId, status: 'completed', loggedDate: todayStr, completedAt: new Date().toISOString() });
  }

  logActivity(todayStr);
  persistData();
  renderCurrentTab();
  refreshLoggerSubtopicsList();
  showToast(`🏆 Sub-topic marked as Mastered!`, 'success');
};

function logActivity(dateStr) {
  AppState.activityLog[dateStr] = (AppState.activityLog[dateStr] || 0) + 1;
  calculateDailyStreak();
}

function calculateDailyStreak() {
  let streak = 0;
  let curr = new Date();

  const todayLog = AppState.activityLog[formatDate(curr)];
  if (!todayLog) {
    curr.setDate(curr.getDate() - 1);
  }

  while (true) {
    const dStr = formatDate(curr);
    if (AppState.activityLog[dStr] && AppState.activityLog[dStr] > 0) {
      streak++;
      curr.setDate(curr.getDate() - 1);
    } else {
      break;
    }
  }

  const streakEl = document.getElementById('streak-count');
  if (streakEl) streakEl.textContent = `${streak} ${streak === 1 ? 'Day' : 'Days'}`;
}

// ==========================================================================
// Views Rendering
// ==========================================================================

function renderCurrentTab() {
  document.querySelectorAll('.view-tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const activeTabEl = document.getElementById(AppState.currentTab);
  if (activeTabEl) activeTabEl.classList.add('active');

  const activeNavEl = document.querySelector(`.nav-item[data-tab="${AppState.currentTab}"]`);
  if (activeNavEl) activeNavEl.classList.add('active');

  const titleEl = document.getElementById('view-title');
  const subEl = document.getElementById('view-subtitle');
  if (AppState.currentTab === 'dashboard-view') {
    if (titleEl) titleEl.textContent = "Today's Study & Revision Plan";
    if (subEl) subEl.textContent = "PSC 7th Level (Civil Engineering & General Subject)";
    renderDashboard();
  } else if (AppState.currentTab === 'syllabus-view') {
    if (titleEl) titleEl.textContent = "Syllabus Matrix & Micro-Topics";
    if (subEl) subEl.textContent = "Complete 218 Granular Sub-Units across Paper I & Paper II";
    renderSyllabus();
  } else if (AppState.currentTab === 'calendar-view') {
    if (titleEl) titleEl.textContent = "Revision Calendar & Timeline";
    if (subEl) subEl.textContent = "Visual Schedule of Micro-Topic Spaced Repetition Reviews";
    renderCalendar();
  } else if (AppState.currentTab === 'analytics-view') {
    if (titleEl) titleEl.textContent = "Exam Readiness Analytics";
    if (subEl) subEl.textContent = "Micro-Units Completion %, Paper Distribution & Retention Metrics";
    renderAnalytics();
  } else if (AppState.currentTab === 'settings-view') {
    if (titleEl) titleEl.textContent = "Settings & Data Backup";
    if (subEl) subEl.textContent = "Configure Intervals, Exam Date & Export/Import";
  }

  updateSidebarBadge();
  updateSidebarMetrics();
}

function updateSidebarBadge() {
  const todayStr = formatDate(new Date());
  let count = 0;
  for (const [subId, data] of Object.entries(AppState.studyState)) {
    // Only completed / non-mastered topics with revision due count for notifications!
    if (data.studyStatus === 'completed' && data.status !== 'mastered' && data.nextRevisionDate && data.nextRevisionDate <= todayStr) {
      count++;
    }
  }
  const badge = document.getElementById('sidebar-rev-badge');
  if (badge) {
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
}

function updateSidebarMetrics() {
  const todayStr = formatDate(new Date());
  const allSubtopics = getAllSubtopics();

  let overdueCount = 0;
  let dueTodayCount = 0;
  let studiedCount = 0;
  let masteredCount = 0;

  for (const sub of allSubtopics) {
    const s = AppState.studyState[sub.id];
    if (s) {
      if (s.studyStatus === 'completed' || s.status === 'mastered') {
        studiedCount++;
      }
      if (s.status === 'mastered') {
        masteredCount++;
      } else if (s.studyStatus === 'completed' && s.nextRevisionDate) {
        if (s.nextRevisionDate < todayStr) {
          overdueCount++;
        } else if (s.nextRevisionDate === todayStr) {
          dueTodayCount++;
        }
      }
    }
  }

  const elOverdue = document.getElementById('metric-overdue-count');
  const elDue = document.getElementById('metric-due-count');
  const elStudied = document.getElementById('metric-studied-count');
  const elStudiedSub = document.getElementById('metric-studied-subtext');
  const elMastered = document.getElementById('metric-mastered-count');

  if (elOverdue) elOverdue.textContent = overdueCount;
  if (elDue) elDue.textContent = dueTodayCount;
  if (elStudied) elStudied.textContent = studiedCount;
  if (elStudiedSub) elStudiedSub.textContent = `${studiedCount} of ${allSubtopics.length} sub-units completed`;
  if (elMastered) elMastered.textContent = masteredCount;
}

// --------------------------------------------------------------------------
// 1. Dashboard View Logic
// --------------------------------------------------------------------------

function renderDashboard() {
  renderDailyStudyTracker();
  updateSidebarMetrics();

  const todayStr = formatDate(new Date());
  const allSubtopics = getAllSubtopics();

  let overdueList = [];
  let dueTodayList = [];

  for (const sub of allSubtopics) {
    const s = AppState.studyState[sub.id];
    if (s && s.studyStatus === 'completed' && s.status !== 'mastered' && s.nextRevisionDate) {
      if (s.nextRevisionDate < todayStr) {
        overdueList.push({ subtopic: sub, state: s, daysOver: Math.abs(daysDiff(s.nextRevisionDate, todayStr)) });
      } else if (s.nextRevisionDate === todayStr) {
        dueTodayList.push({ subtopic: sub, state: s });
      }
    }
  }

  // Overdue Panel
  const overduePanel = document.getElementById('overdue-panel');
  const overdueContainer = document.getElementById('overdue-items-list');
  const overdueBadgeCount = document.getElementById('overdue-badge-count');

  if (overduePanel && overdueContainer) {
    if (overdueList.length > 0) {
      overduePanel.style.display = 'block';
      if (overdueBadgeCount) overdueBadgeCount.textContent = overdueList.length;
      overdueContainer.innerHTML = overdueList.map(item => createRevisionCardHTML(item.subtopic, item.state, true, item.daysOver)).join('');
    } else {
      overduePanel.style.display = 'none';
    }
  }

  // Due Today List
  const todayContainer = document.getElementById('today-revision-list');
  const dueBadgeCount = document.getElementById('due-badge-count');
  if (dueBadgeCount) dueBadgeCount.textContent = dueTodayList.length;

  if (todayContainer) {
    if (dueTodayList.length > 0) {
      todayContainer.innerHTML = dueTodayList.map(item => createRevisionCardHTML(item.subtopic, item.state, false)).join('');
    } else {
      todayContainer.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🎉</span>
          <h4>All Revisions Completed!</h4>
          <p>No more revisions due for today. Pick a new sub-topic to study and advance your preparation!</p>
        </div>
      `;
    }
  }

  renderSuggestedTopics();
}

function createRevisionCardHTML(subtopic, state, isOverdue = false, daysOver = 0) {
  const paperClass = subtopic.paperId === 'paper1' ? 'p1' : 'p2';
  const paperLabel = subtopic.paperId === 'paper1' ? 'Paper I' : 'Paper II';
  const stepLabel = `Step ${state.currentStep + 1} Revision`;

  return `
    <div class="revision-item-card ${isOverdue ? 'overdue' : ''}" data-subtopic-id="${subtopic.id}">
      <div class="rev-header">
        <div class="rev-title-group">
          <span class="rev-paper-tag ${paperClass}">${paperLabel} &bull; ${subtopic.code}</span>
          <h4 class="rev-title">${subtopic.name}</h4>
          <div class="rev-chapter">${subtopic.parentTopicCode} ${subtopic.parentTopicName} &bull; ${subtopic.chapterName}</div>
        </div>
        <div class="rev-interval-pill ${isOverdue ? 'overdue-pill' : ''}">
          ${isOverdue ? `🚨 Overdue by ${daysOver}d` : `⏰ ${stepLabel}`}
        </div>
      </div>
      
      <div class="rev-footer">
        <div class="rev-actions">
          <button type="button" class="feedback-btn hard" onclick="recordSubtopicRevision('${subtopic.id}', 'hard')">
            🔴 Hard (+1d)
          </button>
          <button type="button" class="feedback-btn good" onclick="recordSubtopicRevision('${subtopic.id}', 'good')">
            🟡 Good (Next Step)
          </button>
          <button type="button" class="feedback-btn easy" onclick="recordSubtopicRevision('${subtopic.id}', 'easy')">
            🟢 Easy (Mastery)
          </button>
        </div>
        <div style="display:flex; gap:6px;">
          <button type="button" class="snooze-btn" onclick="snoozeSubtopic('${subtopic.id}', 1)" title="Postpone 1 Day">
            ⏳ +1d
          </button>
          <button type="button" class="notes-btn" onclick="openTopicDrawer('${subtopic.id}')" title="Open Notes">
            📝 Notes
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderSuggestedTopics() {
  const container = document.getElementById('suggested-topics-list');
  if (!container) return;

  const allSubtopics = getAllSubtopics();
  const unstudied = allSubtopics.filter(s => !AppState.studyState[s.id]);

  if (unstudied.length === 0) {
    container.innerHTML = `<div style="font-size:13px; color:var(--text-muted);">All 218 sub-topics have been studied at least once!</div>`;
    return;
  }

  const suggestions = unstudied.slice(0, 3);
  container.innerHTML = suggestions.map(s => {
    const pClass = s.paperId === 'paper1' ? 'p1' : 'p2';
    const pLabel = s.paperId === 'paper1' ? 'Paper I' : 'Paper II';
    return `
      <div style="background:var(--bg-input); padding:12px 14px; border-radius:var(--radius-md); border:1px solid var(--border-color); display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div style="flex:1;">
          <span class="rev-paper-tag ${pClass}" style="font-size:10px; margin-bottom:2px;">${pLabel} ${s.code}</span>
          <div style="font-size:13px; font-weight:600; color:var(--text-primary); line-height:1.3;">${s.name}</div>
          <div style="font-size:11px; color:var(--text-muted);">${s.parentTopicCode} ${s.parentTopicName.substring(0, 45)}...</div>
        </div>
        <button type="button" class="btn-start-study" onclick="startStudyingSubtopic('${s.id}')" title="Add to Today's Study List">
          + Add to Today
        </button>
      </div>
    `;
  }).join('');
}

// --------------------------------------------------------------------------
// 2. Syllabus View Logic
// --------------------------------------------------------------------------

function renderSyllabus() {
  const container = document.getElementById('syllabus-accordion-container');
  if (!container) return;

  const filterPaper = AppState.syllabusPaperFilter;
  const filterPart = AppState.syllabusPartFilter;
  const filterStatus = AppState.syllabusStatusFilter;
  const query = AppState.searchQuery.toLowerCase().trim();
  const todayStr = formatDate(new Date());

  let html = '';

  PSC_SYLLABUS.papers.forEach(paper => {
    if (filterPaper !== 'all' && paper.id !== filterPaper) return;

    paper.parts.forEach(part => {
      if (filterPart !== 'all' && part.id !== filterPart) return;

      let partHasMatches = false;
      let partChaptersHTML = '';

      part.chapters.forEach(ch => {
        let chapterTopicsHTML = '';
        let chapterHasMatches = false;

        ch.topics.forEach(t => {
          const subtopics = t.subtopics || [];

          const matchingSubtopics = subtopics.filter(sub => {
            const state = AppState.studyState[sub.id];

            if (query) {
              const match = sub.name.toLowerCase().includes(query) ||
                sub.code.toLowerCase().includes(query) ||
                t.name.toLowerCase().includes(query) ||
                ch.name.toLowerCase().includes(query);
              if (!match) return false;
            }

            if (filterStatus === 'not_started' && state) return false;
            if (filterStatus === 'studying' && (!state || state.status !== 'studying')) return false;
            if (filterStatus === 'due' && (!state || state.status === 'mastered' || !state.nextRevisionDate || state.nextRevisionDate > todayStr)) return false;
            if (filterStatus === 'mastered' && (!state || state.status !== 'mastered')) return false;

            return true;
          });

          if (matchingSubtopics.length > 0) {
            chapterHasMatches = true;
            partHasMatches = true;

            const studiedInTopic = subtopics.filter(s => AppState.studyState[s.id]).length;
            const pct = Math.round((studiedInTopic / subtopics.length) * 100) || 0;

            chapterTopicsHTML += `
              <div class="topic-container-block">
                <div class="topic-parent-row">
                  <div class="topic-parent-left">
                    <span class="topic-parent-code">${t.code}</span>
                    <span class="topic-parent-title">${t.name}</span>
                  </div>
                  <div class="topic-parent-right">
                    <span class="parent-progress-pill">${studiedInTopic}/${subtopics.length} Sub-topics (${pct}%)</span>
                  </div>
                </div>
                <table class="subtopics-list-table">
                  <tbody>
                    ${matchingSubtopics.map(sub => createSubtopicTableRow(sub)).join('')}
                  </tbody>
                </table>
              </div>
            `;
          }
        });

        if (chapterHasMatches) {
          partChaptersHTML += `
            <div class="chapter-group">
              <div class="chapter-header">
                <h4>${ch.name} <span style="font-size:12px; color:var(--primary); font-weight:normal;">(${ch.marks} Marks)</span></h4>
              </div>
              ${chapterTopicsHTML}
            </div>
          `;
        }
      });

      if (partHasMatches) {
        html += `
          <div class="part-card">
            <div class="part-header">
              <h3>
                <span>📂</span>
                <span>${paper.name} &bull; ${part.name}</span>
              </h3>
              <span class="part-marks-tag">${part.marks} Marks</span>
            </div>
            ${partChaptersHTML}
          </div>
        `;
      }
    });
  });

  if (!html) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🔍</span>
        <h4>No Sub-Topics Found</h4>
        <p>No sub-topics match your current filter or search criteria.</p>
      </div>
    `;
  } else {
    container.innerHTML = html;
  }
}

function createSubtopicTableRow(subtopic) {
  const state = AppState.studyState[subtopic.id];
  const todayStr = formatDate(new Date());

  let statusBadge = '<span class="topic-status-badge not-started">Not Started</span>';
  let nextRevLabel = '-';

  if (state) {
    if (state.status === 'mastered') {
      statusBadge = '<span class="topic-status-badge mastered">🏆 Mastered</span>';
    } else if (state.nextRevisionDate && state.nextRevisionDate <= todayStr) {
      statusBadge = '<span class="topic-status-badge revision-due">⏰ Revision Due</span>';
    } else {
      statusBadge = `<span class="topic-status-badge studying">Step ${state.currentStep + 1} SRS</span>`;
    }

    if (state.nextRevisionDate) {
      const diff = daysDiff(state.nextRevisionDate, todayStr);
      if (diff < 0) nextRevLabel = `<span style="color:#f87171; font-weight:600;">Overdue (${Math.abs(diff)}d ago)</span>`;
      else if (diff === 0) nextRevLabel = `<span style="color:#fbbf24; font-weight:600;">Today</span>`;
      else nextRevLabel = `In ${diff} day(s)`;
    }
  }

  return `
    <tr class="subtopic-row">
      <td class="subtopic-code">${subtopic.code}</td>
      <td class="subtopic-name">
        <div>${subtopic.name}</div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">
          Next Revision: ${nextRevLabel}
        </div>
      </td>
      <td style="width: 130px; text-align:center;">
        ${statusBadge}
      </td>
      <td style="width: 160px;">
        <div class="topic-actions">
          ${!state ? `
            <button type="button" class="btn-start-study" onclick="startStudyingSubtopic('${subtopic.id}')" title="Add to Daily Study List">
              + Add to Plan
            </button>
          ` : `
            <button type="button" class="btn-icon-action" onclick="recordSubtopicRevision('${subtopic.id}', 'good')" title="Mark Revision Done">
              ✓
            </button>
          `}
          <button type="button" class="btn-icon-action" onclick="openTopicDrawer('${subtopic.id}')" title="Sub-Topic Notes & Formulas">
            📝
          </button>
          <button type="button" class="btn-icon-action" onclick="markSubtopicMastered('${subtopic.id}')" title="Mark as Mastered">
            🏆
          </button>
        </div>
      </td>
    </tr>
  `;
}

// --------------------------------------------------------------------------
// 3. Calendar View Logic
// --------------------------------------------------------------------------

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const monthTitle = document.getElementById('calendar-month-title');
  if (!grid || !monthTitle) return;

  const currentMonth = AppState.calendarMonth;
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  monthTitle.textContent = `${monthNames[month]} ${year}`;

  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDaysInMonth = new Date(year, month, 0).getDate();
  const todayStr = formatDate(new Date());

  let calendarHTML = `
    <div class="calendar-day-header">Sun</div>
    <div class="calendar-day-header">Mon</div>
    <div class="calendar-day-header">Tue</div>
    <div class="calendar-day-header">Wed</div>
    <div class="calendar-day-header">Thu</div>
    <div class="calendar-day-header">Fri</div>
    <div class="calendar-day-header">Sat</div>
  `;

  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const day = prevDaysInMonth - i;
    calendarHTML += `<div class="calendar-day-cell other-month"><span class="day-number">${day}</span></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;

    const revisionsOnDate = [];
    for (const [subId, s] of Object.entries(AppState.studyState)) {
      if (s.nextRevisionDate === dateStr && s.status !== 'mastered') {
        const sub = findSubtopicById(subId);
        if (sub) revisionsOnDate.push(sub);
      }
    }

    let pillsHTML = '';
    revisionsOnDate.slice(0, 2).forEach(s => {
      pillsHTML += `<div class="calendar-event-pill rev" title="${s.name}">${s.code} Rev</div>`;
    });
    if (revisionsOnDate.length > 2) {
      pillsHTML += `<div class="calendar-event-pill rev">+${revisionsOnDate.length - 2} more</div>`;
    }

    calendarHTML += `
      <div class="calendar-day-cell ${isToday ? 'today' : ''}" onclick="selectCalendarDate('${dateStr}')">
        <span class="day-number">${d}</span>
        ${pillsHTML}
      </div>
    `;
  }

  grid.innerHTML = calendarHTML;
  renderCalendarSelectedDay(AppState.selectedCalendarDateStr || todayStr);
}

window.selectCalendarDate = function (dateStr) {
  AppState.selectedCalendarDateStr = dateStr;
  AppState.selectedStudyTrackerDateStr = dateStr;
  renderCalendarSelectedDay(dateStr);
};

function renderCalendarSelectedDay(dateStr) {
  const container = document.getElementById('selected-date-items');
  const titleEl = document.getElementById('selected-date-title');
  if (!container || !titleEl) return;

  titleEl.textContent = `Schedule for: ${dateStr} ${dateStr === formatDate(new Date()) ? '(Today)' : ''}`;

  const scheduled = [];
  for (const [subId, s] of Object.entries(AppState.studyState)) {
    if (s.studyStatus === 'completed' && s.nextRevisionDate === dateStr && s.status !== 'mastered') {
      const sub = findSubtopicById(subId);
      if (sub) scheduled.push({ subtopic: sub, state: s });
    }
  }

  if (scheduled.length === 0) {
    container.innerHTML = `
      <div style="font-size:13px; color:var(--text-muted); padding:16px 0;">
        No micro-topic revisions scheduled for this date.
      </div>
    `;
  } else {
    container.innerHTML = scheduled.map(item => createRevisionCardHTML(item.subtopic, item.state, false)).join('');
  }
}

// --------------------------------------------------------------------------
// 4. Analytics View Logic
// --------------------------------------------------------------------------

function renderAnalytics() {
  const allSubtopics = getAllSubtopics();
  const totalSubtopics = allSubtopics.length; // 218

  let studiedCount = 0;
  let p1Studied = 0;
  let p1Total = 0;
  let p2Studied = 0;
  let p2Total = 0;

  const stageCounts = [0, 0, 0, 0, 0];

  allSubtopics.forEach(s => {
    if (s.paperId === 'paper1') p1Total++;
    else p2Total++;

    const state = AppState.studyState[s.id];
    if (state) {
      studiedCount++;
      if (s.paperId === 'paper1') p1Studied++;
      else p2Studied++;

      if (state.status === 'mastered') {
        stageCounts[4]++;
      } else {
        const step = Math.min(state.currentStep, 3);
        stageCounts[step]++;
      }
    }
  });

  const overallPct = Math.round((studiedCount / totalSubtopics) * 100) || 0;
  const p1Pct = Math.round((p1Studied / p1Total) * 100) || 0;
  const p2Pct = Math.round((p2Studied / p2Total) * 100) || 0;

  const progressCircle = document.getElementById('overall-progress-circle');
  if (progressCircle) progressCircle.style.setProperty('--percent', overallPct);

  const progressText = document.getElementById('overall-progress-text');
  if (progressText) progressText.textContent = `${overallPct}%`;

  const completedTopicsText = document.getElementById('analytics-completed-topics');
  if (completedTopicsText) completedTopicsText.textContent = studiedCount;

  const elP1Pct = document.getElementById('p1-progress-pct');
  const elP1Bar = document.getElementById('p1-progress-bar');
  const elP2Pct = document.getElementById('p2-progress-pct');
  const elP2Bar = document.getElementById('p2-progress-bar');

  if (elP1Pct) elP1Pct.textContent = `${p1Pct}% (${p1Studied}/${p1Total})`;
  if (elP1Bar) elP1Bar.style.width = `${p1Pct}%`;
  if (elP2Pct) elP2Pct.textContent = `${p2Pct}% (${p2Studied}/${p2Total})`;
  if (elP2Bar) elP2Bar.style.width = `${p2Pct}%`;

  for (let i = 0; i <= 4; i++) {
    const el = document.getElementById(`stage-${i}-count`);
    if (el) el.textContent = stageCounts[i];
  }

  renderActivityHeatmap();
}

function renderActivityHeatmap() {
  const container = document.getElementById('activity-heatmap');
  const countLabel = document.getElementById('total-reviews-count');
  if (!container) return;

  let totalLogged = 0;
  let cellsHTML = '';
  const today = new Date();

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = formatDate(d);
    const count = AppState.activityLog[dateStr] || 0;
    totalLogged += count;

    let level = 0;
    if (count >= 8) level = 4;
    else if (count >= 5) level = 3;
    else if (count >= 3) level = 2;
    else if (count >= 1) level = 1;

    cellsHTML += `
      <div class="heatmap-cell" data-level="${level}" title="${dateStr}: ${count} reviews logged"></div>
    `;
  }

  container.innerHTML = cellsHTML;
  if (countLabel) countLabel.textContent = `${totalLogged} total reviews logged`;
}

// --------------------------------------------------------------------------
// 5. Side Drawer (Notes & Details) Logic
// --------------------------------------------------------------------------

window.openTopicDrawer = function (subtopicId) {
  const sub = findSubtopicById(subtopicId);
  if (!sub) return;

  AppState.activeDrawerTopicId = subtopicId;
  const state = AppState.studyState[subtopicId] || {};

  const elPaperTag = document.getElementById('drawer-paper-tag');
  const elTopicCode = document.getElementById('drawer-topic-code');
  const elTopicDesc = document.getElementById('drawer-topic-desc');
  const notesEditor = document.getElementById('drawer-notes-editor');

  if (elPaperTag) {
    elPaperTag.textContent = `${sub.paperName} &bull; ${sub.partName}`;
    elPaperTag.className = `rev-paper-tag ${sub.paperId === 'paper1' ? 'p1' : 'p2'}`;
  }
  if (elTopicCode) elTopicCode.textContent = `${sub.code} - ${sub.name}`;
  if (elTopicDesc) elTopicDesc.textContent = `${sub.parentTopicCode} ${sub.parentTopicName} (${sub.chapterName}).`;
  if (notesEditor) notesEditor.value = state.notes || '';

  const timelineEl = document.getElementById('drawer-history-timeline');
  if (timelineEl) {
    if (state.history && state.history.length > 0) {
      timelineEl.innerHTML = state.history.slice().reverse().map(h => `
        <div style="background:var(--bg-input); padding:8px 12px; border-radius:var(--radius-sm); border-left:3px solid var(--primary); display:flex; justify-content:space-between;">
          <div><strong>${h.action}</strong> [${h.confidence}]</div>
          <div style="color:var(--text-muted);">${h.date} &bull; Next: ${h.nextInterval}</div>
        </div>
      `).join('');
    } else {
      timelineEl.innerHTML = `<div style="color:var(--text-muted);">No study or revision history logged yet.</div>`;
    }
  }

  document.getElementById('side-drawer')?.classList.add('active');
  document.getElementById('drawer-overlay')?.classList.add('active');
};

function closeTopicDrawer() {
  document.getElementById('side-drawer')?.classList.remove('active');
  document.getElementById('drawer-overlay')?.classList.remove('active');
  AppState.activeDrawerTopicId = null;
}

// --------------------------------------------------------------------------
// UI Helpers & Event Listeners
// --------------------------------------------------------------------------

function setupEventListeners() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      AppState.currentTab = btn.getAttribute('data-tab');
      renderCurrentTab();
      document.getElementById('sidebar')?.classList.remove('mobile-open');
    });
  });

  document.getElementById('menu-toggle-btn')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('mobile-open');
  });

  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
    const newTheme = AppState.settings.theme === 'dark' ? 'light' : 'dark';
    AppState.settings.theme = newTheme;
    applyTheme(newTheme);
    persistData();
  });

  document.getElementById('catchup-all-btn')?.addEventListener('click', () => {
    const todayStr = formatDate(new Date());
    let count = 0;
    for (const [sId, s] of Object.entries(AppState.studyState)) {
      if (s.status !== 'mastered' && s.nextRevisionDate && s.nextRevisionDate < todayStr) {
        s.nextRevisionDate = todayStr;
        count++;
      }
    }
    persistData();
    renderCurrentTab();
    showToast(`🔄 Updated ${count} overdue sub-topics to today!`);
  });

  document.getElementById('global-search-input')?.addEventListener('input', (e) => {
    AppState.searchQuery = e.target.value;
    if (AppState.currentTab !== 'syllabus-view') {
      AppState.currentTab = 'syllabus-view';
      renderCurrentTab();
    } else {
      renderSyllabus();
    }
  });

  document.querySelectorAll('.paper-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.paper-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.syllabusPaperFilter = btn.getAttribute('data-paper');
      renderSyllabus();
    });
  });

  document.getElementById('filter-part')?.addEventListener('change', (e) => {
    AppState.syllabusPartFilter = e.target.value;
    renderSyllabus();
  });

  document.getElementById('filter-status')?.addEventListener('change', (e) => {
    AppState.syllabusStatusFilter = e.target.value;
    renderSyllabus();
  });

  document.getElementById('cal-prev-btn')?.addEventListener('click', () => {
    AppState.calendarMonth.setMonth(AppState.calendarMonth.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById('cal-next-btn')?.addEventListener('click', () => {
    AppState.calendarMonth.setMonth(AppState.calendarMonth.getMonth() + 1);
    renderCalendar();
  });
  document.getElementById('cal-today-btn')?.addEventListener('click', () => {
    AppState.calendarMonth = new Date();
    AppState.selectedCalendarDateStr = formatDate(new Date());
    renderCalendar();
  });

  document.getElementById('drawer-close-btn')?.addEventListener('click', closeTopicDrawer);
  document.getElementById('drawer-overlay')?.addEventListener('click', closeTopicDrawer);

  document.getElementById('drawer-study-now-btn')?.addEventListener('click', () => {
    if (AppState.activeDrawerTopicId) {
      startStudyingSubtopic(AppState.activeDrawerTopicId);
      openTopicDrawer(AppState.activeDrawerTopicId);
    }
  });

  document.getElementById('drawer-master-btn')?.addEventListener('click', () => {
    if (AppState.activeDrawerTopicId) {
      markSubtopicMastered(AppState.activeDrawerTopicId);
      openTopicDrawer(AppState.activeDrawerTopicId);
    }
  });

  document.getElementById('drawer-notes-editor')?.addEventListener('input', (e) => {
    if (AppState.activeDrawerTopicId) {
      if (!AppState.studyState[AppState.activeDrawerTopicId]) {
        AppState.studyState[AppState.activeDrawerTopicId] = {
          status: 'studying',
          currentStep: 0,
          initialStudyDate: formatDate(new Date()),
          notes: '',
          priority: 'medium',
          history: []
        };
      }
      AppState.studyState[AppState.activeDrawerTopicId].notes = e.target.value;
      persistData();
    }
  });

  const examDateInput = document.getElementById('exam-date-input');
  if (examDateInput) examDateInput.value = AppState.settings.examDate || '2026-11-20';
  document.getElementById('save-exam-date-btn')?.addEventListener('click', () => {
    const val = document.getElementById('exam-date-input').value;
    if (val) {
      AppState.settings.examDate = val;
      persistData();
      updateCountdown();
      showToast('🎯 Target exam date saved!');
    }
  });

  const intervalsInput = document.getElementById('srs-intervals-input');
  if (intervalsInput) intervalsInput.value = AppState.settings.intervals.join(', ');
  document.getElementById('save-intervals-btn')?.addEventListener('click', () => {
    const val = document.getElementById('srs-intervals-input').value;
    const parsed = val.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n > 0);
    if (parsed.length > 0) {
      AppState.settings.intervals = parsed;
      persistData();
      showToast(`🧠 Updated SRS Intervals to: ${parsed.join(', ')} days`);
    }
  });

  document.getElementById('export-json-btn')?.addEventListener('click', exportDataJSON);
  document.getElementById('import-json-input')?.addEventListener('change', importDataJSON);
  document.getElementById('load-demo-data-btn')?.addEventListener('click', loadDemoData);

  document.getElementById('reset-all-btn')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset all study progress? This cannot be undone.')) {
      AppState.studyState = {};
      AppState.activityLog = {};
      persistData();
      renderCurrentTab();
      refreshLoggerSubtopicsList();
      calculateDailyStreak();
      showToast('🗑️ All data has been reset.', 'info');
    }
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function updateCountdown() {
  const badge = document.getElementById('countdown-text');
  if (!badge) return;

  if (!AppState.settings.examDate) {
    badge.textContent = 'Set Exam Date';
    return;
  }

  const diff = daysDiff(AppState.settings.examDate, formatDate(new Date()));
  if (diff > 0) {
    badge.textContent = `${diff} Days to Exam`;
  } else if (diff === 0) {
    badge.textContent = `Exam Today! 🔥`;
  } else {
    badge.textContent = `Exam Ended (${Math.abs(diff)}d ago)`;
  }
}

// --------------------------------------------------------------------------
// Export / Import & Demo Data
// --------------------------------------------------------------------------

function exportDataJSON() {
  const exportPayload = {
    version: '2.0',
    exportDate: new Date().toISOString(),
    studyState: AppState.studyState,
    dailyStudyLog: AppState.dailyStudyLog,
    settings: AppState.settings,
    activityLog: AppState.activityLog
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `PSC_7th_Subtopics_Backup_${formatDate(new Date())}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();

  showToast('💾 Progress backup downloaded successfully!');
}

function importDataJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (data.studyState) {
        AppState.studyState = data.studyState;
        if (data.dailyStudyLog) AppState.dailyStudyLog = data.dailyStudyLog;
        if (data.settings) AppState.settings = { ...AppState.settings, ...data.settings };
        if (data.activityLog) AppState.activityLog = data.activityLog;

        persistData();
        renderCurrentTab();
        refreshLoggerSubtopicsList();
        calculateDailyStreak();
        updateCountdown();
        showToast('✅ Backup imported successfully!', 'success');
      } else {
        showToast('Invalid backup file format.', 'error');
      }
    } catch (err) {
      showToast('Error parsing JSON file.', 'error');
    }
  };
  reader.readAsText(file);
}

function loadDemoData() {
  const today = new Date();
  const todayStr = formatDate(today);

  const past1 = formatDate(new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000));
  const past3 = formatDate(new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000));
  const past7 = formatDate(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000));

  AppState.studyState = {
    'p1_1_1_a': {
      status: 'studying',
      studyStatus: 'completed',
      currentStep: 1,
      initialStudyDate: past7,
      completedDate: past7,
      lastReviewDate: past7,
      nextRevisionDate: past3,
      confidence: 'good',
      notes: 'Terai (17%), Hilly (68%), Himalayan (15%). 8 of 14 8000m+ peaks in Nepal.',
      priority: 'high',
      history: [{ date: past7, action: 'Initial Study', confidence: 'initial', nextInterval: '3d' }]
    },
    'p1_1_1_b': {
      status: 'studying',
      studyStatus: 'completed',
      currentStep: 0,
      initialStudyDate: past1,
      completedDate: past1,
      lastReviewDate: past1,
      nextRevisionDate: todayStr,
      confidence: 'good',
      notes: '142 castes/ethnicities, 124 mother tongues in 2078 Census.',
      priority: 'high',
      history: [{ date: past1, action: 'Initial Study', confidence: 'initial', nextInterval: '1d' }]
    },
    'p2_1_1_b': {
      status: 'studying',
      studyStatus: 'completed',
      currentStep: 1,
      initialStudyDate: past3,
      completedDate: past3,
      lastReviewDate: past3,
      nextRevisionDate: todayStr,
      confidence: 'good',
      notes: 'Singly reinforced: Mu = 0.87*fy*Ast*(d - 0.42*xu). Limiting xu/d = 0.48 for Fe415.',
      priority: 'high',
      history: [{ date: past3, action: 'Initial Study', confidence: 'initial', nextInterval: '3d' }]
    },
    'p1_gt1_1_a': {
      status: 'mastered',
      studyStatus: 'completed',
      currentStep: 4,
      initialStudyDate: past7,
      completedDate: past7,
      lastReviewDate: todayStr,
      nextRevisionDate: addDays(todayStr, 60),
      confidence: 'easy',
      notes: 'Centroid of triangle from base: h/3. Semicircle: 4r/(3*pi).',
      priority: 'medium',
      history: [{ date: past7, action: 'Initial Study', confidence: 'initial', nextInterval: '7d' }]
    }
  };

  AppState.dailyStudyLog = {
    [past7]: [
      { subtopicId: 'p1_1_1_a', status: 'completed', loggedDate: past7 },
      { subtopicId: 'p1_gt1_1_a', status: 'completed', loggedDate: past7 }
    ],
    [past3]: [
      { subtopicId: 'p2_1_1_b', status: 'completed', loggedDate: past3 }
    ],
    [past1]: [
      { subtopicId: 'p1_1_1_b', status: 'completed', loggedDate: past1 }
    ],
    [todayStr]: [
      { subtopicId: 'p1_1_1_b', status: 'completed', loggedDate: todayStr },
      { subtopicId: 'p2_1_1_b', status: 'completed', loggedDate: todayStr }
    ]
  };

  AppState.activityLog = {
    [past7]: 3,
    [past3]: 4,
    [past1]: 5,
    [todayStr]: 2
  };

  AppState.selectedStudyTrackerDateStr = todayStr;
  persistData();
  renderCurrentTab();
  refreshLoggerSubtopicsList();
  calculateDailyStreak();
  showToast('✨ Demo sub-topic progress loaded successfully!', 'success');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  if (type === 'error') toast.style.borderLeftColor = '#ef4444';
  if (type === 'success') toast.style.borderLeftColor = '#10b981';

  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
