// Historical pre-256 fixture only. Never use crew_task assign to construct it:
// the public operation must refuse a user's conversation now. These records
// still exist on disk and their delivery, cancellation and handoff need coverage.
export async function legacyAssignment({ project, session, author, directory, title, goal, criteria = "готово" }) {
  const core = await import("../core.ts")
  const tasks = await import("../tasks.ts")
  const target = core.readJson(core.cardFile(session))
  const t = tasks.createTask({ project, executor: session, author, author_role: `${project}.integrator`, directory, title, goal, criteria, priority: "P2", tier: "medium", role: target.role, qid: `legacy-${session}`, status: "running", kind: "assign" })
  core.saveCard({ ...target, task: { project, n: t.n } })
  core.postLetter(session, { id: tasks.taskLetterId(t), from_role: t.author_role, from_session: author, to: session, time: Date.now(), qid: t.qid, text: core.formatTaskLetter(t) })
  return t
}
