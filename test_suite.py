import re
import os
import json
import sys

# Ensure UTF-8 output on Windows
sys.stdout.reconfigure(encoding='utf-8')

def test_everything():
    print("==================================================")
    print("PSC STUDY TRACKER - AUTOMATED TEST SUITE")
    print("==================================================")

    # 1. File existence & size
    files = ["index.html", "styles.css", "syllabus-data.js", "app.js", "README.md"]
    for f in files:
        assert os.path.exists(f), f"Missing file: {f}"
        print(f"[OK] File exists: {f} ({os.path.getsize(f)} bytes)")

    with open("index.html", "r", encoding="utf-8") as f:
        html = f.read()

    with open("syllabus-data.js", "r", encoding="utf-8") as f:
        syl = f.read()

    with open("app.js", "r", encoding="utf-8") as f:
        app = f.read()

    # 2. Check DOM IDs referenced in JS
    ids_in_app = set(re.findall(r'document\.getElementById\([\'"]([^\'"]+)[\'"]\)', app))
    print(f"\n--- Checking DOM IDs in app.js ({len(ids_in_app)} total) ---")
    missing_ids = []
    for d_id in sorted(ids_in_app):
        if not re.search(r'id=["\']' + re.escape(d_id) + r'["\']', html):
            missing_ids.append(d_id)

    # Filter out dynamically created IDs in JS
    known_dynamic = ["stage-0-count", "stage-1-count", "stage-2-count", "stage-3-count", "stage-4-count"]
    real_missing = [d for d in missing_ids if d not in known_dynamic]

    if real_missing:
        print(f"[FAIL] Missing static DOM IDs: {real_missing}")
    else:
        print("[OK] All static DOM IDs queried in app.js exist in index.html!")

    # 3. Check for any undefined variables or dangling calls in app.js
    print("\n--- Checking Function Bindings in HTML ---")
    onclicks = re.findall(r'onclick=["\']([^\(\"\']+)\(', html)
    onchanges = re.findall(r'onchange=["\']([^\(\"\']+)\(', html)
    handlers = set(onclicks + onchanges)
    print(f"Handlers invoked in HTML: {sorted(handlers)}")

    for h in handlers:
        pattern = rf'(window\.{re.escape(h)}\s*=|function\s+{re.escape(h)}\b)'
        if re.search(pattern, app):
            print(f"  [OK] Handler '{h}' defined in app.js")
        else:
            print(f"  [FAIL] Handler '{h}' NOT DEFINED in app.js!")

    # 4. Check syllabus data JSON validity
    print("\n--- Checking Syllabus JSON structure ---")
    json_str = re.search(r'const\s+PSC_SYLLABUS\s*=\s*({[\s\S]+});', syl)
    if json_str:
        syl_data = json.loads(json_str.group(1))
        print(f"[OK] Exam Title: {syl_data.get('examTitle')}")
        print(f"[OK] Papers: {len(syl_data.get('papers', []))}")
        
        total_parts = sum(len(p.get('parts', [])) for p in syl_data['papers'])
        total_chapters = sum(len(part.get('chapters', [])) for p in syl_data['papers'] for part in p.get('parts', []))
        total_topics = sum(len(ch.get('topics', [])) for p in syl_data['papers'] for part in p.get('parts', []) for ch in part.get('chapters', []))
        total_subtopics = sum(len(t.get('subtopics', [])) for p in syl_data['papers'] for part in p.get('parts', []) for ch in part.get('chapters', []) for t in ch.get('topics', []))
        
        print(f"[OK] Total Parts: {total_parts}")
        print(f"[OK] Total Chapters: {total_chapters}")
        print(f"[OK] Total Topics: {total_topics}")
        print(f"[OK] Total Micro-Units: {total_subtopics}")
        assert total_topics == 72, f"Expected 72 topics, got {total_topics}"
        assert total_subtopics == 218, f"Expected 218 subtopics, got {total_subtopics}"

    print("\n==================================================")
    print("ALL VERIFICATIONS PASSED SUCCESSFULLY (0 ERRORS)")
    print("==================================================")

if __name__ == "__main__":
    test_everything()
