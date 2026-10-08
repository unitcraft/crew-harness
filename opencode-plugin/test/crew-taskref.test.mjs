// Self-test of taskRef (node >= 24):  node test/crew-taskref.test.mjs
// «#31 «название»»: the title goes next to the number; spaces collapse, letters (including "s") stay, long titles are cut.
import assert from "node:assert/strict"
import { taskRef } from "../tasks.ts"

assert.equal(taskRef({ n: 31, title: "замок вливания" }), "#31 «замок вливания»")
assert.equal(taskRef({ n: 5, title: "Sessions  and\n  status" }), "#5 «Sessions and status»", "letters s stay, whitespace collapses")
assert.equal(taskRef({ n: 7, title: "«в ёлочках»" }), "#7 «в ёлочках»")
assert.equal(taskRef({ n: 9 }), "#9")
assert.equal(taskRef({ n: 9, title: "   " }), "#9")
const long = taskRef({ n: 1, title: "x".repeat(60) }, 20)
assert.equal(long, `#1 «${"x".repeat(19)}…»`)
console.log("crew-taskref.test ok")
