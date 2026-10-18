"""Scoped preservation and final immutable submission, without repository writes outside evidence."""
import argparse
import difflib
import hashlib
import json
import pathlib
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--methodology", required=True)
parser.add_argument("--045", dest="registry", required=True)
parser.add_argument("--013", dest="runner", required=True)
args = parser.parse_args()
e = pathlib.Path(__file__).resolve().relative_to(pathlib.Path.cwd()).parent
t = e.parent
plan_path = (t / "plan.md").as_posix()
report_path = t / "plan-fixes-1.md"

def fp(raw):
    return {"sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}

def dump(name, value):
    destination = e / name
    if destination.exists():
        destination = e / ("final-" + name)
    attempt = 2
    while destination.exists():
        destination = e / ("final-" + str(attempt) + "-" + name)
        attempt += 1
    with destination.open("x", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False, indent=2)

def git(root, *cmd):
    return subprocess.check_output(["git", "-C", str(root), *cmd])

before = json.loads((e / "baseline.json").read_text(encoding="utf-8"))
expected = {n: {"before": value, "permission": "mutable-plan" if n == plan_path else "protected"} for n, value in before.items()}
dump("preservation-expected.json", expected)
after = {n: fp(pathlib.Path(n).read_bytes()) for n in before}
changed = [n for n in before if before[n] != after[n]]
assert changed == [plan_path], changed
assert fp((e / "plan-before.md").read_bytes()) == before[plan_path]
assert after[(t / "spec.md").as_posix()]["sha256"] == "359819ee6b75d789b94853ac7054742c1c675597e6aee3d05f36ad43abd11c0b"
assert git(".", "rev-parse", "HEAD").decode().strip() == "492c166fbd12e00a6a924efab065f6adb4bd91f6"
assert git(".", "branch", "--show-current").decode().strip() == "plan/061-fixes-r1"
skip = {(t / n).as_posix() for n in ["progress.log", "profile.log", "usage.log"]}
new = []
for p in pathlib.Path(".").rglob("*"):
    if not p.is_file():
        continue
    n = p.as_posix()
    if n in before or n in skip:
        continue
    assert n.startswith(e.as_posix() + "/") or n == report_path.as_posix(), n
    new.append(n)
dump("after.json", {"files": after, "changed": changed, "new_allowed_at_check": sorted(new), "HEAD": git(".", "rev-parse", "HEAD").decode().strip(), "status": git(".", "status", "--short", "--branch").decode("utf-8")})

ext_before = json.loads((e / "external-before.json").read_text(encoding="utf-8"))
roots = {"methodology": pathlib.Path(args.methodology), "045": pathlib.Path(args.registry), "013": pathlib.Path(args.runner)}
ext_after = {}
status_notes = {}
for label, root in roots.items():
    files = {}
    for p in root.rglob("*"):
        n = p.relative_to(root)
        if any(part in {".git", "node_modules"} for part in n.parts[:-1]):
            continue
        if p.is_file():
            files[n.as_posix()] = fp(p.read_bytes())
    ext_after[label] = {"files": files, "HEAD": git(root, "rev-parse", "HEAD").decode().strip(), "status": git(root, "status", "--short", "--branch").decode("utf-8")}
    assert ext_after[label]["files"] == ext_before[label]["files"], label + ": files"
    assert ext_after[label]["HEAD"] == ext_before[label]["HEAD"], label + ": HEAD"
    if ext_after[label]["status"] != ext_before[label]["status"]:
        normalize = lambda s: re.sub(r"\[behind \d+\]", "[behind <n>]", s)
        assert normalize(ext_after[label]["status"]) == normalize(ext_before[label]["status"]), label + ": unexpected status"
        status_notes[label] = {"before": ext_before[label]["status"], "after": ext_after[label]["status"], "qualification": "Отличается только счёт behind при неизменных HEAD/файлах; внешние tracking refs не менялись этой сессией. Это наблюдение, не полное совпадение status."}
dump("external-after.json", ext_after)
dump("external-status-notes.json", status_notes)

approved_before = json.loads((e / "approved031-before.json").read_text(encoding="utf-8"))
rev = "4b48c50eef1fb46af4f074a80511979b16e515e3"
names = git(".", "ls-tree", "-r", "--name-only", rev, "--", "doc/tasks/031-runner-regulation-in-plugin/").decode().splitlines()
approved_after = {n: fp(git(".", "show", rev + ":" + n)) for n in names}
assert approved_after == approved_before
dump("approved031-after.json", approved_after)

# Checkout preservation is raw; Git LF blobs are distinguished from checkout line endings.
method_version = "78ed75838ef58073153e5343c9483bc462721a31"
objects = {}
for name in ["README.md", "methodology.md", "task-algorithm.md", "task-sessions.md", "task-runner.md", "completeness-check.md"]:
    raw = git(roots["methodology"], "show", method_version + ":" + name)
    checkout = (roots["methodology"] / name).read_bytes()
    assert fp(checkout) == ext_before["methodology"]["files"][name], name + ": checkout raw"
    assert raw == checkout or raw == checkout.replace(b"\r\n", b"\n"), name + ": content"
    objects[name] = {"git_blob": fp(raw), "checkout_raw": fp(checkout), "equal_raw": raw == checkout, "equal_after_checkout_CRLF_to_LF": raw == checkout.replace(b"\r\n", b"\n")}
dump("method-object-fingerprints.json", {"version": method_version, "files": objects, "qualification": "Git blob raw LF отличён от raw checkout. Raw checkout совпадает с ранним снимком; при CRLF отдельно доказано равенство после LF-нормализации. Это не отдельный ранний снимок Gitdatabase."})

old = (e / "plan-before.md").read_text(encoding="utf-8").splitlines(keepends=True)
new_plan = (t / "plan.md").read_text(encoding="utf-8").splitlines(keepends=True)
assert (e / "full-diff.patch").read_text(encoding="utf-8") == "".join(difflib.unified_diff(old, new_plan, fromfile="plan-before.md", tofile="plan.md"))
results = json.loads((e / "probe-results.json").read_text(encoding="utf-8"))
assert results["actual"] == results["expected"]
summary = (
    "# Итоговая сохранность\n\n"
    f"Собственный ранний corpus: {len(before)} файлов, изменён только `plan.md`; остальные {len(before)-1} совпали SHA/bytes, отсутствующих нет.\n"
    "Все новые файлы — собственные разрешённые plan-fixes-1.md/plan-fixes-1/**. Три точных корневых журнала исключены как mutable append-only; их строки писались только инструментами (profile — дописка), старые не редактировались.\n\n"
    "Старый plan: " + json.dumps(before[plan_path]) + "\n\nНовый plan: " + json.dumps(after[plan_path]) + "\n\n"
    "Approved spec SHA: " + after[(t / "spec.md").as_posix()]["sha256"] + ". Метаданные 1/127 не исправлялись, нормативное тело не менялось.\n\n"
    f"Approved031: {len(approved_after)} Git-файлов совпали с собственным ранним снимком.\n"
    "Внешние scoped снимки совпали по SHA/bytes, набору путей и HEAD: "
    + ", ".join(k + " — " + str(len(v["files"])) for k, v in ext_after.items()) + ".\n\n"
    + "Отдельные отличия status (если есть): " + json.dumps(status_notes, ensure_ascii=False) + ". Это не совпадение status; ранний снимок не заменён.\n\n"
    "Область: рабочие деревья без внутренностей .git-каталогов/node_modules; .git-файлы включены только hash/bytes. Payload .git не сохранялся. Это не аудит Gitdatabase. Собственный Канон/code/config/история и вложенные journals входят в 988-файловый corpus.\n\n"
    "Preservation expected выведен из исходного baseline, не after; plan в нём остаётся mutable input с исходным SHA. Старые before/expected/reviews не исключались.\n\n"
    "Полный diff повторно равен old→new. Четыре собственные пробы совпадают с заранее закреплёнными expected; независимый PASS не заявлен. Remote latest не измерялся, fetch/commit/refs/merge/push/live/heavy не выполнялись.\n"
)
with (e / "fingerprints.md").open("x", encoding="utf-8") as f:
    f.write(summary)

# Last subject operation: freeze exact submitted bytes and manifest. No later source edits.
submitted = e / "submitted"
submitted.mkdir(exist_ok=False)
sources = [p for p in e.rglob("*") if p.is_file() and submitted not in p.parents]
manifest = {}
for source, destination in [(t / "plan.md", submitted / "plan.md"), (report_path, submitted / "plan-fixes-1.md")] + [(p, submitted / "evidence" / p.relative_to(e)) for p in sources]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    raw = source.read_bytes()
    with destination.open("xb") as f:
        f.write(raw)
    assert destination.read_bytes() == raw
    manifest[destination.relative_to(submitted).as_posix()] = {"source": source.as_posix(), **fp(raw)}
with (submitted / "manifest.json").open("x", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
print(summary)
print("Заморожено файлов:", len(manifest))
print("Manifest SHA256:", fp((submitted / "manifest.json").read_bytes())["sha256"])
