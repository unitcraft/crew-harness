# -*- coding: utf-8 -*-
"""Библиотека самотестов стражей: пробы, одноразовые репозитории, изоляция среды.

Зачем: самотест, которому нужен репозиторий git, список имён и чистая среда, иначе зависел бы от
    машины, где его запустили (глобальная настройка git, переменные CI, локаль) и давал бы разные
    вердикты; здесь это собрано один раз.
Проверяет: ничего сам не проверяет; печатает строки «проба <вид> <имя>: ок|FAIL» и итог
    «итого: <N> проб, упало <K>», следит, чтобы законная проба шла первой.
Не проверяет: сами стражи (это делают test-<страж>.py рядом).
Правило: ADR-0006 и AGENTS.md п.15: все образцы нарушений собираются при прогоне, в файлах
    самотестов литералов нарушений нет.
"""
import sys

sys.dont_write_bytecode = True

import contextlib
import io
import os
import shutil
import stat
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
GUARDS = os.path.dirname(HERE)
SCRIPTS = os.path.dirname(GUARDS)
REPO = os.path.dirname(SCRIPTS)
LIB = os.path.join(GUARDS, "lib")

if LIB not in sys.path:
    sys.path.insert(0, LIB)

KINDS = ("законное", "красная", "иной-синтаксис", "мишень")


def _utf8_out():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace", newline="\n")
        except Exception:
            pass


class Probes(object):
    """Набор проб одного самотеста."""

    def __init__(self, title):
        _utf8_out()
        self.title = title
        self.total = 0
        self.failed = 0
        self.tmp = []

    def probe(self, kind, name, fn):
        assert kind in KINDS, kind
        self.total += 1
        verdict = "ок"
        detail = ""
        if self.total == 1 and kind != "законное":
            verdict, detail = "FAIL", "законная проба должна идти первой"
        else:
            try:
                fn()
            except AssertionError as exc:
                verdict, detail = "FAIL", str(exc)
            except Exception as exc:  # проба упала не проверкой, а ошибкой — тоже красный самотест
                verdict, detail = "FAIL", "%s: %s" % (exc.__class__.__name__, exc)
        if verdict == "FAIL":
            self.failed += 1
        line = "проба %s %s: %s" % (kind, name, verdict)
        if detail:
            line += " (%s)" % detail.replace("\n", " | ")
        print(line)
        sys.stdout.flush()

    def mkdtemp(self, prefix="guards-st-"):
        path = tempfile.mkdtemp(prefix=prefix)
        self.tmp.append(path)
        return path

    def done(self):
        for path in self.tmp:
            rmtree(path)
        print("итого: %d проб, упало %d" % (self.total, self.failed))
        sys.stdout.flush()
        return 1 if self.failed else 0


def rmtree(path):
    def onerror(func, p, exc):
        try:
            os.chmod(p, stat.S_IWRITE)
            func(p)
        except Exception:
            pass
    shutil.rmtree(path, onerror=onerror)


def isolated_env(base, extra=None):
    """Среда без глобальной настройки git, переменных CI и списков имён хозяина."""
    env = dict(os.environ)
    for key in list(env):
        if key.startswith("GIT_") or key.startswith("CREW_") or key in (
                "GITHUB_ACTIONS", "CI", "GITHUB_ENV", "GITHUB_OUTPUT"):
            del env[key]
    home = os.path.join(base, "home")
    os.makedirs(home, exist_ok=True)
    cfg = os.path.join(home, "gitconfig")
    if not os.path.exists(cfg):
        with open(cfg, "w", encoding="utf-8", newline="\n") as handle:
            handle.write("[user]\n\tname = Test Author\n\temail = author@example.test\n"
                         "[init]\n\tdefaultBranch = main\n[core]\n\tautocrlf = false\n"
                         "[commit]\n\tgpgsign = false\n")
    env["HOME"] = home
    env["USERPROFILE"] = home
    env["XDG_CONFIG_HOME"] = os.path.join(home, "xdg")
    env["GIT_CONFIG_GLOBAL"] = cfg
    env["GIT_CONFIG_NOSYSTEM"] = "1"
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    if extra:
        env.update(extra)
    return env


@contextlib.contextmanager
def patched_environ(env):
    """Подменить os.environ на время пробы (для вызовов библиотеки в этом же процессе)."""
    saved = dict(os.environ)
    os.environ.clear()
    os.environ.update(env)
    try:
        yield
    finally:
        os.environ.clear()
        os.environ.update(saved)


def run(cmd, cwd=None, env=None, input=None):
    """Запуск команды; stdout/stderr декодируются как UTF-8."""
    proc = subprocess.run(cmd, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          input=input if input is None or isinstance(input, bytes)
                          else input.encode("utf-8"))
    proc.out = proc.stdout.decode("utf-8", "replace")
    proc.err = proc.stderr.decode("utf-8", "replace")
    return proc


def git(repo, env, *args, **kw):
    proc = run(("git",) + args, cwd=repo, env=env, input=kw.get("input"))
    if proc.returncode != 0 and not kw.get("check") is False:
        raise AssertionError("git %s: %s" % (" ".join(args), proc.err.strip()[-200:]))
    return proc


def make_repo(base, env, files=None, name="repo", commit=True, message="init"):
    """Одноразовый репозиторий с файлами {путь: str|bytes}."""
    repo = os.path.join(base, name)
    os.makedirs(repo, exist_ok=True)
    git(repo, env, "init", "-q")
    write_files(repo, files or {})
    if files:
        git(repo, env, "add", "--", *sorted(files))
        if commit:
            git(repo, env, "commit", "-q", "-m", message)
    return repo


def write_files(repo, files):
    for rel, content in files.items():
        full = os.path.join(repo, *rel.split("/"))
        os.makedirs(os.path.dirname(full), exist_ok=True)
        data = content if isinstance(content, bytes) else content.encode("utf-8")
        with open(full, "wb") as handle:
            handle.write(data)


def commit_file(repo, env, rel, content, message="change"):
    write_files(repo, {rel: content})
    git(repo, env, "add", "--", rel)
    git(repo, env, "commit", "-q", "-m", message)
    return git(repo, env, "rev-parse", "HEAD").out.strip()


def names_file(base, patterns, crlf=False, name="names.txt"):
    """Список запрещённых имён для пробы: файл вне репозитория."""
    path = os.path.join(base, name)
    sep = "\r\n" if crlf else "\n"
    with open(path, "wb") as handle:
        handle.write((sep.join(patterns) + sep).encode("utf-8"))
    return path


def guard(script, repo, env, *args, **kw):
    """Запустить стража (путь относительно scripts/guards) в корне репозитория."""
    path = os.path.join(GUARDS, script)
    if script.endswith(".py"):
        cmd = (sys.executable, path) + args
    else:
        cmd = ("sh", path) + args
    return run(cmd, cwd=repo, env=env, input=kw.get("input"))


def verdict(proc):
    lines = [x for x in proc.out.splitlines() if x.strip()]
    return lines[-1] if lines else ""


def expect(proc, code, prefix):
    """Код возврата и начало последней строки вердикта."""
    got = verdict(proc)
    if proc.returncode != code or not got.startswith(prefix):
        raise AssertionError("ждали код %d и «%s», получили код %d и «%s» (stderr: %s)" % (
            code, prefix, proc.returncode, got, proc.err.strip()[-160:]))
    return got


def has_line(proc, text):
    return any(text in line for line in proc.out.splitlines())


def captured(fn, *args, **kw):
    """Вызвать функцию в этом процессе и вернуть (код, вывод)."""
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = fn(*args, **kw)
    return code, buf.getvalue()
