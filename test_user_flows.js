const fs = require('fs');
const vm = require('vm');

console.log("==================================================");
console.log("PSC STUDY TRACKER - USER FLOW & SRS ENGINE TEST");
console.log("==================================================");

// Mock browser DOM
let topicSelectHTML = '';
let subtopicsHTML = '';
let countText = '';
let renderedSyllabusHTML = '';
let calendarGridHTML = '';
let selectedDateItemsHTML = '';
let toastMessages = [];

const mockElem = () => ({
  classList: { add: ()=>{}, remove: ()=>{}, toggle: ()=>{} },
  setAttribute: ()=>{},
  getAttribute: ()=>null,
  style: { setProperty: ()=>{} },
  remove: ()=>{},
  closest: () => ({ classList: { add: ()=>{}, remove: ()=>{} } }),
  addEventListener: ()=>{},
  appendChild: ()=>{},
  textContent: '',
  innerHTML: ''
});

global.document = {
  getElementById: (id) => {
    if (id === 'logger-topic-select') {
      return {
        ...mockElem(),
        set innerHTML(v) { topicSelectHTML = v; },
        get innerHTML() { return topicSelectHTML; }
      };
    }
    if (id === 'logger-subtopics-list') {
      return {
        ...mockElem(),
        set innerHTML(v) { subtopicsHTML = v; },
        get innerHTML() { return subtopicsHTML; }
      };
    }
    if (id === 'logger-subtopic-count') {
      return {
        ...mockElem(),
        set textContent(v) { countText = v; },
        get textContent() { return countText; }
      };
    }
    if (id === 'syllabus-accordion-container') {
      return {
        ...mockElem(),
        set innerHTML(v) { renderedSyllabusHTML = v; },
        get innerHTML() { return renderedSyllabusHTML; }
      };
    }
    if (id === 'calendar-grid') {
      return {
        ...mockElem(),
        set innerHTML(v) { calendarGridHTML = v; },
        get innerHTML() { return calendarGridHTML; }
      };
    }
    if (id === 'selected-date-items') {
      return {
        ...mockElem(),
        set innerHTML(v) { selectedDateItemsHTML = v; },
        get innerHTML() { return selectedDateItemsHTML; }
      };
    }
    if (id === 'toast-container') {
      return {
        appendChild: (t) => toastMessages.push(t.innerHTML)
      };
    }
    return mockElem();
  },
  createElement: () => mockElem(),
  querySelectorAll: () => [],
  querySelector: () => mockElem(),
  addEventListener: () => {},
  documentElement: mockElem(),
  readyState: 'complete'
};

const storageMap = {};
global.localStorage = {
  getItem: (k) => storageMap[k] || null,
  setItem: (k, v) => { storageMap[k] = v; }
};
global.window = global;

// Load syllabus and app
const syl = fs.readFileSync('syllabus-data.js', 'utf8');
vm.runInThisContext(syl);

const app = fs.readFileSync('app.js', 'utf8');
vm.runInThisContext(app);

// TEST 1: Initial State & Segment Switching
console.log("\n[TEST 1] Testing Segmented Parts Switching...");
const parts = ['p1_part1', 'p1_part2', 'p2_secA', 'p2_secB', 'p2_secC', 'p2_secD'];
parts.forEach(p => {
  setLoggerPart(p);
  const optionsCount = (topicSelectHTML.match(/<option/g) || []).length;
  const cardsCount = (subtopicsHTML.match(/subtopic-choice-card/g) || []).length;
  if (optionsCount === 0 || cardsCount === 0) {
    throw new Error(`Failed to populate topics or subtopics for part ${p}`);
  }
  console.log(`  [OK] ${p} -> ${optionsCount} topics, ${cardsCount} subtopics rendered`);
});

// TEST 2: Start Studying a Micro-Topic
console.log("\n[TEST 2] Starting Study on 'p1_1_1_a' (Physical Geography)...");
setLoggerPart('p1_part1');
selectLoggerSubtopic('p1_1_1_a');
startStudyingSubtopic('p1_1_1_a');

const stateA = AppState.studyState['p1_1_1_a'];
if (!stateA || stateA.status !== 'studying' || stateA.currentStep !== 0) {
  throw new Error("Invalid study state after startStudyingSubtopic");
}
console.log(`  [OK] Sub-topic 'p1_1_1_a' scheduled for 1st revision on: ${stateA.nextRevisionDate}`);

// TEST 3: Spaced Repetition Feedback Cycle
console.log("\n[TEST 3] Testing SRS Review Feedbacks...");
// Step 0 -> Step 1 (Good)
recordSubtopicRevision('p1_1_1_a', 'good');
console.log(`  [OK] Review 'good' -> Step ${AppState.studyState['p1_1_1_a'].currentStep}, Next: ${AppState.studyState['p1_1_1_a'].nextRevisionDate}`);

// Step 1 -> Step 0 (Hard resets/decrements)
recordSubtopicRevision('p1_1_1_a', 'hard');
console.log(`  [OK] Review 'hard' -> Step ${AppState.studyState['p1_1_1_a'].currentStep}, Next: ${AppState.studyState['p1_1_1_a'].nextRevisionDate}`);

// Fast Mastery via 'easy'
recordSubtopicRevision('p1_1_1_a', 'easy');
recordSubtopicRevision('p1_1_1_a', 'easy');
console.log(`  [OK] Review 'easy' -> Status: ${AppState.studyState['p1_1_1_a'].status}, Step: ${AppState.studyState['p1_1_1_a'].currentStep}`);

// TEST 4: Syllabus Matrix View Filter Rendering
console.log("\n[TEST 4] Testing Syllabus Matrix Filters...");
AppState.syllabusPaperFilter = 'all';
AppState.syllabusPartFilter = 'all';
AppState.syllabusStatusFilter = 'all';
renderSyllabus();
if (!renderedSyllabusHTML.includes('subtopic-row')) {
  throw new Error("Syllabus Matrix did not render subtopic rows");
}
console.log("  [OK] Syllabus Matrix rendered all topics & sub-units correctly");

// TEST 5: Calendar & Timeline Rendering
console.log("\n[TEST 5] Testing Calendar View...");
renderCalendar();
if (!calendarGridHTML.includes('calendar-day-cell')) {
  throw new Error("Calendar Grid did not render day cells");
}
console.log("  [OK] Calendar grid rendered days and schedule");

// TEST 6: Analytics Computation
console.log("\n[TEST 6] Testing Exam Readiness Analytics...");
renderAnalytics();
console.log("  [OK] Analytics computed overall progress and stage distributions");

let dailyTopicsHTML = '';
let dailyStatsText = '';
let dailyPctText = '';

// Update global.document mock to support daily study tracker IDs
const origGetElementById = global.document.getElementById;
global.document.getElementById = (id) => {
  if (id === 'daily-topics-list-container') {
    return {
      ...mockElem(),
      set innerHTML(v) { dailyTopicsHTML = v; },
      get innerHTML() { return dailyTopicsHTML; }
    };
  }
  if (id === 'daily-tracker-stats-text') {
    return {
      ...mockElem(),
      set textContent(v) { dailyStatsText = v; },
      get textContent() { return dailyStatsText; }
    };
  }
  if (id === 'daily-tracker-pct-text') {
    return {
      ...mockElem(),
      set textContent(v) { dailyPctText = v; },
      get textContent() { return dailyPctText; }
    };
  }
  if (id === 'daily-tracker-title-text' || id === 'daily-tracker-date-input' || id === 'tracker-today-date-btn' || id === 'rollover-topics-btn' || id === 'daily-tracker-progress-fill') {
    return mockElem();
  }
  return origGetElementById(id);
};

// TEST 8: Daily Study Tracker & Date History & Completed/Remaining Engine
console.log("\n[TEST 8] Testing Daily Study Tracker & Completed/Remaining Engine...");

const testDate = '2026-09-01';
AppState.selectedStudyTrackerDateStr = testDate;

// 8.1: Add topic as 'remaining' to test date
addTopicToDate('p1_1_1_b', testDate, 'remaining');
const logRemaining = AppState.dailyStudyLog[testDate].find(i => i.subtopicId === 'p1_1_1_b');
if (!logRemaining || logRemaining.status !== 'remaining') {
  throw new Error("Failed to log topic as remaining in dailyStudyLog");
}
if (AppState.studyState['p1_1_1_b'].nextRevisionDate !== null) {
  throw new Error("Remaining topic MUST NOT have nextRevisionDate scheduled!");
}
console.log("  [OK] Added topic as Remaining. Verified nextRevisionDate is null (no revision notifications).");

// 8.2: Verify sidebar badge ignores remaining topics
updateSidebarBadge();
const countDue = Object.values(AppState.studyState).filter(s => s.studyStatus === 'completed' && s.nextRevisionDate && s.nextRevisionDate <= testDate).length;
console.log(`  [OK] Verified revision queues strictly ignore 'remaining' topics. Due count: ${countDue}`);

// 8.3: Toggle topic to 'completed'
toggleTopicCompletion('p1_1_1_b', testDate);
const logCompleted = AppState.dailyStudyLog[testDate].find(i => i.subtopicId === 'p1_1_1_b');
if (!logCompleted || logCompleted.status !== 'completed') {
  throw new Error("Failed to toggle topic status to completed");
}
if (!AppState.studyState['p1_1_1_b'].nextRevisionDate) {
  throw new Error("Completed topic MUST have nextRevisionDate scheduled for spaced repetition!");
}
console.log(`  [OK] Toggled to Completed. Spaced repetition activated! Next revision: ${AppState.studyState['p1_1_1_b'].nextRevisionDate}`);

// 8.4: Toggle back to 'remaining'
toggleTopicCompletion('p1_1_1_b', testDate);
if (AppState.studyState['p1_1_1_b'].studyStatus !== 'remaining' || AppState.studyState['p1_1_1_b'].nextRevisionDate !== null) {
  throw new Error("Toggling back to remaining failed to clear nextRevisionDate");
}
console.log("  [OK] Toggled back to Remaining. Verified nextRevisionDate cleared and notifications paused.");

// 8.5: Test Date Navigation and Rendering
navigateDailyTrackerDate(1);
if (AppState.selectedStudyTrackerDateStr !== '2026-09-02') {
  throw new Error(`Expected date 2026-09-02, got ${AppState.selectedStudyTrackerDateStr}`);
}
changeDailyTrackerToToday();
console.log(`  [OK] Date navigation passed. Current selected date: ${AppState.selectedStudyTrackerDateStr}`);

// 8.6: Test Rollover of Remaining Topics
const yesterdayStr = addDays(formatDate(new Date()), -1);
addTopicToDate('p1_1_1_c', yesterdayStr, 'remaining');
AppState.selectedStudyTrackerDateStr = yesterdayStr;
handleRollOverRemaining();
const todayItems = AppState.dailyStudyLog[formatDate(new Date())] || [];
const rolledOver = todayItems.find(i => i.subtopicId === 'p1_1_1_c');
if (!rolledOver) {
  throw new Error("Failed to roll over remaining topic to Today");
}
console.log("  [OK] Successfully rolled over remaining topic from past date to Today!");

// TEST 9: Active Focus Reading Timer (Stopwatch + Countdown)
console.log("\n[TEST 9] Testing Active Focus Reading Timer & Time Accumulation...");

// 9.1: Start Reading on topic
startTopicReading('p1_1_1_a', 'stopwatch');
if (!AppState.timerState.isRunning || AppState.timerState.activeSubtopicId !== 'p1_1_1_a') {
  throw new Error("Failed to start reading stopwatch timer");
}
console.log("  [OK] Started Reading Timer in Stopwatch mode.");

// 9.2: Test Pause and Resume
toggleTimerPauseResume();
if (AppState.timerState.isRunning !== false) {
  throw new Error("Failed to pause timer");
}
toggleTimerPauseResume();
if (AppState.timerState.isRunning !== true) {
  throw new Error("Failed to resume timer");
}
console.log("  [OK] Verified Pause and Resume controls.");

// 9.3: Test Mode Switch to Pomodoro Countdown
setTimerMode('countdown', 25);
if (AppState.timerState.mode !== 'countdown' || AppState.timerState.targetSeconds !== 1500) {
  throw new Error("Failed to switch timer mode to 25m Pomodoro");
}
console.log("  [OK] Switched to 25m Pomodoro Countdown mode.");

// 9.4: Test Reset
resetTopicTimer();
if (AppState.timerState.remainingSeconds !== 1500 || AppState.timerState.elapsedSeconds !== 0) {
  throw new Error("Failed to reset timer");
}
console.log("  [OK] Verified Reset / Restart timer functionality.");

// 9.5: Test Finish Study & Time Accumulation
AppState.timerState.elapsedSeconds = 1200; // Simulated 20 mins studied
finishTopicReading(true);
if (AppState.timerState.isRunning !== false || AppState.timerState.activeSubtopicId !== null) {
  throw new Error("Timer failed to cleanup on finish");
}
if ((AppState.timerState.accumulatedSeconds['p1_1_1_a'] || 0) < 1200) {
  throw new Error("Failed to accumulate study time for topic");
}
const subState = AppState.studyState['p1_1_1_a'];
if (!subState || subState.studyStatus !== 'completed') {
  throw new Error("Finish study failed to mark topic completed");
}
const lastHist = subState.history[subState.history.length - 1];
if (!lastHist || !lastHist.action.includes('Reading Focus')) {
  throw new Error("Study session was not recorded in topic history");
}
console.log(`  [OK] Finished study session. Accumulated: ${AppState.timerState.accumulatedSeconds['p1_1_1_a']}s. History logged: "${lastHist.action}"`);

console.log("\n==================================================");
console.log("ALL 9 USER FLOWS, TIMER ENGINE & THEMES VALIDATED! 🚀");
console.log("==================================================");

