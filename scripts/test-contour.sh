#!/bin/sh
# Зачем: контур приёмки малого маршрута (задача 191): владелец проверяет правку вживую по ссылке, а живой
#     сервис не трогается; подъём и остановка — одной командой из дерева задачи.
# Проверяет: не страж, а инструмент исполнителя: поднимает пульт ЭТОГО дерева на свободном порту 8100+ со
#     своим data_dir во временной папке (по хешу пути дерева); страницы — src/web этого дерева, бинарники —
#     собранные основной копии (сборка этого дерева — по --build или когда diff main...HEAD трогает src/ вне
#     src/web); печатает ссылку и подсказку метки; --stop останавливает контур.
# Не проверяет: саму правку (её проверяет владелец на контуре) и код пульта (его тесты — в opencode-plugin).
# Правило: AGENTS.md п.11 (рабочую копию main не трогаем) и п.14; задача 191.
#
# test-contour.sh - a test contour of the console (пульт) from THIS worktree, for the owner's check of a small-route
# task (task 191): the owner says «сделай X мгновенно» / «сделай X, супер быстро» (the orchestrator recognizes the entry),
# the executor raises the contour and gives the owner the
# link; the mark «ссылка на контур выдана» is crew_task {action: "contour", n, link}.
#
#   sh scripts/test-contour.sh             start the contour, print the link (a free port from 8100 up)
#   sh scripts/test-contour.sh --port 8103 start on this port
#   sh scripts/test-contour.sh --build     build hub/front of THIS tree first (a server task), then start
#   sh scripts/test-contour.sh --stop      stop the contour of this tree
#
# What it does: the front and hub programs are the BUILT ones of the main copy (its target/), unless the task changes the
# server (the diff main...HEAD touches src/ outside src/web, or --build is given) — then they are built from THIS tree
# (nova build). The pages come from src/web of THIS tree (web_dir), the store is a files store in a data dir of its own
# (in the temporary folder, keyed by the path of the tree): the contour shares nothing with the live service. The pid of
# the front is written next to the data dir; --stop ends the front and its hub.
set -eu

tree=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$tree"

stop=0; build=0; port=0
while [ $# -gt 0 ]; do
    case "$1" in
        --stop) stop=1 ;;
        --build) build=1 ;;
        --port) shift; port=$1 ;;
        *) echo "unknown argument: $1 (— --stop, --build, --port N)" >&2; exit 2 ;;
    esac
    shift
done

hash=$(printf '%s' "$tree" | tr 'A-Z' 'a-z' | sha1sum | cut -c1-8)
dir="${TMPDIR:-/tmp}/crew-contour-$hash"
pidfile="$dir/contour.pid"

if [ "$stop" -eq 1 ]; then
    if [ ! -f "$pidfile" ]; then echo "the contour of this tree is not running (no $pidfile)"; exit 0; fi
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
        pkill -P "$pid" 2>/dev/null || true
        kill "$pid" 2>/dev/null || true
        echo "the contour of this tree is stopped (pid $pid with its hub)"
    else
        echo "the contour of this tree was not running (pid $pid is gone)"
    fi
    rm -f "$pidfile"
    exit 0
fi

# the main copy of the repository (its target/ holds the built programs of the live service)
main_copy=$(CDPATH= cd -- "$(git rev-parse --git-common-dir)/.." && pwd)

# a server task: the diff to main touches src/ outside src/web — build from THIS tree, else take the built main copy
if git diff --name-only main...HEAD -- src/ | grep -v '^src/web/' | grep -q .; then build=1; fi

front="$tree/target/crew-harness"
hub="$tree/target/crew-hub"
exe=""
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) exe=".exe" ;; esac
if [ "$build" -eq 1 ]; then
    echo "building the server programs of THIS tree..."
    nova build "src/crew_hub.nv" -o "target/crew-hub$exe"
    nova build "src/crew_harness.nv" -o "target/crew-harness$exe"
else
    front="$main_copy/target/crew-harness"
    hub="$main_copy/target/crew-hub"
    if [ ! -x "$front$exe" ] || [ ! -x "$hub$exe" ]; then
        echo "The built programs of the main copy are not there ($front$exe). Build them in the main copy:" >&2
        echo "  nova build src/crew_hub.nv -o target/crew-hub$exe" >&2
        echo "  nova build src/crew_harness.nv -o target/crew-harness$exe" >&2
        exit 1
    fi
fi
front="$front$exe"
hub="$hub$exe"

if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "the contour of this tree is already running: http://127.0.0.1:$(cat "$dir/contour.port")/ (pid $(cat "$pidfile"); stop: sh scripts/test-contour.sh --stop)"
    exit 0
fi
rm -f "$pidfile"

port_free() { python -c "import socket,sys; s=socket.socket(); s.bind(('127.0.0.1', int(sys.argv[1]))); s.close()" "$1" 2>/dev/null; }
if [ "$port" -le 0 ]; then
    p=8100
    while [ $p -lt 8200 ]; do if port_free $p; then port=$p; break; fi; p=$((p + 1)); done
    if [ "$port" -le 0 ]; then echo "no free port in 8100..8199" >&2; exit 1; fi
elif ! port_free "$port"; then
    echo "port $port is busy; another one: --port 0 or a free one" >&2; exit 1
fi

agent="opencode"
[ -n "$exe" ] && agent="opencode.cmd"
mkdir -p "$dir/data"
config="$dir/server.json"
python - "$config" "$port" "$dir/data" "$tree/src/web" "$hub" "$agent" <<'EOF'
import json, sys
path, port, data, web, hub, agent = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6]
json.dump({
    "port": port,
    "data_dir": data,
    "store": "files",
    "agents": [{"id": "opencode", "label": "OpenCode", "program": agent, "args": ["acp"]}],
    "idle_term_seconds": 900,
    "workdir": "",
    "web_dir": web,
    "hub": {"program": hub, "args": []},
}, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
EOF

"$front" serve "$config" >"$dir/front.out.log" 2>"$dir/front.err.log" &
pid=$!
sleep 1
if ! kill -0 "$pid" 2>/dev/null; then
    echo "the front exited at once; the log: $dir/front.err.log" >&2
    exit 1
fi
echo "$pid" >"$pidfile"
echo "$port" >"$dir/contour.port"
echo "the test contour of this tree is up: http://127.0.0.1:$port/"
echo "give the link to the owner and record the mark: crew_task {action: \"contour\", n: <N>, link: \"http://127.0.0.1:$port/\"}"
echo "stop: sh scripts/test-contour.sh --stop (data: $dir)"
