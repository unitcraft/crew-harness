#!/bin/sh
# accept-248.sh - the acceptance of task 248 (repeated by task 252 on the main without the methodology): the machines of the product are read from the disk, not compiled into the programs.
# From the root of the tree: NOVA=<nova.exe> ALULA=<alula.exe 0.27.0> sh doc/tasks/252-248-povtor-posle-rebeyza-mashiny-produkt/accept-248.sh
#   ACCEPT_248_BUILD=0 - take target/crew-hub.exe and target/crew-harness.exe as they are (no nova build);
#   ACCEPT_248_SRC=skip - no nova test of src/product_machines.
# Prints one line per red point and the verdict «ПРИНЯТО 248» or «НЕ ПРИНЯТО 248 (N красных)»; the exit code is the number of the red points.
red=0
say_red() { echo "КРАСНОЕ: $*"; red=$((red + 1)); }
say_ok() { echo "ок: $*"; }

[ -n "$NOVA" ] || { echo "NOVA is not set"; exit 100; }
[ -n "$ALULA" ] || { echo "ALULA is not set"; exit 100; }
work=$(mktemp -d)
# the hub is a Windows program: it is given the paths in the form C:/... (Git Bash names /tmp otherwise)
winpath() { if command -v cygpath > /dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }

# 1. nothing of machines/ is compiled into the programs
left=$(grep -n 'embed_str("\|embed_dir("' src/product_machines/*.nv src/machines/*.nv 2>/dev/null | grep -v '_test.nv:')
if [ -n "$left" ]; then say_red "embed_str/embed_dir в данных машин: $(echo "$left" | wc -l) строк"; else say_ok "embed_str/embed_dir в данных машин нет"; fi

# 2. the scenarios of the machines from the disk
p=$("$ALULA" test machines/product 2>&1 | tail -1)
case "$p" in "81 of 81 tests passed") say_ok "alula test machines/product: $p";; *) say_red "alula test machines/product: $p (нужно 81 of 81)";; esac
# the point of the methodology (514 of 514) is removed: task 249 took machines/methodology out of the product

# 3. the loader of the machines (nova test)
if [ "$ACCEPT_248_SRC" != "skip" ]; then
    if "$NOVA" test src/product_machines > "$work/nova-test.log" 2>&1; then say_ok "nova test src/product_machines"; else say_red "nova test src/product_machines: $(tail -3 "$work/nova-test.log" | tr '\n' ' ')"; fi
fi

# 4. the release kit
if [ ! -f scripts/package-release.sh ]; then
    say_red "scripts/package-release.sh нет"
else
    if [ "$ACCEPT_248_BUILD" != "0" ]; then
        "$NOVA" build src/crew_hub.nv -o target/crew-hub.exe > "$work/build.log" 2>&1 || say_red "nova build crew-hub: $(tail -3 "$work/build.log" | tr '\n' ' ')"
        "$NOVA" build src/crew_harness.nv -o target/crew-harness.exe >> "$work/build.log" 2>&1 || say_red "nova build crew-harness: $(tail -3 "$work/build.log" | tr '\n' ' ')"
    fi
    kit="$work/kit"
    if sh scripts/package-release.sh "$kit" > "$work/kit.log" 2>&1; then say_ok "комплект собран и проверен стражем"; else say_red "package-release: $(tail -3 "$work/kit.log" | tr '\n' ' ')"; fi
    for f in crew-harness.exe crew-hub.exe machines/product/dialog.alula.json machines/product/dialog.alula.md machines/product/journal.md machines/product/libs/call_cancel.alula.md; do
        [ -f "$kit/$f" ] || say_red "в комплекте нет $f"
    done
    ls "$kit"/machines/product/chat.* > /dev/null 2>&1 && say_red "в комплекте есть чат (по поправке 02:20 — не кладём)"
    [ -e "$kit/machines/product/tests" ] && say_red "в комплекте есть machines/product/tests"
    [ -e "$kit/machines/methodology" ] && say_red "в комплекте есть machines/methodology"

    # 5. the hub of the kit reads the machines beside it: as they are, a file put in place of another, a broken hash
    root=$(winpath "$(pwd)")
    node=$(winpath "$(command -v node)")
    hub_run() {  # $1 - the name of the run; prints the state of the snapshot of the session or the error of the start
        data="$work/data-$1"
        rm -rf "$data"; mkdir -p "$data"
        cat > "$work/settings-$1.json" <<EOF
{"data_dir": "$(winpath "$data")", "workdir": "$root", "acp_trace": false,
 "agents": [{"id": "opencode", "label": "Fake", "program": "$node", "args": ["$root/src/acp/testdata/fake_agent.mjs", "--live", "--ok"]}]}
EOF
        printf 'open\t1\nmsg\t1\t{"id":"p1","trace":"s248","step":0,"kind":"session_created","input":{"name":"accept","agent":"opencode"},"time":0}\n' > "$work/in-$1"
        (sleep 3; cat "$work/in-$1"; sleep 2) | (cd "$work" && "$kit/crew-hub.exe" "$(winpath "$work/settings-$1.json")") > "$work/out-$1" 2> "$work/err-$1"
        echo "exit $?" >> "$work/err-$1"
        if [ -f "$data/s248/snapshot" ]; then sed -n 's/.*\\"state\\":{\\"state\\":\\"\([^\\]*\)\\".*/\1/p' "$data/s248/snapshot" | head -1; else echo "НЕТ СНИМКА: $(tr '\n' ' ' < "$work/err-$1")"; fi
    }
    if [ -x "$kit/crew-hub.exe" ]; then
        s1=$(hub_run plain)
        [ "$s1" = "Idle" ] && say_ok "хаб комплекта: машина с диска, состояние $s1" || say_red "хаб комплекта: состояние «$s1», нужно Idle"
        grep -q "machines/product" "$work/err-plain" && say_ok "журнал хаба называет папку машин" || say_red "журнал хаба не называет папку машин"
        cp "$kit/machines/product/dialog.alula.json" "$work/dialog.saved"
        sed 's/"Idle"/"Resting"/g' "$work/dialog.saved" > "$kit/machines/product/dialog.alula.json"
        s2=$(hub_run swapped)
        [ "$s2" = "Resting" ] && say_ok "подмена dialog.alula.json меняет поведение: $s2" || say_red "подмена dialog.alula.json: состояние «$s2», нужно Resting"
        cp "$work/dialog.saved" "$kit/machines/product/dialog.alula.json"
        cp "$kit/machines/product/libs/call_cancel.alula.md" "$work/lib.saved"
        printf '\nЛишняя строка.\n' >> "$kit/machines/product/libs/call_cancel.alula.md"
        s3=$(hub_run broken)
        if grep -q "hash e193a5abd356" "$work/err-broken" && ! grep -q "^exit 0" "$work/err-broken"; then say_ok "битый хеш библиотеки — ошибка: $(grep -m1 hash "$work/err-broken")"; else say_red "битый хеш библиотеки не остановил хаб: $s3"; fi
        cp "$work/lib.saved" "$kit/machines/product/libs/call_cancel.alula.md"
        cp "$kit/machines/product/dialog.alula.md" "$work/table.saved"
        rm "$kit/machines/product/dialog.alula.md"
        s4=$(hub_run missing)
        cp "$work/table.saved" "$kit/machines/product/dialog.alula.md"
        if grep -q "machines/product/dialog.alula.md" "$work/err-missing" && ! grep -q "^exit 0" "$work/err-missing"; then say_ok "нет файла — ошибка с путём"; else say_red "нет файла — хаб запустился: $s4"; fi
    else
        say_red "в комплекте нет запускаемого crew-hub.exe"
    fi
fi

if [ "$red" -eq 0 ]; then echo "ПРИНЯТО 248"; else echo "НЕ ПРИНЯТО 248 ($red красных)"; fi
exit "$red"
