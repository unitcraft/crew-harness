// Explicit legacy interrupt/mail dependency for historical queue/loop regression fixtures.
// Production index.ts always uses form reply; never discover or contact the owner's service in these tests.
let tail = Promise.resolve()
export function legacyAnswerPass(oa, core, ctx) {
  // Production has one pass at a time. Concurrent fixture callers must not take the same answer twice.
  const next = tail.then(() => oa.answerTick({
    call: (s) => core.questionCall(s),
    interrupt: async (sessionID) => {
      await ctx.session.interrupt({ sessionID })
      return { ok: true }
    },
    letter: (to, text, id) => core.postLetter(to, { id, from_role: core.PLUGIN_SENDER, from_session: core.PLUGIN_SENDER, to, time: Date.now(), text }),
    history: () => {},
    say: () => {},
  }))
  tail = next.catch(() => {})
  return next
}
