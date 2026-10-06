// Self-test of the project's deny rules for crew_watch (plan 013, item 6; node >= 24):  node test/crew-deny.test.mjs
// crew_watch runs its command in the OpenCode server, outside the window's permissions; so the command is checked
// against permissions.deny of the project's .claude/settings.json (from the tab's directory up to the git root).
// Bash(prefix:*) / PowerShell(prefix:*) -- a command prefix, checked on the whole command and on every subcommand
// (&&, ||, ;, |, newline, the body of bash -c / sh -c, $(...)); Read(glob) -- a command naming a matching file.
// Harmless commands pass. No settings file -- no check; an unreadable one -- refusal.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-deny-"))
process.env.XDG_DATA_HOME = tmp
const d = await import("../deny.ts")
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}

// the deny list of the nova project (copied, not read from nova)
const NOVA_DENY = ["Read(./**/.env*)", "Read(./**/*.pem)", "Read(./**/*.key)", "Read(./**/*.p12)", "Read(./**/*.pfx)", "Read(./**/id_rsa*)", "Read(./**/id_ed25519*)", "Bash(git reset --hard:*)", "Bash(git clean -fd:*)", "PowerShell(git reset --hard:*)", "PowerShell(git clean -fd:*)"]
const repo = path.join(tmp, "repo")
const sub = path.join(repo, "scripts", "deep")
mkdirSync(path.join(repo, ".git"), { recursive: true })
mkdirSync(path.join(repo, ".claude"), { recursive: true })
mkdirSync(sub, { recursive: true })
writeFileSync(path.join(repo, ".claude", "settings.json"), JSON.stringify({ permissions: { allow: ["Bash(git status:*)"], deny: NOVA_DENY } }))

// 1. harmless commands pass
for (const c of ["bash scripts/gate.sh", "gh run list", "git status", "until [ -f x ]; do sleep 30; done", "git log --oneline -3 2>&1 | tail -1", "cat notes.env README.md", "git -C ../wt diff --stat", "echo hard reset"])
  cell(`passes: ${c}`, d.watchRefusal(c, repo) === undefined, d.watchRefusal(c, repo))

// 2. denied commands, whole and by subcommand, each naming its rule
const refused = [
  ["git reset --hard", "Bash(git reset --hard:*)"],
  ["git reset --hard origin/main", "Bash(git reset --hard:*)"],
  ["git status && git reset --hard HEAD~1", "Bash(git reset --hard:*)"],
  ["false || git clean -fdx", "Bash(git clean -fd:*)"],
  ["git status; git clean -fd", "Bash(git clean -fd:*)"],
  ["echo y | git reset --hard", "Bash(git reset --hard:*)"],
  ["echo a\ngit reset --hard", "Bash(git reset --hard:*)"],
  ["bash -c 'git reset --hard'", "Bash(git reset --hard:*)"],
  ['sh -c "cd x && git clean -fd"', "Bash(git clean -fd:*)"],
  ["until [ -f x ]; do sleep 1; done; git reset --hard", "Bash(git reset --hard:*)"],
  ["git -C ../wt reset --hard", "Bash(git reset --hard:*)"],
  ["FOO=1 timeout 60 git reset --hard", "Bash(git reset --hard:*)"],
  ["echo $(git reset --hard)", "Bash(git reset --hard:*)"],
  ["cat .env", "Read(./**/.env*)"],
  ["grep TOKEN config/.env.local", "Read(./**/.env*)"],
  ["openssl x509 -in certs/server.pem -noout", "Read(./**/*.pem)"],
  ["cp ~/.ssh/id_ed25519 /tmp/x", "Read(./**/id_ed25519*)"],
  ["bash -c 'cat secrets/app.key'", "Read(./**/*.key)"],
]
for (const [c, rule] of refused) {
  const r = d.watchRefusal(c, repo) ?? ""
  cell(`refused: ${JSON.stringify(c)} -> ${rule}`, /не поставлено/.test(r) && r.includes(`«${rule}»`), r)
}
const subText = d.watchRefusal("git status && git reset --hard HEAD~1", repo)
cell("the refusal names the matching subcommand", /подкоманда «git reset --hard HEAD~1»/.test(subText ?? ""), subText)

// 3. where the rules come from: the tab's directory up to the git root
cell("found from a subdirectory of the repository", /Bash\(git reset --hard/.test(d.watchRefusal("git reset --hard", sub) ?? ""), d.watchRefusal("git reset --hard", sub))
const bare = path.join(tmp, "bare", "repo2")
mkdirSync(path.join(bare, ".git"), { recursive: true })
cell("no settings file -> no check", d.watchRefusal("git reset --hard", bare) === undefined, d.watchRefusal("git reset --hard", bare))
const nested = path.join(repo, "nested")
mkdirSync(path.join(nested, ".git"), { recursive: true })
cell("the walk stops at the git root (a nested repository does not see the outer settings)", d.watchRefusal("git reset --hard", nested) === undefined, d.watchRefusal("git reset --hard", nested))
const broken = path.join(tmp, "broken")
mkdirSync(path.join(broken, ".git"), { recursive: true })
mkdirSync(path.join(broken, ".claude"), { recursive: true })
writeFileSync(path.join(broken, ".claude", "settings.json"), "{ not json")
cell("an unreadable settings file refuses (silently skipping it would drop every rule)", /не читается/.test(d.watchRefusal("git status", broken) ?? ""), d.watchRefusal("git status", broken))
const all = path.join(tmp, "all")
mkdirSync(path.join(all, ".git"), { recursive: true })
mkdirSync(path.join(all, ".claude"), { recursive: true })
writeFileSync(path.join(all, ".claude", "settings.json"), JSON.stringify({ permissions: { deny: ["Bash", "WebFetch(domain:example.com)"] } }))
cell("a bare Bash rule denies every command", /«Bash»/.test(d.watchRefusal("git status", all) ?? ""), d.watchRefusal("git status", all))

// 4. the pattern forms
cell("`*` inside a pattern is a wildcard", d.commandMatches("npm run *:*", "npm run build --watch") && !d.commandMatches("npm run *:*", "npm test"), "wildcard")
cell("without `:*` the command must match whole", d.commandMatches("git push", "git push") && !d.commandMatches("git push", "git push --force"), "exact")
cell("a path rule from the project root", d.pathMatches("./secrets/**", "secrets/a/b.txt", repo, repo) && !d.pathMatches("./secrets/**", "public/a.txt", repo, repo), "rooted")

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-deny.test: FAIL ${fail}` : "crew-deny.test ok")
process.exit(fail ? 1 : 0)
