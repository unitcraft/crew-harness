"""Сравнить raw старого набора с отдельной базовой проверкой, не объявляя красный набор зелёным."""
import hashlib
import json
from pathlib import Path
import re
import sys


def load(path):
    data = Path(path).read_bytes()
    text = data.decode("utf-16") if data.startswith((b"\xff\xfe", b"\xfe\xff")) else data.decode("utf-8-sig")
    try:
        text = text.encode("cp866").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass
    return text, hashlib.sha256(data).hexdigest()


def failures(text):
    return {re.split(r" (?:—|тАФ) ", line.strip()[6:], maxsplit=1)[0]
            for line in text.splitlines() if line.startswith("  FAIL:")}


def normalized(text):
    text = text.replace("\r\n", "\n").strip()
    return re.sub(r"\(turn input-\d+, \d+ lines\)", "(turn [id], [count] lines)", text)


if len(sys.argv) != 3:
    raise SystemExit("Использование: compare-live.py <baseline-raw> <candidate-raw>")
base, base_hash = load(sys.argv[1])
candidate, candidate_hash = load(sys.argv[2])
b, c = failures(base), failures(candidate)
equal = normalized(base) == normalized(candidate)
print(json.dumps({"base_sha256": base_hash, "candidate_sha256": candidate_hash,
                  "base_failures": len(b), "candidate_failures": len(c),
                  "only_candidate": sorted(c - b), "only_base": sorted(b - c),
                  "normalized_raw_equal": equal}, ensure_ascii=False, indent=2))
raise SystemExit(0 if equal and b == c else 1)
