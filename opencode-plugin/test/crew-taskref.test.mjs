// Self-test of taskRef (node >= 24):  node test/crew-taskref.test.mjs
// «031 «название»»: the title goes next to the number; spaces collapse, letters (including "s") stay, long titles are cut.
import assert from "node:assert/strict"
import { taskRef } from "../tasks.ts"

assert.equal(taskRef({ n: 31, title: "замок вливания" }), "031 «замок вливания»")
assert.equal(taskRef({ n: 5, title: "Sessions  and\n  status" }), "005 «Sessions and status»", "letters s stay, whitespace collapses")
assert.equal(taskRef({ n: 7, title: "«в ёлочках»" }), "007 «в ёлочках»")
assert.equal(taskRef({ n: 9 }), "009")
assert.equal(taskRef({ n: 9, title: "   " }), "009")
const long = taskRef({ n: 1, title: "x".repeat(60) }, 20)
assert.equal(long, `001 «${"x".repeat(19)}…»`)
console.log("crew-taskref.test ok")
