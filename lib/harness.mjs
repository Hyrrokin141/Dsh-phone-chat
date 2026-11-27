/**
 * dsh-phone-chat / Generic Agent & Harness Adapter
 *
 * Decouples the external agent channel from any specific vendor CLI.
 * Supports three modes configured live via DSH Settings panel:
 *   - 'disabled': channel hidden / inactive
 *   - 'cli'     : drives any external CLI using argument templates
 *                 ({prompt}, {promptFile}, {session}, {image})
 *   - 'queue'   : language-agnostic file queue (<chatCwd>/to-agent & <chatCwd>/to-phone)
 *
 * Compliance note: this adapter intentionally does NOT enumerate or switch models
 * on third-party harnesses; users should manage model selection directly in their
 * respective provider / CLI configuration.
 */

import { spawn as nodeSpawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { writeFileAtomic } from './config.mjs'

const PROXY_PROBE_MS = 1500
const MAX_HISTORY = 20

export function probeProxyTcp(proxyUrl, timeoutMs = PROXY_PROBE_MS) {
  return new Promise((resolve) => {
    if (!proxyUrl) return resolve({ ok: true, skipped: true })
    let parsed
    try {
      parsed = new URL(proxyUrl)
    } catch {
      return resolve({ ok: false, error: `Invalid proxy URL: ${proxyUrl}` })
    }
    const host = parsed.hostname || '127.0.0.1'
    const port = Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80)
    let done = false
    const finish = (res) => {
      if (done) return
      done = true
      try {
        sock.destroy()
      } catch {
        /* ignore */
      }
      resolve(res)
    }
    const sock = net.createConnection({ host, port })
    sock.setTimeout(timeoutMs)
    sock.once('connect', () => finish({ ok: true, host, port }))
    sock.once('timeout', () => finish({ ok: false, error: `Proxy timeout (${host}:${port})` }))
    sock.once('error', (err) => finish({ ok: false, error: `Proxy unreachable (${host}:${port}): ${err?.code || err?.message}` }))
  })
}

function buildCleanEnv(proxyUrl) {
  const env = {}
  const strip = new Set([
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'grpc_proxy',
    'no_proxy',
    'electron_run_as_node',
    'electron_no_attach_console',
  ])
  for (const [k, v] of Object.entries(process.env)) {
    if (strip.has(k.toLowerCase())) continue
    if (v !== undefined) env[k] = v
  }
  if (proxyUrl) {
    env.HTTP_PROXY = proxyUrl
    env.HTTPS_PROXY = proxyUrl
    env.ALL_PROXY = proxyUrl
    env.GRPC_PROXY = proxyUrl
    env.NO_PROXY = 'localhost,127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16'
  }
  return env
}

function extractLastJson(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null
  try {
    const direct = JSON.parse(text)
    if (direct && typeof direct === 'object') return direct
  } catch {
    /* fallback to line scan */
  }
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].startsWith('{')) continue
    try {
      const obj = JSON.parse(lines[i])
      if (obj && typeof obj === 'object') return obj
    } catch {
      /* continue */
    }
  }
  return null
}

function getByPath(obj, dotPath) {
  if (!obj || !dotPath) return undefined
  return String(dotPath)
    .split('.')
    .reduce((cur, k) => (cur && typeof cur === 'object' ? cur[k] : undefined), obj)
}

export function createHarness(getConfig, deps = {}) {
  const stateDir = deps.stateDir
  const sessionFile = path.join(stateDir, 'harness-session.json')
  const spawnFn = typeof deps.spawn === 'function' ? deps.spawn : nodeSpawn
  const probeProxyFn = typeof deps.probeProxy === 'function' ? deps.probeProxy : probeProxyTcp

  let busy = false
  let lastError = ''

  function cfg() {
    return getConfig().harness || {}
  }

  function readSession() {
    try {
      const parsed = JSON.parse(fs.readFileSync(sessionFile, 'utf8'))
      if (parsed && typeof parsed === 'object') {
        return {
          sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : '',
          updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
          history: Array.isArray(parsed.history) ? parsed.history.slice(-MAX_HISTORY) : [],
        }
      }
    } catch {
      /* initial state */
    }
    return { sessionId: '', updatedAt: '', history: [] }
  }

  function writeSession(next) {
    const payload = {
      sessionId: String(next.sessionId ?? ''),
      updatedAt: new Date().toISOString(),
      history: Array.isArray(next.history) ? next.history.slice(-MAX_HISTORY) : [],
    }
    writeFileAtomic(sessionFile, `${JSON.stringify(payload, null, 2)}\n`)
    return payload
  }

  function runProcess(bin, args, { cwd, proxy, timeoutMs }) {
    return new Promise((resolve, reject) => {
      const env = buildCleanEnv(proxy)
      let child
      try {
        child = spawnFn(bin, args, {
          cwd: cwd || os.homedir(),
          env,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch (err) {
        return reject(new Error(`Failed to spawn harness CLI (${bin}): ${err?.message || err}`))
      }
      let stdout = ''
      let stderr = ''
      let settled = false
      const finish = (fn, val) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        fn(val)
      }
      const timer = setTimeout(() => {
        try {
          child.kill('SIGTERM')
        } catch {
          /* ignore */
        }
        finish(reject, new Error(`Harness CLI timed out after ${Math.round(timeoutMs / 1000)}s`))
      }, timeoutMs)

      child.stdout?.on('data', (d) => {
        stdout += String(d)
      })
      child.stderr?.on('data', (d) => {
        stderr += String(d)
      })
      child.once('error', (err) => finish(reject, new Error(`Harness CLI error (${bin}): ${err?.message || err}`)))
      child.once('close', (code) => {
        if (code !== 0) {
          const tail = (stderr || stdout).trim().slice(-400)
          return finish(reject, new Error(`Harness CLI exited with code ${code}${tail ? `: ${tail}` : ''}`))
        }
        finish(resolve, { stdout, stderr })
      })
    })
  }

  function expandArgs(tpl, vars) {
    const out = []
    for (const raw of tpl) {
      const s = String(raw)
      const hasOptional = /\{(session|image)\}/.test(s)
      const replaced = s
        .replace(/\{prompt\}/g, vars.prompt ?? '')
        .replace(/\{promptFile\}/g, vars.promptFile ?? '')
        .replace(/\{session\}/g, vars.session ?? '')
        .replace(/\{image\}/g, vars.image ?? '')
      if (hasOptional) {
        if ((s.includes('{session}') && !vars.session) || (s.includes('{image}') && !vars.image)) {
          continue
        }
      }
      out.push(replaced)
    }
    return out
  }

  async function sendCli(text, { imagePath = '' } = {}) {
    const c = cfg()
    if (!c.bin) throw new Error('Harness CLI binary path is not configured')
    if (busy) throw new Error('External Agent is currently processing another request')

    const proxy = String(c.proxy || '').trim()
    if (proxy) {
      const probe = await probeProxyFn(proxy)
      if (!probe.ok) {
        lastError = probe.error || 'Proxy unreachable'
        throw new Error(lastError)
      }
    }

    busy = true
    lastError = ''
    let promptFile = ''
    try {
      const sess = readSession()
      const tpl = Array.isArray(c.args) && c.args.length ? c.args : ['{prompt}']
      if (tpl.some((a) => String(a).includes('{promptFile}'))) {
        promptFile = path.join(os.tmpdir(), `dsh-harness-${process.pid}-${randomBytes(4).toString('hex')}.txt`)
        fs.writeFileSync(promptFile, String(text ?? ''), 'utf8')
      }
      const args = expandArgs(tpl, {
        prompt: String(text ?? ''),
        promptFile,
        session: sess.sessionId || '',
        image: imagePath || '',
      })
      const timeoutMs = Number(c.timeoutMs) > 0 ? Number(c.timeoutMs) : 180_000
      const { stdout } = await runProcess(c.bin, args, { cwd: c.cwd, proxy, timeoutMs })

      let reply = ''
      let nextSessionId = sess.sessionId
      if (c.responseFormat === 'json') {
        const parsed = extractLastJson(stdout)
        if (!parsed) throw new Error('Harness CLI did not return valid JSON output')
        const rVal = getByPath(parsed, c.jsonReplyField || 'reply')
        reply = typeof rVal === 'string' ? rVal.trim() : JSON.stringify(rVal ?? '')
        const sVal = getByPath(parsed, c.jsonSessionField || 'sessionId')
        if (typeof sVal === 'string' && sVal.trim()) nextSessionId = sVal.trim()
      } else {
        reply = stdout.trim()
      }
      if (!reply) reply = '(empty response)'
      writeSession({ ...sess, sessionId: nextSessionId })
      return { reply, sessionId: nextSessionId }
    } catch (err) {
      lastError = String(err?.message ?? err)
      throw err
    } finally {
      busy = false
      if (promptFile) {
        try {
          fs.unlinkSync(promptFile)
        } catch {
          /* ignore */
        }
      }
    }
  }

  function newSession() {
    const sess = readSession()
    const history = sess.history.slice()
    if (sess.sessionId) history.push({ sessionId: sess.sessionId, archivedAt: new Date().toISOString() })
    writeSession({ sessionId: '', history })
    return { ok: true, archivedSessionId: sess.sessionId || null }
  }

  function state() {
    const c = cfg()
    const sess = readSession()
    return {
      mode: c.mode || 'disabled',
      enabled: c.mode === 'cli' || c.mode === 'queue',
      sessionId: sess.sessionId || null,
      busy,
      lastError: lastError || null,
    }
  }

  async function diag() {
    const c = cfg()
    const proxy = String(c.proxy || '').trim()
    const proxyProbe = c.mode === 'cli' && proxy ? await probeProxyFn(proxy) : { ok: true, skipped: true }
    return {
      ...state(),
      binConfigured: Boolean(c.bin),
      cwd: c.cwd || null,
      proxy: proxy || null,
      proxyOk: proxyProbe.ok,
      proxyError: proxyProbe.ok ? null : proxyProbe.error,
    }
  }

  return {
    get mode() {
      return cfg().mode || 'disabled'
    },
    get enabled() {
      const m = cfg().mode
      return m === 'cli' || m === 'queue'
    },
    get busy() {
      return busy
    },
    sendCli,
    newSession,
    state,
    diag,
    probeProxy: () => probeProxyFn(String(cfg().proxy || '').trim()),
  }
}
