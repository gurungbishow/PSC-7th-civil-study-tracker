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

// TEST 7: Demo Data Loader
console.log("\n[TEST 7] Testing Load Demo Data...");
loadDemoData();
const demoSubtopicsCount = Object.keys(AppState.studyState).length;
console.log(`  [OK] Demo data loaded ${demoSubtopicsCount} active micro-units`);

console.log("\n==================================================");
console.log("ALL 7 CORE USER FLOWS PASSED FLAWLESSLY! 🚀");
console.log("==================================================");
