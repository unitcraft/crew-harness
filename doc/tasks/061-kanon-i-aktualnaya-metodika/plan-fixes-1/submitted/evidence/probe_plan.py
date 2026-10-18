"""One-shot plan evidence; not a product parser or runtime validator."""
import hashlib
import json
import pathlib
import re
import subprocess
import sys

e = pathlib.Path(__file__).resolve().relative_to(pathlib.Path.cwd()).parent
t = e.parent
plan = (t / "plan.md").read_text(encoding="utf-8")
old = (e / "plan-before.md").read_text(encoding="utf-8")
before = json.loads((e / "baseline.json").read_text(encoding="utf-8"))
expected = json.loads((e / "expected.json").read_text(encoding="utf-8"))
actual = {}
replay = "--replay" in sys.argv

def section(text, title):
    return text.split("## " + title + "\n", 1)[1].split("\n## ", 1)[0]

def step(n):
    return re.search(r"^" + str(n) + r"\. (.*?)(?=^\d+\. |^## |\Z)", section(plan, "План"), re.M | re.S).group(1)

def check(label, value):
    actual[label] = value
    assert value == expected[label], (label, expected[label], value)
    print(label + " " + json.dumps(value, ensure_ascii=False, sort_keys=True))

# P1 binds the plan condition to the actual instruction, then tests its counterexample.
s3, s5 = step(3), step(5)
assert "не изменение process/README/ADR/AGENTS или создание current" in s3
assert "также D0" in s3 and "Ни один из них не становится новым проектным правилом" in s3
assert "Только согласованное проектное отличие может перейти шагом 5" in s3
assert "Анализ D0 не переносится в process пересказом" in s5
literal = "Внести проектное правило «остановка на воротах — вопрос»"
assert literal in old and literal not in plan
check("P1", {"D0_without_override": "external_only", "literal_old_instruction": "defect", "justified_override_before_gate": "stop"})

# P2 measures real paths; the only write is a new, explicitly test-only fixture.
old_names = ["read-map.md", "baseline.md", "fingerprints.md", "preconditions.md", "coverage.md", "probes.md"]
notes = t / "NEWs3-1"
existing = [p for p in (notes / n for n in old_names) if p.exists()]
for p in existing + [notes / "qualification.md"]:
    raw = p.read_bytes()
    assert before[p.as_posix()] == {"sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}
historical_before = [n for n in before if n.startswith(t.as_posix() + "/") and ("before" in pathlib.PurePosixPath(n).name or "expected" in pathlib.PurePosixPath(n).name)]
assert historical_before
new1 = [t / "evidence/launch-100-С5" / n for n in old_names]
new2 = [t / "evidence/launch-101-С6" / n for n in old_names]
assert all(not p.exists() for p in new1 + new2)
assert "Ни общий `evidence/`, ни папка прежней сессии целиком из защиты не исключаются" in plan
fixtures = e / "fixtures"
stale = fixtures / "stale.md"
if replay:
    assert stale.read_bytes() == b"before: immutable test-only fixture\n"
else:
    fixtures.mkdir(exist_ok=False)
    with stale.open("xb") as f:
        f.write(b"before: immutable test-only fixture\n")
sha = hashlib.sha256(stale.read_bytes()).hexdigest()
try:
    with stale.open("xb") as f:
        f.write(b"invalid replacement")
    stale_result = "overwritten"
except FileExistsError:
    stale_result = "FileExistsError"
print("P2_details " + json.dumps({"historical_before_expected_count": len(historical_before), "fixture_sha256": sha, "old_files": [p.name for p in existing]}, ensure_ascii=False))
check("P2", {"old_assigned_existing": len(existing), "qualification_exists": (notes / "qualification.md").exists(), "old_coverage_exists": (notes / "coverage.md").exists(), "new_paths_distinct": len(set(new1 + new2)) == 12 and not set(new1 + new2).intersection(existing), "stale_write": stale_result, "stale_hash_preserved": hashlib.sha256(stale.read_bytes()).hexdigest() == sha, "old_before_protected": all(n in before for n in historical_before), "broad_history_exclusion": "reject"})

# P3 checks only the documented form, not an invented OpenCode API.
base = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
date = subprocess.check_output(["git", "show", "-s", "--format=%cs", "HEAD"], text=True).strip()
branch = "task/061-kanon-i-aktualnaya-metodika"
assert subprocess.check_output(["git", "rev-parse", "--verify", "refs/heads/" + branch], text=True).strip() == base
literal_current = "Документ задачи: после сдачи история; где действует результат — current.md в этой папке, если он есть"
def form(text):
    lines = text.splitlines()
    if lines[:3] != ["Статус: черновик", "База: ревизия " + base + ", " + date, literal_current]:
        return False
    if not all("## " + s + "\n" in text for s in ["План", "DoD", "Требует утверждения"]):
        return False
    return ("Ветка: " + branch in section(text, "План")
            and re.findall(r"^(\d+)\. ", section(text, "План"), re.M) == [str(i) for i in range(1, 8)]
            and bool(re.search(r"^\[ \] ", section(text, "DoD"), re.M)))
check("P3", {"new_form": form(plan), "old_form": form(old), "missing_base_mutation": form(plan.replace("База: ревизия ", "Нет базы: ", 1)), "steps": [int(n) for n in re.findall(r"^(\d+)\. ", section(plan, "План"), re.M)]})

# P4 is an explicitly bounded condition model, tied to plan anchors for manual review.
assert "Любой drift между проверкой и внесением останавливает перенос" in plan
assert "даже если scope не меняется" in plan
assert "Правило без исключений относится к первому фактическому переносу любого результата" in s5
assert "format-later не откладывает указатель" in old  # inherited positive control
s6 = step(6)
assert "отдельная положительная оценка versions/compatibility" in s6
assert "значениям трёх версий" in s6 and "вернуть вопрос о shape владельцу" in s6
assert "После уже состоявшихся ворот/приёмки решение принимает владелец" in plan

def transfer(current, approved=True):
    return "allow" if current and approved else "stop"

def drift(changed, scope_changed):
    return "stop_delta_repeat_gate" if changed else "allow"

check("P4", {"canon_with_current": transfer(True), "canon_without_current_format_later": transfer(False), "format_first_with_current_and_approvals": transfer(True, True), "drift_same_scope": drift(True, False), "drift_changed_scope": drift(True, True), "shape_without_compatibility": "return_owner", "three_versions_not_approved": transfer(True, False), "passed_gate_pin_integrator_only": "stop_owner"})
if replay:
    assert json.loads((e / "probe-results.json").read_text(encoding="utf-8"))["actual"] == actual
else:
    with (e / "probe-results.json").open("x", encoding="utf-8") as f:
        json.dump({"actual": actual, "expected": expected, "scope": "Авторские плановые контроли; не runtime и не независимый PASS"}, f, ensure_ascii=False, indent=2)
print("Итог: 4 авторские пробы соответствуют закреплённым expected; runtime не проверялся")
