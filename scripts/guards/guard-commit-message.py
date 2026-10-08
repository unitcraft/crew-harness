# -*- coding: utf-8 -*-
"""Страж сообщения коммита: подпись автора, только ASCII, без соавторов, адрес автора, приватные данные.

Зачем: сообщения коммитов остаются в публичной истории навсегда; подпись (DCO), язык, трейлеры и
    приватные данные в них проверяются до коммита и до пуша, а не по просьбе.
Проверяет (сообщение в смысле «что git сохранит», lib/message.py): R1 «Signed-off-by» совпадает с
    автором (имя и адрес); R2 нет «Co-Authored-By»; R3 имя автора не пусто; R4 только ASCII, кроме
    строк цитаты на «>»; R5 адрес автора равен git config crewharness.expectedEmail (пишет
    установщик; нет настройки — красный «запусти установщик»); R6 в сообщении нет пути машины и
    образца из списка запрещённых имён (в том числе в строках на «#» при -m и -F и на «>»);
    R7 сообщение не пусто. Вердикт называет «сообщение коммита», строку и номер образца, не значение.
Не проверяет: содержание diff, который редактор показывает при -v; прошлые коммиты; правку истории.
    В режиме --ci правило R5 не применимо (установщик в CI не запускается) и печатает «судить
    нечего: CI, нет настройки установщика»; адрес автора там сверяется с подписью (R1).
Правило: AGENTS.md п.4 (сообщение по-английски, подпись, без трейлеров соавторства), п.15.

Вызов из хука commit-msg: --message-file <путь> --mode editor|message (режим задаёт обёртка хука по
GIT_EDITOR, сам страж среды не читает). Для pre-push и CI: --commit <хеш> (сообщение как сохранено),
CI добавляет --ci.
"""
import sys

sys.dont_write_bytecode = True

import os
import re

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))

import guardlib  # noqa: E402
import machine_paths  # noqa: E402
import message  # noqa: E402
import names  # noqa: E402

SIGNOFF = re.compile(r"^\s*Signed-off-by:\s*(.*?)\s*<([^<>]*)>\s*$", re.I)
COAUTHOR = re.compile(r"^\s*Co-authored-by\s*:", re.I)
IDENT = re.compile(r"^(.*) <([^<>]*)> \d+ [+-]\d{4}$")


def author_of(source, args):
    """(имя, адрес) автора: у готового коммита — из него, в хуке — из git var GIT_AUTHOR_IDENT."""
    if args.commit:
        out = guardlib.git(source.root, "show", "-s", "--format=%an%n%ae", args.commit)
        parts = out.decode("utf-8", "replace").rstrip("\n").split("\n")
        return (parts[0] if parts else ""), (parts[1] if len(parts) > 1 else "")
    out = guardlib.git(source.root, "var", "GIT_AUTHOR_IDENT", check=False).decode("utf-8", "replace").strip()
    m = IDENT.match(out)
    return (m.group(1), m.group(2)) if m else ("", "")


def config_value(source, *keys):
    out = guardlib.git(source.root, "config", *keys, check=False)
    return out.decode("utf-8", "replace").strip()


def message_lines(source, args):
    """Строки сообщения [(номер, текст)] в смысле «что git сохранит»."""
    if args.commit:
        raw = guardlib.git(source.root, "show", "-s", "--format=%B", args.commit).decode("utf-8", "replace")
        lines = [(i, line.rstrip("\r")) for i, line in enumerate(raw.split("\n"), 1)]
        while lines and not lines[-1][1].strip():
            lines.pop()
        return lines
    try:
        with open(args.message_file, "rb") as handle:
            raw = handle.read().decode("utf-8", "replace")
    except OSError:
        raise guardlib.Unavailable("не читается файл сообщения коммита")
    verbose = config_value(source, "--bool", "commit.verbose") == "true"
    comment = config_value(source, "core.commentChar")
    if len(comment) != 1:
        comment = "#"
    return message.effective_message(raw, args.mode, verbose, comment)


def check_signoff(label, lines, author, rep):
    signoffs = [(m.group(1), m.group(2)) for m in (SIGNOFF.match(t) for _, t in lines) if m]
    if not signoffs:
        rep.add(label, None, "signoff-missing", "нет строки Signed-off-by (git commit -s)")
    elif (author[0], author[1]) not in signoffs:
        rep.add(label, None, "signoff-author", "подпись не совпадает с автором коммита (имя и адрес)")


def check_trailers(label, lines, rep):
    for number, text in lines:
        if COAUTHOR.match(text):
            rep.add(label, number, "co-authored-by", "трейлер соавторства запрещён")


def check_author(label, author, expected, ci, rep):
    if not author[0].strip():
        rep.add(label, None, "author-name", "имя автора пусто")
    if ci:
        rep.accept(label, None, "expected-email", "судить нечего: CI, нет настройки установщика")
    elif not expected:
        rep.add(label, None, "expected-email",
                "нет настройки crewharness.expectedEmail: запусти установщик (sh scripts/install-hooks.sh)")
    elif author[1] != expected:
        rep.add(label, None, "expected-email", "адрес автора не совпадает с ожидаемым установщиком")


def check_ascii(label, lines, rep):
    for number, text in lines:
        if text.startswith(">"):
            continue
        if any(ord(ch) > 127 for ch in text):
            rep.add(label, number, "non-ascii", "не ASCII вне строк цитаты (сообщение по-английски)")


def check_private(label, lines, patterns, rep):
    for number, text in lines:
        for kind in machine_paths.find_machine_paths(text):
            rep.add(label, number, "machine-path", "путь машины (%s)" % kind)
        for sample in names.find_names(text, patterns):
            rep.add(label, number, "forbidden-name", "образец №%d" % sample)


def judge(source, args, rep):
    if bool(args.commit) == bool(args.message_file):
        raise guardlib.Unavailable("укажите либо --message-file и --mode, либо --commit")
    if args.message_file and not args.mode:
        raise guardlib.Unavailable("с --message-file нужен --mode editor|message")
    label = "сообщение коммита"
    if args.commit:
        short = guardlib.git(source.root, "rev-parse", "--short=7", args.commit).decode().strip()
        label += " " + short
    patterns = names.load_names()
    lines = message_lines(source, args)
    if not lines:
        rep.add(label, None, "empty-message", "сообщение пусто")
        return guardlib.Outcome(count=1)
    author = author_of(source, args)
    expected = config_value(source, "--get", "crewharness.expectedEmail")
    check_signoff(label, lines, author, rep)
    check_trailers(label, lines, rep)
    check_author(label, author, expected, args.ci, rep)
    check_ascii(label, lines, rep)
    check_private(label, lines, patterns, rep)
    return guardlib.Outcome(count=1)


def extra(parser):
    parser.add_argument("--message-file")
    parser.add_argument("--mode", choices=("editor", "message"))


if __name__ == "__main__":
    sys.exit(guardlib.run("guard-commit-message", "сообщений", judge, extra=extra))
