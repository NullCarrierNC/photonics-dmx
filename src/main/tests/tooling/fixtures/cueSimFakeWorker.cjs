// A cue-sim worker whose cues behave as their names say: `spin` loops forever, `stall` never
// answers, `crash` exits, and any other cue returns its own name.
process.on('message', async ({ cues }) => {
  for (const { key, cue } of cues) {
    process.send({ type: 'start', key })
    if (cue === 'spin') for (;;);
    if (cue === 'stall') await new Promise(() => {})
    if (cue === 'crash') process.exit(3)
    if (cue === 'fail') process.send({ type: 'failed', key, message: 'no such cue' })
    else process.send({ type: 'result', key, value: { cue } })
  }
  process.send({ type: 'finished' })
})
process.send({ type: 'ready' })
