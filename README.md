# 📐 PSC 7th Level Study & Revision Tracker

A web application designed for candidates preparing for the **Public Service Commission (Lok Sewa Aayog) Nepal - Gazetted Third Class (7th Level) Engineering Service (Civil Group)** examination.

---

## 🌟 Key Features

### 1. 🧠 Intelligent Spaced Repetition (1-3-7-21 Algorithm)
* **Active Learning Lifecycle:** Starts automatically the day you study a topic.
* **Smart Review Intervals:**
  * **Day 1 (Initial Study):** Core concept learning and notes.
  * **Day 2 (+1 Day):** 1st Revision - Active recall flash test.
  * **Day 4 (+3 Days):** 2nd Revision - Problem solving and past questions.
  * **Day 11 (+7 Days):** 3rd Revision - Deep formula and design review.
  * **Day 32 (+21 Days):** 4th Revision - Comprehensive mastery.
* **Adaptive Confidence Feedback:**
  * 🔴 **Hard:** Resets review to tomorrow (+1d) for immediate reinforcement.
  * 🟡 **Good:** Progresses smoothly to the next interval.
  * 🟢 **Easy:** Advances quickly to mastery (+60d).

### 2. 📚 Complete Pre-Loaded PSC 7th Syllabus (105 Topics)
* **Paper I: General Subject (100 Marks)**
  * **Part I:** General Awareness (16 topics) & General Ability / Reasoning (3 units)
  * **Part II:** General Technical Subject (Structural, Surveying, Construction Materials, Concrete Tech, Geotechnical, Construction Management, Estimating, Drawing, Economics, Professional Practice)
* **Paper II: Technical Subject (100 Marks)**
  * **Section A (30 Marks):** Structural Engineering & Geotechnical Engineering
  * **Section B (25 Marks):** Water Resources Engineering (Hydrology, Hydraulics, Irrigation, Hydropower)
  * **Section C (25 Marks):** Transportation Engineering (Highways & Airport Engineering)
  * **Section D (20 Marks):** Sanitary & Environmental Engineering (Water Supply, Sanitary, Environmental Assessment)

### 3. 🎯 Daily Action Dashboard
* **Due Today Queue:** Active recall cards with 1-click feedback buttons.
* **Overdue Revisions Alert:** Urgent recall notice with batch postpone (+1d) protection.
* **Daily Study Logger:** Quick-add topics learned today.
* **Streak Counter:** Tracks unbroken daily study consistency.

### 4. 📅 Interactive Calendar & Timeline
* Monthly schedule grid with visual badges indicating planned revisions on every date.
* Click any date to view and manage that day's scheduled topics.

### 5. 📈 Analytics & Exam Readiness
* Overall syllabus completion circular gauge.
* Paper I vs Paper II progress breakdown bars.
* 30-Day study activity heatmap.

### 6. 📝 Topic Notes & Formula Drawer
* Slide-out editor for summary notes, key equations, and past exam question references.
* Auto-saving local storage with revision history logs.

### 7. 💾 Offline-First & JSON Backup
* 100% offline functionality.
* 1-Click JSON export and import for cross-device synchronization and safety.

---

## 🚀 How to Run Locally

Simply double-click `index.html` in your browser or serve using any simple HTTP server:

```bash
# Python
python -m http.server 3000

# or Node
npx serve .
```
Then open `http://localhost:3000` in your web browser.
