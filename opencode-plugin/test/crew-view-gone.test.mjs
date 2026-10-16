// Self-test: the word "view" is gone from crew_task and crew_config (task 066, item 7; node >= 24):  node test/crew-view-gone.test.mjs
// VG-1: crew_task / crew_config "view" is a clear refusal that says "show" (a session that remembers the word gets a hint, not a break).
// VG-2: "show" works. VG-3: an unknown action is still refused. VG-4: the schema, the descriptions and the help do not name "view".
import { harness, reporter } from "./landing-harness.mjs"

const { cell, done } = reporter("crew-view-gone.test")
const H = await harness("crew-view-gone", { settings: { merge_precheck: "off" } })
const { call } = H
const INTEG = "sesINTEG1"
const t = H.reviewing()

const a = await call("crew_task", INTEG, { action: "show", n: t.n })
const b = await call("crew_task", INTEG, { action: "view", n: t.n })
cell("VG-1 crew_task view is refused with a hint to use show; show works", a.length > 20 && /Команды view больше нет, используй show/.test(b) && b.length < 300, a + "\n---\n" + b)

const c = await call("crew_config", INTEG, { action: "show" })
const d = await call("crew_config", INTEG, { action: "view" })
cell("VG-2 crew_config view is refused with a hint to use show; show works", c.length > 20 && /Команды view больше нет, используй show/.test(d) && d.length < 300, c + "\n---\n" + d)

const u1 = await call("crew_task", INTEG, { action: "bogus", n: t.n })
const u2 = await call("crew_config", INTEG, { action: "bogus" })
cell("VG-3 unknown action is still refused", /Неизвестное действие «bogus»/.test(u1) && /Неизвестное действие «bogus»/.test(u2), u1 + "\n---\n" + u2)

const tools = H.tools ?? {}
const help = await call("crew_help", INTEG, {})
const texts = [help, tools.crew_task?.description ?? "", tools.crew_config?.description ?? "", JSON.stringify(tools.crew_task?.input?.properties?.action?.enum ?? []), JSON.stringify(tools.crew_config?.input?.properties?.action?.enum ?? []), t.n ? await call("crew_task", INTEG, { action: "show", n: t.n }) : ""]
cell("VG-4 neither the help, nor the descriptions, nor the enums, nor the answers name the word view as an action", texts.every((x) => !/\bview\b/.test(x.replace(/Команды view больше нет, используй show/g, ""))), texts.map((x) => (x.match(/.{0,40}\bview\b.{0,40}/) ?? [""])[0]).join(" | "))

done(H)
