/**
 * Listens to sACN or Art-Net and logs what reaches the wire as change rows, so a review can hold
 * the running app's real output to expected values without a rig.
 *
 *   npm run dmx:log -- --channels 1-12 --until-idle 2000 --out run.ndjson --table
 *   npm run dmx:log -- --protocol artnet --universe 1 --duration 5000 --table
 *   npm run dmx:log -- --replay run.ndjson --expect expect.json
 *
 * sACN: the app's multicast output is heard on the same machine, as sACN View hears it. When the
 * app sends on a chosen network interface, pass that interface's IPv4 address as `--iface`.
 *
 * Art-Net: the app's own Art-Net sender holds port 6454, and a packet sent to this machine's own
 * address reaches only the first socket on the port, which is the app's. Point the app's Art-Net
 * host at a broadcast address, such as the subnet's .255, to hear it here.
 *
 * Flags:
 *   --protocol sacn|artnet   what to listen to (default sacn)
 *   --universe 1[,2]      sACN universes (default 1) or Art-Net Port-Addresses (default all)
 *   --channels 1-12,20    channels to watch (default all 512)
 *   --iface <ip>          sACN only: local IPv4 address of the interface to join multicast on
 *   --duration <ms>       stop after this long
 *   --until-idle <ms>     stop once nothing has changed for this long after the first lit frame
 *   --out <file>          write the rows as NDJSON here
 *   --replay <file>       read rows from an earlier --out instead of listening
 *   --t0 first-change|first-packet   where 0 ms sits (default first-change)
 *   --table               print the rows as a markdown table
 *   --expect <file>       hold the rows to {universe?, states: [...]}, each state being
 *                         {ch, atMs?, holdMs?, label?}, {never: ch, fromMs?, toMs?} or
 *                         {always: ch, fromMs?, toMs?}, where a ch key can be a range ("1-12")
 *   --time-tol <ms>       tolerance on atMs (default 30)
 *   --value-tol <n>       tolerance on each expected channel value (default 0)
 *
 * Without --out, --table or --expect the rows go to stdout. The run summary goes to stderr.
 * Exits 1 when an expectation fails and 2 on a usage or socket error.
 */
import { createSocket } from 'node:dgram'
import { readFileSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Receiver } = require('sacn')
const {
  parseArtDmx,
  parseChannelSpec,
  createRecorder,
  rebase,
  renderTable,
  checkExpectations,
} = require('./dmxLogCore.cjs')

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const flags = {}
  const bools = new Set()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument '${arg}'`)
    }
    const name = arg.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      bools.add(name)
    } else {
      flags[name] = next
      i++
    }
  }
  return { flags, bools }
}

/** @param {string | undefined} value @param {number | undefined} fallback */
function num(value, fallback) {
  if (value === undefined) {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative number but got '${value}'`)
  }
  return parsed
}

const ART_NET_PORT = 6454

/**
 * Joins the sACN multicast groups. Each packet reaches `events.packet` as `{ u, src, key, dmx }`,
 * where `key` names the source in the summary.
 */
function openSacn({ universes, iface }, events) {
  const receiver = new Receiver({ universes, iface, reuseAddr: true })
  receiver.on('packet', (packet) => {
    const src = `${packet.sourceName} @ ${packet.sourceAddress}`
    const key = `u${packet.universe} ${src} (priority ${packet.priority})`
    events.packet({ u: packet.universe, src, key, dmx: packet.payloadAsBuffer ?? [] })
  })
  receiver.on('PacketOutOfOrder', () => events.outOfOrder())
  receiver.on('PacketCorruption', () => events.corrupt())
  receiver.on('error', (error) => events.error(error))
  return {
    what: `sACN on universe ${universes.join(', ')}`,
    close: (done) => receiver.close(done),
  }
}

/** Binds the Art-Net port and passes on ArtDmx packets for the chosen Port-Addresses, or all. */
function openArtNet({ universes }, events) {
  const socket = createSocket({ type: 'udp4', reuseAddr: true })
  socket.on('message', (message, remote) => {
    const packet = parseArtDmx(message)
    if (packet === null || (universes !== null && !universes.includes(packet.u))) {
      return
    }
    const src = `Art-Net @ ${remote.address}`
    events.packet({ u: packet.u, src, key: `u${packet.u} ${src}`, dmx: packet.dmx })
  })
  socket.on('error', (error) => events.error(error))
  socket.bind(ART_NET_PORT)
  const which = universes === null ? 'every universe' : `universe ${universes.join(', ')}`
  return {
    what: `Art-Net on port ${ART_NET_PORT}, ${which}`,
    close: (done) => socket.close(done),
  }
}

/** Collects rows from the network until a stop condition, then resolves with them. */
function listen({ open, channels, durationMs, idleMs }) {
  return new Promise((resolve, reject) => {
    const recorder = createRecorder(channels)
    const rows = []
    /** @type {Map<string, { count: number, firstMs: number, lastMs: number }>} */
    const packetCounts = new Map()
    let outOfOrder = 0
    let corrupt = 0
    let lastChangeMs = null
    const startedAt = performance.now()
    const now = () => Math.round(performance.now() - startedAt)

    const timers = []
    let finished = false
    const finish = (error) => {
      if (finished) {
        return
      }
      finished = true
      timers.forEach((timer) => clearInterval(timer))
      const elapsedMs = now()
      source.close(() => {
        if (error) {
          reject(error)
          return
        }
        rows.push({ ms: elapsedMs, end: true })
        resolve({ rows, packetCounts, outOfOrder, corrupt, elapsedMs })
      })
    }
    // Stays installed while the recording is written. Under npm run a Ctrl-C arrives twice, once
    // from the terminal and once forwarded by npm, and the second must not kill the write.
    process.on('SIGINT', () => finish())

    const source = open({
      packet: ({ u, src, key, dmx }) => {
        const ms = now()
        const seen = packetCounts.get(key) ?? { count: 0, firstMs: ms, lastMs: ms }
        packetCounts.set(key, { ...seen, count: seen.count + 1, lastMs: ms })
        const row = recorder.push({ ms, u, src, dmx })
        if (row !== null) {
          rows.push(row)
          if (lastChangeMs !== null || Object.values(row.ch).some((value) => value > 0)) {
            lastChangeMs = row.ms
          }
        }
      },
      outOfOrder: () => outOfOrder++,
      corrupt: () => corrupt++,
      error: (error) => finish(error),
    })

    if (durationMs !== undefined) {
      timers.push(setInterval(() => now() >= durationMs && finish(), 20))
    }
    if (idleMs !== undefined) {
      timers.push(
        setInterval(() => lastChangeMs !== null && now() - lastChangeMs >= idleMs && finish(), 20),
      )
    }
    const stop = [durationMs && `${durationMs} ms`, idleMs && `${idleMs} ms idle`, 'Ctrl-C']
    console.error(`Listening for ${source.what}, stopping at ${stop.filter(Boolean).join(' or ')}`)
  })
}

/** @param {{ packetCounts: Map<string, { count: number, firstMs: number, lastMs: number }>, outOfOrder: number, corrupt: number, elapsedMs: number, rows: unknown[] }} run */
function summarize(run, protocolName) {
  console.error(`Listened ${run.elapsedMs} ms, ${run.rows.length - 1} change rows`)
  if (run.packetCounts.size === 0) {
    console.error(`No ${protocolName} packets arrived`)
  }
  for (const [source, { count, firstMs, lastMs }] of run.packetCounts) {
    const rate = lastMs > firstMs ? ((count - 1) * 1000) / (lastMs - firstMs) : 0
    console.error(
      `  ${source}: ${count} packets over ${lastMs - firstMs} ms, ${rate.toFixed(1)} per second`,
    )
  }
  if (run.packetCounts.size > 1) {
    console.error('  More than one source was seen')
  }
  if (run.outOfOrder > 0 || run.corrupt > 0) {
    console.error(`  Dropped ${run.outOfOrder} out-of-order and ${run.corrupt} corrupt packets`)
  }
}

async function main() {
  const { flags, bools } = parseArgs(process.argv.slice(2))
  const t0 = flags.t0 ?? 'first-change'
  if (t0 !== 'first-change' && t0 !== 'first-packet') {
    throw new Error(`--t0 must be first-change or first-packet, not '${t0}'`)
  }
  const channels = flags.channels === undefined ? null : parseChannelSpec(flags.channels)

  let rows
  if (flags.replay !== undefined) {
    rows = readFileSync(flags.replay, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line))
  } else {
    const protocol = flags.protocol ?? 'sacn'
    if (protocol !== 'sacn' && protocol !== 'artnet') {
      throw new Error(`--protocol must be sacn or artnet, not '${protocol}'`)
    }
    const artNet = protocol === 'artnet'
    if (artNet && flags.iface !== undefined) {
      throw new Error('--iface is for sACN only. Art-Net listens on every interface')
    }
    const [lowest, highest] = artNet ? [0, 32767] : [1, 63999]
    const universeSpec = flags.universe ?? (artNet ? undefined : '1')
    const universes =
      universeSpec === undefined
        ? null
        : universeSpec.split(',').map((u) => {
            const universe = Number(u)
            if (!Number.isInteger(universe) || universe < lowest || universe > highest) {
              throw new Error(`Universe '${u}' is outside ${lowest}-${highest}`)
            }
            return universe
          })
    const run = await listen({
      open: (events) =>
        artNet
          ? openArtNet({ universes }, events)
          : openSacn({ universes, iface: flags.iface }, events),
      channels: channels ?? parseChannelSpec(undefined),
      durationMs: num(flags.duration, undefined),
      idleMs: num(flags['until-idle'], undefined),
    })
    summarize(run, artNet ? 'Art-Net' : 'sACN')
    rows = run.rows
  }
  rows = rebase(rows, t0)

  const ndjson = rows.map((row) => JSON.stringify(row)).join('\n') + '\n'
  if (flags.out !== undefined) {
    writeFileSync(flags.out, ndjson)
  }
  if (bools.has('table')) {
    console.log(renderTable(rows, channels))
  }
  if (flags.expect !== undefined) {
    const expect = JSON.parse(readFileSync(flags.expect, 'utf8'))
    const result = checkExpectations(rows, expect, {
      timeTolMs: num(flags['time-tol'], 30),
      valueTol: num(flags['value-tol'], 0),
    })
    result.lines.forEach((line) => console.log(line))
    process.exitCode = result.ok ? 0 : 1
  }
  if (flags.out === undefined && !bools.has('table') && flags.expect === undefined) {
    process.stdout.write(ndjson)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 2
})
