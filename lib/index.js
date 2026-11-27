/**
 * dsh-phone-chat — Open, pluggable remote chat & control plugin for DeepSeek Harness (DSH)
 *
 * Channels:
 *   - primary : Built-in DSH host sessionController
 *   - fish    : Optional integration with open-source `dsh-fish` (github.com/mochi-fish/dsh-fish)
 *   - harness : Generic external Agent / Harness adapter (CLI or File Queue; no third-party model switching)
 *
 * Routes:
 *   - /phone-chat          : Mobile PWA-style web page (key + HttpOnly cookie auth)
 *   - /phone-chat/api/*    : Mobile API (chat, files, avatars, TTS contract, remote control)
 *   - /phone-chat/admin/*  : Desktop DSH Settings Panel API (strict direct loopback only)
 */

import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { cleanThinkingText, createConfigStore, DEFAULT_THINKING_TEXT, THINKING_MAX, writeFileAtomic } from './config.mjs'
import { createHarness } from './harness.mjs'
import { renderQrSvg } from './qr.mjs'
import { createRemoteControl } from './remote-control.mjs'
import { createTts } from './tts.mjs'

export const name = 'phone-chat'
export const inject = ['webServer', 'sessionController']

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PREFIX = '/phone-chat'
const COOKIE = 'pc_key'
const TARGETS = new Set(['primary', 'fish', 'harness'])
const NAME_MAX = 16
const IMAGE_MAX = 10 * 1024 * 1024
const FILE_MAX = 25 * 1024 * 1024
const AVATAR_MAX = 2 * 1024 * 1024
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000
const STORE_MAX = 40

/** Default pure-black avatar SVG (no bundled personal artwork). */
const DEFAULT_AVATAR_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="#000000"/></svg>',
  'utf8',
)

function safeGet(obj, key) {
  try {
    return obj?.[key]
  } catch {
    return undefined
  }
}

function samePath(a, b) {
  const norm = (s) => String(s ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
  const x = norm(a)
  const y = norm(b)
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y
}

/** Live proxy wrapper for dsh-fish sayToHer (avoids inactive fiber errors after host restart). */
function sayCtx(ctx) {
  const pick = (k) => {
    for (const getter of [() => ctx.get?.(k), () => ctx.reflect?.get?.(k), () => ctx[k]]) {
      try {
        const v = getter()
        if (v) return v
      } catch {
        /* try next */
      }
    }
    return undefined
  }
  const on = (eventName, fn) => {
    const bases = []
    try {
      if (ctx.root && ctx.root !== ctx) bases.push(ctx.root)
    } catch {
      /* ignore */
    }
    bases.push(ctx)
    for (const base of bases) {
      try {
        const off = base.on(eventName, fn)
        if (typeof off === 'function') return off
      } catch {
        /* try next */
      }
    }
    return () => {}
  }
  return {
    get: pick,
    get sessionController() {
      return pick('sessionController')
    },
    on,
  }
}

/** Dynamically locate optional open-source `dsh-fish` plugin's say.js if installed in DSH profiles. */
async function loadFishSay(fishCfg = {}, home = os.homedir()) {
  const dirs = []
  if (fishCfg.libDir) dirs.push(String(fishCfg.libDir))
  const profiles = path.join(home, '.dsh', 'profiles')
  const pkgs = ['dsh-fish', path.join('@ssamurias', 'dsh-fish')]
  try {
    for (const p of fs.readdirSync(profiles)) {
      for (const pkg of pkgs) dirs.push(path.join(profiles, p, 'node_modules', pkg, 'lib'))
    }
  } catch {
    /* profiles dir absent */
  }
  for (const dir of dirs) {
    const file = path.join(dir, 'say.js')
    if (!fs.existsSync(file)) continue
    try {
      const mod = await import(pathToFileURL(file).href)
      if (typeof mod.sayToHer === 'function') return mod.sayToHer
    } catch {
      /* try next candidate */
    }
  }
  return null
}

function send(res, status, data, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(data), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': body.length,
    ...extraHeaders,
  })
  res.end(body)
}

function cookieOf(req, keyName) {
  const raw = String(req.headers?.cookie ?? '')
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    if (part.slice(0, idx).trim() === keyName) return decodeURIComponent(part.slice(idx + 1).trim())
  }
  return ''
}

function readRawBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', (chunk) => {
      total += chunk.length
      if (total > limitBytes) {
        const err = new Error('Payload too large')
        err.code = 'TOO_LARGE'
        reject(err)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function readJsonBody(req, limitBytes = 256 * 1024) {
  const raw = await readRawBody(req, limitBytes)
  if (!raw.length) return {}
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    const err = new Error('Invalid JSON body')
    err.code = 'BAD_JSON'
    throw err
  }
}

function sniffImage(buf) {
  if (!buf || buf.length < 12) return null
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: 'png', type: 'image/png' }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' }
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { ext: 'webp', type: 'image/webp' }
  }
  return null
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
}

function cleanName(raw) {
  if (typeof raw !== 'string') return ''
  if (/[\r\n]/.test(raw)) return ''
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!s || s.length > NAME_MAX) return ''
  return s
}

function dirBytes(dirPath) {
  let total = 0
  if (!dirPath || !fs.existsSync(dirPath)) return 0
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const fp = path.join(dirPath, entry.name)
      if (entry.isFile()) {
        try {
          total += fs.statSync(fp).size
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  return total
}

function parseQueueMarkdown(raw) {
  const text = String(raw ?? '')
  const sep = text.indexOf('\n\n')
  if (sep < 0) return { meta: {}, body: text.trim() }
  const head = text.slice(0, sep)
  const body = text.slice(sep + 2).trim()
  const meta = {}
  for (const line of head.split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx < 0) continue
    meta[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim()
  }
  return { meta, body }
}

function stripThink(raw) {
  return String(raw ?? '').replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '').trim()
}

function extractTextFromContent(content) {
  if (typeof content === 'string') return stripThink(content)
  if (Array.isArray(content)) {
    return stripThink(
      content
        .map((part) => {
          if (typeof part === 'string') return part
          if (part && typeof part.text === 'string' && (part.type === undefined || part.type === 'text')) return part.text
          return ''
        })
        .filter(Boolean)
        .join('\n'),
    )
  }
  return ''
}

function isRecordsRunning(records) {
  const list = Array.isArray(records) ? records : []
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const type = list[i]?.event?.type ?? list[i]?.type
    if (type === 'turn/end') return false
    if (type === 'turn/start' || type === 'user/message') return true
  }
  return false
}

export function apply(ctx, baseConfig = {}) {
  const home = baseConfig.home ?? os.homedir()
  const stateDir = baseConfig.stateDir ?? path.join(home, '.dsh', 'phone-chat')
  const keyFile = path.join(stateDir, 'key.txt')
  const sessionFile = path.join(stateDir, 'session.json')
  const avatarsDir = path.join(stateDir, 'avatars')
  const harnessLogFile = path.join(stateDir, 'harness-log.jsonl')
  const fishLogFile = path.join(stateDir, 'fish-log.jsonl')

  fs.mkdirSync(stateDir, { recursive: true })
  fs.mkdirSync(avatarsDir, { recursive: true })

  const cfgStore = createConfigStore(stateDir, baseConfig, home)
  const getCfg = () => cfgStore.get()

  function ensureDirs() {
    const c = getCfg()
    const dirs = {
      chat: c.chatCwd,
      toAgent: path.join(c.chatCwd, 'to-agent'),
      toPhone: path.join(c.chatCwd, 'to-phone'),
      uploads: c.uploadCwd,
      files: c.filesCwd,
      tmp: path.join(c.chatCwd, '.tmp'),
    }
    for (const p of Object.values(dirs)) {
      try {
        fs.mkdirSync(p, { recursive: true })
      } catch {
        /* ignore */
      }
    }
    return dirs
  }
  ensureDirs()

  // Key management (48 hex chars)
  function loadOrCreateKey() {
    try {
      const existing = fs.readFileSync(keyFile, 'utf8').trim()
      if (existing) return existing
    } catch {
      /* generate new */
    }
    const fresh = randomBytes(24).toString('hex')
    writeFileAtomic(keyFile, `${fresh}\n`)
    try {
      fs.chmodSync(keyFile, 0o600)
    } catch {
      /* windows ignores posix mode */
    }
    return fresh
  }
  let key = loadOrCreateKey()

  function rotateKey() {
    key = randomBytes(24).toString('hex')
    writeFileAtomic(keyFile, `${key}\n`)
    return key
  }

  function keyMatches(candidate) {
    if (typeof candidate !== 'string' || candidate.length !== key.length) return false
    try {
      return timingSafeEqual(Buffer.from(candidate, 'utf8'), Buffer.from(key, 'utf8'))
    } catch {
      return false
    }
  }

  function isLoopback(req) {
    const remote = req.socket?.remoteAddress ?? ''
    return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
  }

  function mobileAllowed(req) {
    if (!getCfg().hostOnly) return true
    return isLoopback(req)
  }

  function adminAllowed(req) {
    if (!isLoopback(req)) return false
    const h = req.headers || {}
    if (h['x-forwarded-for'] || h['x-forwarded-host'] || h['tailscale-user-login'] || h['cf-connecting-ip']) {
      return false
    }
    return true
  }

  function authorized(req) {
    if (keyMatches(cookieOf(req, COOKIE))) return true
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    return keyMatches(url.searchParams.get('k') ?? '')
  }

  function guardMobile(handler) {
    return async (req, res) => {
      try {
        if (!mobileAllowed(req)) return send(res, 403, { error: 'Loopback access only' })
        if (!authorized(req)) return send(res, 401, { error: 'unauthorized', hint: 'Open via URL with ?k=<key>' })
        await handler(req, res)
      } catch (err) {
        const status = err?.code === 'BAD_JSON' ? 400 : err?.code === 'TOO_LARGE' ? 413 : 500
        send(res, status, { error: String(err?.message ?? err) })
      }
    }
  }

  function guardAdmin(handler) {
    return async (req, res) => {
      try {
        if (!adminAllowed(req)) return send(res, 403, { error: 'Admin API accepts direct local loopback only' })
        await handler(req, res)
      } catch (err) {
        const status = err?.code === 'BAD_JSON' ? 400 : err?.code === 'TOO_LARGE' ? 413 : 500
        send(res, status, { error: String(err?.message ?? err) })
      }
    }
  }

  // Subsystems
  const harness = createHarness(getCfg, {
    stateDir,
    spawn: baseConfig._harnessSpawn,
    probeProxy: baseConfig._harnessProbeProxy,
  })
  const tts = createTts(getCfg, {
    spawn: baseConfig._ttsSpawn,
    fetch: baseConfig._ttsFetch,
  })
  const remoteControl = createRemoteControl(getCfg, {
    stateDir,
    spawn: baseConfig._rcSpawn,
    fetch: baseConfig._rcFetch,
  })

  // In-memory message stores
  const store = { primary: [], fish: [], harness: [] }
  const seenAt = { primary: '', fish: '', harness: '' }
  let primaryRunning = false
  let primaryModel = null
  let fishBusy = false
  let fishSid = ''
  let fishModel = null

  function loadJsonlInto(filePath, targetKey) {
    try {
      const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean)
      for (const l of lines.slice(-STORE_MAX)) {
        try {
          const item = JSON.parse(l)
          if (item?.text) store[targetKey].push(item)
        } catch {
          /* ignore bad line */
        }
      }
    } catch {
      /* fresh */
    }
  }
  loadJsonlInto(harnessLogFile, 'harness')
  loadJsonlInto(fishLogFile, 'fish')

  function pushStoreMsg(targetKey, logFile, role, text, extra = {}) {
    const item = {
      id: `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`,
      role,
      text: String(text ?? ''),
      at: new Date().toISOString(),
      ...extra,
    }
    store[targetKey].push(item)
    if (store[targetKey].length > STORE_MAX) store[targetKey].splice(0, store[targetKey].length - STORE_MAX)
    try {
      fs.appendFileSync(logFile, `${JSON.stringify(item)}\n`, 'utf8')
    } catch {
      /* ignore */
    }
    return item
  }

  async function resolveFishSayFn() {
    if (typeof baseConfig._fishSay === 'function') return baseConfig._fishSay
    return loadFishSay(getCfg().fish, home)
  }

  async function findFishSession(sc) {
    const fishRoot = getCfg().fish?.root || path.join(home, '.dsh-fish')
    const herDir = path.join(fishRoot, 'home')
    if (typeof sc?.list === 'function') {
      try {
        const out = await sc.list({})
        const items = Array.isArray(out?.items) ? out.items : []
        const matched = items.filter((it) => it && samePath(it.cwd, herDir))
        matched.sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0))
        const hit = matched[0]
        if (hit) {
          const ms = hit.projections?.values?.modelSelection ?? null
          fishModel = ms?.next ?? ms?.lastUsed ?? fishModel
          return { sessionId: String(hit.sessionId ?? ''), selection: fishModel, source: 'list' }
        }
        return { sessionId: fishSid || '', selection: fishModel, source: 'list-empty' }
      } catch (err) {
        return { sessionId: fishSid || '', selection: fishModel, source: 'list-failed', why: String(err?.message ?? err) }
      }
    }
    return { sessionId: fishSid || '', selection: fishModel, source: 'no-list' }
  }

  async function askFish(text, imagePath) {
    const fc = getCfg().fish || {}
    if (!fc.enabled) throw new Error('dsh-fish integration is disabled')
    if (fishBusy) throw new Error('dsh-fish is currently processing another message')
    const waitMs = Math.max(5000, Number(fc.waitMs) || 90_000)
    const guardMs = waitMs + 20_000
    const fishRoot = fc.root || path.join(home, '.dsh-fish')

    fishBusy = true
    return new Promise((resolve) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        fishBusy = false
        const timeoutMsg = `(No reply within ${Math.round(guardMs / 1000)}s)`
        pushStoreMsg('fish', fishLogFile, 'peer', timeoutMsg)
        resolve({ ok: false, reply: timeoutMsg })
      }, guardMs)
      timer.unref?.()

      const done = (payload) => {
        clearTimeout(timer)
        if (settled) return
        settled = true
        fishBusy = false
        resolve(payload)
      }

      resolveFishSayFn()
        .then(async (sayFn) => {
          if (!sayFn) {
            const msg = '(dsh-fish plugin not found in DSH profiles; install github.com/mochi-fish/dsh-fish first)'
            pushStoreMsg('fish', fishLogFile, 'peer', msg)
            return done({ ok: false, reply: msg })
          }
          const r = await sayFn(sayCtx(ctx), text, {
            root: fishRoot,
            owner: true,
            channel: 'phone:master',
            scene: 'private',
            room: 'house',
            waitMs,
            imagePath,
            log: () => {},
          })
          if (r?.sessionId) fishSid = String(r.sessionId)
          const reply = String(r?.herReply || r?.note || '').trim() || '(empty response)'
          pushStoreMsg('fish', fishLogFile, 'peer', reply)
          done({ ok: true, reply, sessionId: fishSid || null })
        })
        .catch((err) => {
          const msg = `(dsh-fish error: ${String(err?.message ?? err)})`
          pushStoreMsg('fish', fishLogFile, 'peer', msg)
          done({ ok: false, reply: msg })
        })
    })
  }

  function drainHarnessQueue() {
    const c = getCfg()
    if (c.harness?.mode !== 'queue') return 0
    const dirs = ensureDirs()
    let count = 0
    try {
      const files = fs.readdirSync(dirs.toPhone).filter((f) => f.endsWith('.md') || f.endsWith('.json')).sort()
      for (const f of files) {
        const fp = path.join(dirs.toPhone, f)
        try {
          const raw = fs.readFileSync(fp, 'utf8')
          let body = ''
          if (f.endsWith('.json')) {
            const parsed = JSON.parse(raw)
            body = String(parsed.reply ?? parsed.text ?? '').trim()
          } else {
            body = parseQueueMarkdown(raw).body
          }
          if (body) {
            pushStoreMsg('harness', harnessLogFile, 'peer', body)
            count += 1
          }
          if (c.keepChat && c.historyCwd) {
            const day = new Date().toISOString().slice(0, 10)
            const dest = path.join(c.historyCwd, day)
            fs.mkdirSync(dest, { recursive: true })
            fs.renameSync(fp, path.join(dest, f))
          } else {
            fs.unlinkSync(fp)
          }
        } catch {
          /* skip unreadable */
        }
      }
    } catch {
      /* ignore */
    }
    return count
  }

  // Primary DSH session management
  const cursorCache = new Map()

  function readSessionId() {
    try {
      const parsed = JSON.parse(fs.readFileSync(sessionFile, 'utf8'))
      return typeof parsed?.sessionId === 'string' ? parsed.sessionId : ''
    } catch {
      return ''
    }
  }

  function writeSessionId(sessionId, cwdUsed) {
    writeFileAtomic(sessionFile, `${JSON.stringify({ sessionId, cwd: cwdUsed, updatedAt: new Date().toISOString() }, null, 2)}\n`)
  }

  function controller() {
    const sc = safeGet(ctx, 'sessionController')
    if (!sc) throw new Error('Host sessionController service is unavailable')
    return sc
  }

  async function cursorOf(sc, sessionId) {
    const ttl = getCfg().cursorTtlMs ?? 1000
    const now = Date.now()
    const hit = cursorCache.get(sessionId)
    if (hit && now - hit.at < ttl) return hit.seq
    const remember = (seq) => {
      cursorCache.set(sessionId, { seq, at: now })
      return seq
    }
    try {
      await sc.page({ address: { kind: 'session', sessionId }, throughSeq: Number.MAX_SAFE_INTEGER, maxMessages: 1 }, new AbortController().signal)
      return remember(Number.MAX_SAFE_INTEGER)
    } catch (err) {
      const m = /past cursor\s+(\d+)/i.exec(String(err?.message ?? err))
      if (m) return remember(Number(m[1]))
      return remember(0)
    }
  }

  async function syncPrimary() {
    const sc = safeGet(ctx, 'sessionController')
    const sid = readSessionId()
    if (!sc || !sid) return
    try {
      const throughSeq = await cursorOf(sc, sid)
      const res = await sc.page(
        { address: { kind: 'session', sessionId: sid }, throughSeq, maxMessages: STORE_MAX },
        new AbortController().signal,
      )
      const records = res?.records ?? res?.events ?? []
      const msgs = []
      for (const r of records) {
        const ev = r?.event ?? r
        const type = typeof ev?.type === 'string' ? ev.type : ''
        if (type === 'model/selection') {
          const prov = ev?.data?.provider ?? ev?.provider ?? ''
          const mod = ev?.data?.model ?? ev?.model ?? ''
          if (mod) primaryModel = { provider: prov, model: mod }
          continue
        }
        let role = ''
        if (type === 'user/message') {
          const kind = ev?.data?.source?.kind
          if (typeof kind === 'string' && kind !== 'user') continue
          role = 'me'
        } else if (type === 'assistant/message') {
          role = 'peer'
        } else if (type === 'message' || ev?.role === 'user' || ev?.role === 'assistant') {
          role = ev.role === 'user' ? 'me' : 'peer'
        }
        if (!role) continue
        const rawContent =
          ev?.data?.message?.content ??
          ev?.data?.content ??
          ev?.content ??
          ev?.message?.content ??
          ev?.text ??
          ''
        const text = extractTextFromContent(rawContent)
        if (text) {
          const ts = ev?.time ?? ev?.timestamp ?? ev?.at
          const at = typeof ts === 'number' ? new Date(ts).toISOString() : (typeof ts === 'string' && ts ? ts : new Date().toISOString())
          msgs.push({
            id: String(ev?.id ?? ev?.seq ?? r?.seq ?? msgs.length),
            role,
            text,
            at,
          })
        }
      }
      store.primary = msgs.slice(-STORE_MAX)
      primaryRunning = isRecordsRunning(records)
    } catch {
      /* ignore transient sync error */
    }
  }

  async function ensurePrimarySession() {
    const sc = controller()
    let sid = readSessionId()
    if (sid) return sid
    const c = getCfg()
    const args = { cwd: c.leadCwd }
    if (c.leadPreset) args.agentPreset = c.leadPreset
    const created = await sc.create(args, new AbortController().signal)
    sid = created?.sessionId ?? created?.id ?? ''
    if (!sid) throw new Error('Host sessionController.create did not return sessionId')
    writeSessionId(sid, c.leadCwd)
    return sid
  }

  function avatarFileOf(who) {
    for (const ext of ['png', 'jpg', 'webp']) {
      const fp = path.join(avatarsDir, `${who}.${ext}`)
      if (fs.existsSync(fp)) return { file: fp, ext }
    }
    return null
  }

  function peerInfo(who) {
    const c = getCfg()
    const p = c.peers?.[who] || {}
    const list = store[who] || []
    const last = list[list.length - 1]
    const seen = seenAt[who] || ''
    const unread = seen ? list.filter((m) => m.role === 'peer' && m.at > seen).length : 0
    const enabled = who === 'primary' ? true : who === 'fish' ? c.fish?.enabled === true : harness.enabled
    const busy = who === 'primary' ? primaryRunning : who === 'fish' ? fishBusy : harness.busy
    const model = who === 'primary' ? primaryModel : who === 'fish' ? fishModel : null
    return {
      id: who,
      name: p.name || (who === 'primary' ? 'Primary Agent' : who === 'fish' ? 'Fish Partner' : 'External Agent'),
      tag: p.tag || (who === 'primary' ? 'DSH' : who === 'fish' ? 'dsh-fish' : 'Harness'),
      tagColor: p.tagColor || '',
      thinkingText: p.thinkingText || DEFAULT_THINKING_TEXT,
      enabled,
      busy,
      hasCustomAvatar: Boolean(avatarFileOf(who)),
      model,
      supportsModelSwitch: who === 'primary' || who === 'fish',
      count: list.length,
      unread,
      lastText: last?.text?.slice(0, 80) || '',
      lastAt: last?.at || '',
    }
  }

  function decorateMessages(list) {
    const ttsOn = tts.enabled
    return list.map((m) => {
      if (!ttsOn || m.role !== 'peer') return m
      const h = tts.hashOf(m.text)
      const hit = h && tts.resolve(h)
      return hit ? { ...m, audio: h } : m
    })
  }

  function fitsUploadQuota(res, incomingBytes) {
    const c = getCfg()
    const dirs = ensureDirs()
    const used = dirBytes(dirs.uploads) + dirBytes(dirs.files)
    if (used + incomingBytes > c.uploadTotalMax) {
      send(res, 507, { error: `Upload quota exceeded (${used} + ${incomingBytes} > ${c.uploadTotalMax})` })
      return false
    }
    return true
  }

  const sweepTimer = setInterval(() => {
    const c = getCfg()
    if (c.keepUploads) return
    const dirs = ensureDirs()
    const cutoff = Date.now() - UPLOAD_TTL_MS
    try {
      for (const f of fs.readdirSync(dirs.uploads)) {
        const fp = path.join(dirs.uploads, f)
        try {
          if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp)
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }, 30 * 60 * 1000)
  sweepTimer.unref?.()

  function buildDiag() {
    const c = getCfg()
    const dirs = ensureDirs()
    const dirsOk = {}
    for (const [k, p] of Object.entries(dirs)) {
      try {
        dirsOk[k] = fs.statSync(p).isDirectory()
      } catch {
        dirsOk[k] = false
      }
    }
    const sid = readSessionId()
    const hit = sid ? cursorCache.get(sid) : null
    const uploadsBytes = dirBytes(dirs.uploads)
    const filesBytes = dirBytes(dirs.files)
    return {
      chatRoot: c.chatCwd,
      dirs: dirsOk,
      storage: {
        uploadsBytes,
        filesBytes,
        totalBytes: uploadsBytes + filesBytes,
        quotaBytes: c.uploadTotalMax,
      },
      avatars: {
        primary: avatarFileOf('primary')?.ext ?? null,
        fish: avatarFileOf('fish')?.ext ?? null,
        harness: avatarFileOf('harness')?.ext ?? null,
      },
      storeSize: { primary: store.primary.length, fish: store.fish.length, harness: store.harness.length },
      primarySessionId: sid || null,
      primaryCursor: hit ? { seq: hit.seq, ageMs: Date.now() - hit.at, ttlMs: c.cursorTtlMs } : null,
      fish: { enabled: c.fish?.enabled === true, busy: fishBusy, sessionId: fishSid || null },
      tts: tts.stats(),
      remoteControl: remoteControl.state(),
    }
  }

  async function handleModelList(who) {
    if (who === 'harness') {
      return {
        ok: true,
        who: 'harness',
        disabled: true,
        notice: '外部 Agent / Harness 的模型使用与切换请前往对应提供方自行更改。',
        groups: [],
      }
    }
    const sc = safeGet(ctx, 'sessionController')
    if (!sc?.modelCatalog) return { ok: true, who, selected: null, groups: [] }
    const cat = await sc.modelCatalog({}, new AbortController().signal)
    if (who === 'fish') {
      const f = await findFishSession(sc)
      return {
        ok: true,
        who: 'fish',
        sessionId: f.sessionId || null,
        source: f.source,
        selected: f.selection ?? cat?.default ?? null,
        default: cat?.default ?? null,
        groups: cat?.groups ?? [],
      }
    }
    return {
      ok: true,
      who: 'primary',
      selected: primaryModel ?? cat?.default ?? null,
      default: cat?.default ?? null,
      groups: cat?.groups ?? [],
    }
  }

  async function handleSelectModel(who, body) {
    if (who === 'harness') {
      const err = new Error('外部 Agent / Harness 不支持在此切换模型，请前往对应提供方进行更改。')
      err.status = 400
      throw err
    }
    const sc = controller()
    let sid = ''
    if (who === 'fish') {
      const f = await findFishSession(sc)
      if (!f.sessionId) {
        const err = new Error('未找到 dsh-fish 会话，请先发一条消息或确认 dsh-fish 已启动。')
        err.status = 409
        throw err
      }
      sid = f.sessionId
    } else {
      sid = await ensurePrimarySession()
    }
    const provider = typeof body?.provider === 'string' ? body.provider.trim() : ''
    const model = typeof body?.model === 'string' ? body.model.trim() : ''
    if (!provider || !model) {
      const err = new Error('provider 和 model 不能为空')
      err.status = 400
      throw err
    }
    const request = { sessionId: sid, provider, model }
    if (typeof body?.reasoningEffort === 'string' && body.reasoningEffort.trim()) {
      request.reasoningEffort = body.reasoningEffort.trim()
    }
    const out = await sc.selectModel(request, new AbortController().signal)
    const sel = out?.selected ?? { provider, model }
    if (who === 'fish') fishModel = sel
    else primaryModel = sel
    return { ok: true, who, sessionId: sid, selected: sel }
  }

  async function handleNewSession(who) {
    if (who === 'fish') {
      const err = new Error('dsh-fish 会话生命周期由 dsh-fish 插件自身管理。')
      err.status = 400
      throw err
    }
    if (who === 'harness') {
      const res = harness.newSession()
      store.harness = []
      return { ok: true, who: 'harness', ...res }
    }
    const sc = controller()
    const c = getCfg()
    const args = { cwd: c.leadCwd }
    if (c.leadPreset) args.agentPreset = c.leadPreset
    const created = await sc.create(args, new AbortController().signal)
    const sid = created?.sessionId ?? created?.id ?? ''
    writeSessionId(sid, c.leadCwd)
    store.primary = []
    cursorCache.delete(sid)
    return { ok: true, who: 'primary', sessionId: sid }
  }

  const routes = [
    // 1. Mobile Web Page
    {
      kind: 'exact',
      path: PREFIX,
      handler: guardMobile(async (req, res) => {
        if (keyMatches(new URL(req.url, 'http://127.0.0.1').searchParams.get('k') ?? '')) {
          res.setHeader('set-cookie', `${COOKIE}=${key}; Path=${PREFIX}; HttpOnly; SameSite=Lax; Max-Age=2592000`)
        }
        const html = fs.readFileSync(path.join(HERE, 'page.html'))
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'content-length': html.length,
        })
        res.end(html)
      }),
    },

    // 2. Mobile API (/phone-chat/api/*)
    {
      kind: 'prefix',
      path: `${PREFIX}/api`,
      handler: guardMobile(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1')
        const route = url.pathname.slice(PREFIX.length)
        const rawWho = (url.searchParams.get('who') ?? 'primary').toLowerCase()
        const who = TARGETS.has(rawWho) ? rawWho : 'primary'

        if (route === '/api/diag' && req.method === 'GET') {
          const base = buildDiag()
          return send(res, 200, { ...base, harness: await harness.diag() })
        }

        if (route === '/api/peers' && req.method === 'GET') {
          await syncPrimary()
          const peers = [peerInfo('primary')]
          if (getCfg().fish?.enabled) peers.push(peerInfo('fish'))
          if (harness.enabled) peers.push(peerInfo('harness'))
          return send(res, 200, { ok: true, peers })
        }

        if (route === '/api/state' && req.method === 'GET') {
          if (who === 'primary') await syncPrimary()
          else if (who === 'harness') drainHarnessQueue()
          return send(res, 200, {
            ok: true,
            who,
            peer: peerInfo(who),
            messages: decorateMessages(store[who]),
            tts: { enabled: tts.enabled, mode: getCfg().tts?.mode || 'cli' },
          })
        }

        if (route === '/api/seen' && req.method === 'POST') {
          seenAt[who] = new Date().toISOString()
          return send(res, 200, { ok: true })
        }

        if (route === '/api/names' && req.method === 'GET') {
          const c = getCfg()
          return send(res, 200, {
            ok: true,
            names: { primary: c.peers.primary.name, fish: c.peers.fish.name, harness: c.peers.harness.name },
            maxLen: NAME_MAX,
          })
        }

        if (route === '/api/names' && req.method === 'POST') {
          const body = await readJsonBody(req)
          const target = TARGETS.has(body?.who) ? body.who : ''
          if (!target) return send(res, 400, { error: 'who must be primary, fish, or harness' })
          const clean = cleanName(body?.name)
          if (!clean) return send(res, 400, { error: `Invalid name (1..${NAME_MAX} chars, no newlines)` })
          cfgStore.update({ peers: { [target]: { name: clean } } })
          return send(res, 200, { ok: true, who: target, name: clean })
        }

        if (route === '/api/profile' && req.method === 'POST') {
          const body = await readJsonBody(req)
          const target = TARGETS.has(body?.who) ? body.who : ''
          if (!target) return send(res, 400, { error: 'who must be primary, fish, or harness' })
          const patch = {}
          if (body?.name !== undefined) {
            const clean = cleanName(body.name)
            if (!clean) return send(res, 400, { error: `Invalid name (1..${NAME_MAX} chars, no newlines)` })
            patch.name = clean
          }
          if (body?.thinkingText !== undefined) {
            const rawThink = String(body.thinkingText ?? '').trim()
            if (!rawThink) {
              patch.thinkingText = DEFAULT_THINKING_TEXT
            } else {
              const cleanThink = cleanThinkingText(rawThink)
              if (!cleanThink) return send(res, 400, { error: `Invalid thinkingText (1..${THINKING_MAX} chars, no newlines)` })
              patch.thinkingText = cleanThink
            }
          }
          if (!Object.keys(patch).length) return send(res, 400, { error: 'Nothing to update' })
          cfgStore.update({ peers: { [target]: patch } })
          return send(res, 200, { ok: true, who: target, peer: peerInfo(target) })
        }

        if (route === '/api/models' && req.method === 'GET') {
          return send(res, 200, await handleModelList(who))
        }

        if (route === '/api/model' && req.method === 'POST') {
          const body = await readJsonBody(req)
          try {
            return send(res, 200, await handleSelectModel(who, body))
          } catch (err) {
            return send(res, err?.status || 500, { error: String(err?.message ?? err) })
          }
        }

        if (route === '/api/new' && req.method === 'POST') {
          try {
            return send(res, 200, await handleNewSession(who))
          } catch (err) {
            return send(res, err?.status || 500, { error: String(err?.message ?? err) })
          }
        }

        if (route === '/api/send' && req.method === 'POST') {
          const body = await readJsonBody(req)
          const text = String(body?.text ?? '').trim()
          const imageName = body?.image ? path.basename(String(body.image)) : ''
          const dirs = ensureDirs()
          const imagePath = imageName && fs.existsSync(path.join(dirs.uploads, imageName)) ? path.join(dirs.uploads, imageName) : ''
          if (!text && !imagePath) return send(res, 400, { error: 'Message text or image is required' })

          if (who === 'fish') {
            if (!getCfg().fish?.enabled) return send(res, 400, { error: 'dsh-fish channel is disabled' })
            pushStoreMsg('fish', fishLogFile, 'me', text || '[image]', imageName ? { image: `${PREFIX}/api/media?p=${encodeURIComponent(imageName)}` } : {})
            const out = await askFish(text, imagePath || undefined)
            return send(res, 200, { ok: out.ok, reply: out.reply, sessionId: out.sessionId || null })
          }

          if (who === 'harness') {
            if (!harness.enabled) return send(res, 400, { error: 'External Agent / Harness channel is disabled' })
            pushStoreMsg('harness', harnessLogFile, 'me', text || '[image]', imageName ? { image: `${PREFIX}/api/media?p=${encodeURIComponent(imageName)}` } : {})
            if (harness.mode === 'queue') {
              const fname = `${stamp()}-${randomBytes(2).toString('hex')}.md`
              const content = `from: phone\nat: ${new Date().toISOString()}\n${imagePath ? `image: ${imagePath}\n` : ''}\n${text}\n`
              writeFileAtomic(path.join(dirs.toAgent, fname), content)
              return send(res, 200, { ok: true, queued: fname })
            }
            const out = await harness.sendCli(text, { imagePath })
            pushStoreMsg('harness', harnessLogFile, 'peer', out.reply)
            return send(res, 200, { ok: true, reply: out.reply, sessionId: out.sessionId })
          }

          const sc = controller()
          const sid = await ensurePrimarySession()
          const promptText = imagePath ? `${text}${text ? '\n\n' : ''}![image](${imagePath})` : text
          const signal = new AbortController().signal
          let ack
          if (typeof sc.prompt === 'function') {
            ack = await sc.prompt(
              {
                requestId: randomUUID(),
                sessionId: sid,
                mode: 'queue',
                content: [{ type: 'text', text: promptText }],
              },
              signal,
            )
          } else if (typeof sc.send === 'function') {
            ack = await sc.send({ address: { kind: 'session', sessionId: sid }, text: promptText }, signal)
          } else {
            throw new Error('Host sessionController does not expose prompt()')
          }
          primaryRunning = true
          cursorCache.delete(sid)
          await syncPrimary()
          return send(res, 200, { ok: true, accepted: ack?.accepted !== false, sessionId: sid })
        }

        if ((route === '/api/upload' || route === '/api/photo') && req.method === 'POST') {
          const buf = await readRawBody(req, IMAGE_MAX)
          const sniffed = sniffImage(buf)
          if (!sniffed) return send(res, 415, { error: 'Only PNG/JPEG/WEBP images are supported' })
          if (!fitsUploadQuota(res, buf.length)) return
          const dirs = ensureDirs()
          const fname = `${stamp()}-${randomBytes(2).toString('hex')}.${sniffed.ext}`
          fs.writeFileSync(path.join(dirs.uploads, fname), buf)
          return send(res, 200, {
            ok: true,
            name: fname,
            bytes: buf.length,
            url: `${PREFIX}/api/media?p=${encodeURIComponent(fname)}`,
          })
        }

        if (route === '/api/file' && req.method === 'POST') {
          const rawName = path.basename(String(url.searchParams.get('name') ?? 'file')).replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_').slice(0, 80)
          const buf = await readRawBody(req, FILE_MAX)
          if (!buf.length) return send(res, 400, { error: 'Empty file' })
          if (!fitsUploadQuota(res, buf.length)) return
          const dirs = ensureDirs()
          const fname = `${stamp()}-${randomBytes(2).toString('hex')}-${rawName || 'upload.bin'}`
          fs.writeFileSync(path.join(dirs.files, fname), buf)
          return send(res, 200, { ok: true, name: fname, bytes: buf.length })
        }

        if (route === '/api/media' && req.method === 'GET') {
          const p = path.basename(String(url.searchParams.get('p') ?? ''))
          const dirs = ensureDirs()
          const fp = path.join(dirs.uploads, p)
          if (!p || !fs.existsSync(fp)) return send(res, 404, { error: 'Media not found' })
          const buf = fs.readFileSync(fp)
          const sniffed = sniffImage(buf)
          res.writeHead(200, {
            'content-type': sniffed?.type || 'application/octet-stream',
            'cache-control': 'private, max-age=86400',
            'content-length': buf.length,
          })
          return res.end(buf)
        }

        if (route === '/api/avatar' && req.method === 'GET') {
          const hit = avatarFileOf(who)
          if (!hit) {
            res.writeHead(200, {
              'content-type': 'image/svg+xml; charset=utf-8',
              'cache-control': 'no-cache',
              'content-length': DEFAULT_AVATAR_SVG.length,
            })
            return res.end(DEFAULT_AVATAR_SVG)
          }
          const buf = fs.readFileSync(hit.file)
          const ct = hit.ext === 'png' ? 'image/png' : hit.ext === 'webp' ? 'image/webp' : 'image/jpeg'
          res.writeHead(200, { 'content-type': ct, 'cache-control': 'no-cache', 'content-length': buf.length })
          return res.end(buf)
        }

        if (route === '/api/tts' && req.method === 'POST') {
          if (!tts.enabled) return send(res, 404, { error: 'TTS is disabled' })
          const body = await readJsonBody(req)
          try {
            const out = await tts.synth(body?.text)
            return send(res, 200, { ok: true, ...out, url: `${PREFIX}/api/audio?h=${out.hash}` })
          } catch (err) {
            const st = ['EMPTY_TEXT', 'TEXT_TOO_LONG', 'EMPTY_SPEECH'].includes(err?.code) ? 400 : 502
            return send(res, st, { error: String(err?.message ?? err) })
          }
        }

        if (route === '/api/audio' && req.method === 'GET') {
          if (!tts.enabled) return send(res, 404, { error: 'TTS is disabled' })
          const h = String(url.searchParams.get('h') ?? '')
          const hit = tts.resolve(h)
          if (!hit) return send(res, 404, { error: 'Audio not found' })
          const buf = fs.readFileSync(hit.file)
          res.writeHead(200, {
            'content-type': hit.contentType,
            'cache-control': 'private, max-age=604800, immutable',
            'content-length': buf.length,
          })
          return res.end(buf)
        }

        if (route === '/api/rc/state' && req.method === 'GET') {
          return send(res, 200, { ok: true, ...remoteControl.state() })
        }

        if (route === '/api/rc/trigger' && req.method === 'POST') {
          if (!remoteControl.enabled) return send(res, 403, { error: 'Remote Control is disabled' })
          const body = await readJsonBody(req)
          try {
            const record = await remoteControl.trigger(body?.actionId, body?.payload)
            return send(res, 200, { ok: true, record })
          } catch (err) {
            const st = err?.code === 'INVALID_ACTION' || err?.code === 'ACTION_NOT_FOUND' ? 400 : 502
            return send(res, st, { error: String(err?.message ?? err) })
          }
        }

        return send(res, 404, { error: 'Not found' })
      }),
    },

    // 3. Desktop DSH Settings Panel Admin API (/phone-chat/admin/*) — strict direct loopback only
    {
      kind: 'prefix',
      path: `${PREFIX}/admin`,
      handler: guardAdmin(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1')
        const route = url.pathname.slice(`${PREFIX}/admin`.length)

        if (route === '/overview' && req.method === 'GET') {
          await syncPrimary()
          const hostHeader = String(req.headers?.host || '127.0.0.1')
          const localUrl = `http://${hostHeader}${PREFIX}?k=${key}`
          const pubBase = String(getCfg().publicUrl || '').trim().replace(/\/+$/, '')
          const connectUrl = pubBase ? `${pubBase}${PREFIX}?k=${key}` : localUrl
          return send(res, 200, {
            ok: true,
            localUrl,
            connectUrl,
            qrSvg: renderQrSvg(connectUrl),
            configPath: cfgStore.filePath,
            stateDir,
            peers: [peerInfo('primary'), peerInfo('fish'), peerInfo('harness')],
            diag: { ...buildDiag(), harness: await harness.diag() },
          })
        }

        if (route === '/config' && req.method === 'GET') {
          return send(res, 200, { ok: true, config: cfgStore.getSafe(), configPath: cfgStore.filePath })
        }

        if (route === '/config' && req.method === 'POST') {
          const body = await readJsonBody(req)
          const saved = cfgStore.update(body)
          ensureDirs()
          return send(res, 200, { ok: true, config: saved })
        }

        if (route === '/key/rotate' && req.method === 'POST') {
          rotateKey()
          return send(res, 200, { ok: true })
        }

        if (route === '/avatar' && req.method === 'GET') {
          const who = TARGETS.has(url.searchParams.get('who')) ? url.searchParams.get('who') : 'primary'
          const hit = avatarFileOf(who)
          if (!hit) {
            res.writeHead(200, {
              'content-type': 'image/svg+xml; charset=utf-8',
              'cache-control': 'no-cache',
              'content-length': DEFAULT_AVATAR_SVG.length,
            })
            return res.end(DEFAULT_AVATAR_SVG)
          }
          const buf = fs.readFileSync(hit.file)
          const ct = hit.ext === 'png' ? 'image/png' : hit.ext === 'webp' ? 'image/webp' : 'image/jpeg'
          res.writeHead(200, { 'content-type': ct, 'cache-control': 'no-cache', 'content-length': buf.length })
          return res.end(buf)
        }

        if (route === '/avatar' && req.method === 'POST') {
          const who = TARGETS.has(url.searchParams.get('who')) ? url.searchParams.get('who') : ''
          if (!who) return send(res, 400, { error: 'who must be primary, fish, or harness' })
          const buf = await readRawBody(req, AVATAR_MAX)
          const sniffed = sniffImage(buf)
          if (!sniffed) return send(res, 415, { error: 'Avatar must be PNG, JPEG, or WEBP' })
          for (const ext of ['png', 'jpg', 'webp']) {
            try {
              fs.unlinkSync(path.join(avatarsDir, `${who}.${ext}`))
            } catch {
              /* ignore */
            }
          }
          fs.writeFileSync(path.join(avatarsDir, `${who}.${sniffed.ext}`), buf)
          return send(res, 200, { ok: true, who, ext: sniffed.ext, bytes: buf.length })
        }

        if (route === '/avatar' && req.method === 'DELETE') {
          const who = TARGETS.has(url.searchParams.get('who')) ? url.searchParams.get('who') : ''
          if (!who) return send(res, 400, { error: 'who must be primary, fish, or harness' })
          for (const ext of ['png', 'jpg', 'webp']) {
            try {
              fs.unlinkSync(path.join(avatarsDir, `${who}.${ext}`))
            } catch {
              /* ignore */
            }
          }
          return send(res, 200, { ok: true, who, resetToDefaultBlack: true })
        }

        if (route === '/models' && req.method === 'GET') {
          const who = TARGETS.has(url.searchParams.get('who')) ? url.searchParams.get('who') : 'primary'
          return send(res, 200, await handleModelList(who))
        }

        if (route === '/model' && req.method === 'POST') {
          const body = await readJsonBody(req)
          const who = TARGETS.has(body?.who) ? body.who : 'primary'
          try {
            return send(res, 200, await handleSelectModel(who, body))
          } catch (err) {
            return send(res, err?.status || 500, { error: String(err?.message ?? err) })
          }
        }

        if (route === '/new' && req.method === 'POST') {
          const body = await readJsonBody(req)
          const who = TARGETS.has(body?.who) ? body.who : 'primary'
          try {
            return send(res, 200, await handleNewSession(who))
          } catch (err) {
            return send(res, err?.status || 500, { error: String(err?.message ?? err) })
          }
        }

        if (route === '/harness/probe' && req.method === 'POST') {
          const probe = await harness.probeProxy()
          return send(res, 200, { ok: probe.ok, probe })
        }

        if (route === '/tts/test' && req.method === 'POST') {
          if (!tts.enabled) return send(res, 400, { error: 'Enable TTS and save before testing' })
          const body = await readJsonBody(req)
          const sample = String(body?.text || 'Hello from DSH Phone Chat.').trim()
          const out = await tts.synth(sample)
          return send(res, 200, { ok: true, ...out, audioUrl: `${PREFIX}/admin/tts/audio?h=${out.hash}` })
        }

        if (route === '/tts/audio' && req.method === 'GET') {
          const h = String(url.searchParams.get('h') ?? '')
          const hit = tts.resolve(h)
          if (!hit) return send(res, 404, { error: 'Audio not found' })
          const buf = fs.readFileSync(hit.file)
          res.writeHead(200, { 'content-type': hit.contentType, 'content-length': buf.length })
          return res.end(buf)
        }

        if (route === '/tts/clear' && req.method === 'POST') {
          return send(res, 200, { ok: true, ...tts.clearCache() })
        }

        if (route === '/rc/audit' && req.method === 'GET') {
          return send(res, 200, { ok: true, audit: remoteControl.readAudit(30) })
        }

        if (route === '/cleanup/tmp' && req.method === 'POST') {
          const dirs = ensureDirs()
          let removed = 0
          try {
            for (const f of fs.readdirSync(dirs.tmp)) {
              fs.rmSync(path.join(dirs.tmp, f), { recursive: true, force: true })
              removed += 1
            }
          } catch {
            /* ignore */
          }
          return send(res, 200, { ok: true, removed })
        }

        return send(res, 404, { error: 'Admin route not found' })
      }),
    },
  ]

  const disposers = []
  const webServer = safeGet(ctx, 'webServer')
  if (webServer?.register) {
    for (const route of routes) {
      try {
        const d = webServer.register(route)
        if (typeof d === 'function') disposers.push(d)
        else if (d && typeof d.dispose === 'function') disposers.push(() => d.dispose())
      } catch (err) {
        console.warn('[phone-chat] Route registration failed:', route.path, err?.message ?? err)
      }
    }
  }

  return {
    dispose() {
      clearInterval(sweepTimer)
      for (const d of disposers) {
        try {
          d()
        } catch {
          /* ignore */
        }
      }
    },
  }
}
