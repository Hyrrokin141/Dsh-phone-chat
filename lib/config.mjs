/**
 * dsh-phone-chat / Unified configuration store
 *
 * Merges: DEFAULTS <- cordis.patch.yml config <- ~/.dsh/phone-chat/config.json
 * Sensitive fields are write-only (never echoed back to the UI).
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/
export const DEFAULT_THINKING_TEXT = '正在思考'
export const THINKING_MAX = 24

export function cleanTagColor(v) {
  const s = String(v ?? '').trim()
  return HEX_COLOR_RE.test(s) ? s.toLowerCase() : ''
}

export function cleanThinkingText(v) {
  if (typeof v !== 'string') return ''
  if (/[\r\n]/.test(v)) return ''
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!s || s.length > THINKING_MAX) return ''
  return s
}

export function writeFileAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const part = `${filePath}.${process.pid}.${Date.now().toString(36)}.part`
  fs.writeFileSync(part, content, 'utf8')
  try {
    fs.renameSync(part, filePath)
  } catch (err) {
    try {
      fs.unlinkSync(part)
    } catch {
      /* ignore cleanup error */
    }
    throw err
  }
}

export function defaultDataRoot(home = os.homedir()) {
  return path.join(home, '.dsh', 'phone-chat', 'data')
}

export function buildDefaults(home = os.homedir()) {
  const dataRoot = defaultDataRoot(home)
  return {
    hostOnly: true,
    publicUrl: '',
    leadCwd: path.join(dataRoot, 'workspace'),
    leadPreset: 'standard',
    cursorTtlMs: 1000,
    chatCwd: path.join(dataRoot, 'chat'),
    uploadCwd: path.join(dataRoot, 'photos'),
    filesCwd: path.join(dataRoot, 'files'),
    historyCwd: path.join(dataRoot, 'history'),
    keepChat: false,
    keepUploads: false,
    uploadTotalMax: 512 * 1024 * 1024,
    peers: {
      primary: { name: 'Primary Agent', tag: 'DSH', tagColor: '#3b82f6', thinkingText: DEFAULT_THINKING_TEXT },
      fish: { name: 'Fish Partner', tag: 'dsh-fish', tagColor: '#10b981', thinkingText: DEFAULT_THINKING_TEXT },
      harness: { name: 'External Agent', tag: 'Harness', tagColor: '#8b5cf6', thinkingText: DEFAULT_THINKING_TEXT },
    },
    fish: {
      enabled: false,
      root: path.join(home, '.dsh-fish'),
      libDir: '',
      waitMs: 90_000,
    },
    harness: {
      mode: 'disabled', // 'disabled' | 'cli' | 'queue'
      bin: '',
      cwd: '',
      args: ['{prompt}'],
      proxy: '',
      timeoutMs: 180_000,
      responseFormat: 'text', // 'text' | 'json'
      jsonReplyField: 'reply',
      jsonSessionField: 'sessionId',
    },
    tts: {
      enabled: false,
      mode: 'cli', // 'cli' | 'http'
      command: '',
      args: ['--text-file', '{textFile}', '--out', '{outFile}'],
      endpoint: '',
      voice: '',
      authHeader: '',
      stripMarkdown: true,
      maxText: 2000,
      timeoutMs: 90_000,
      cacheCwd: '',
    },
    remoteControl: {
      enabled: false,
      mode: 'actions', // 'actions' | 'webhook'
      webhookUrl: '',
      webhookSecret: '',
      timeoutMs: 30_000,
      actions: [],
    },
  }
}

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

export function deepMerge(base, over) {
  if (!isPlainObject(over)) return base
  const out = { ...base }
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMerge(out[k], v)
    } else {
      out[k] = Array.isArray(v) ? v.slice() : v
    }
  }
  return out
}

const SECRET_SENTINEL = '__KEEP_SECRET__'

export function createConfigStore(stateDir, baseConfig = {}, home = os.homedir()) {
  const filePath = path.join(stateDir, 'config.json')
  const defaults = buildDefaults(home)

  function readLocalFile() {
    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(raw)
      return isPlainObject(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  let current = deepMerge(deepMerge(defaults, baseConfig), readLocalFile())

  function normalize(cfg) {
    const out = deepMerge(defaults, cfg)
    out.hostOnly = out.hostOnly !== false
    out.keepChat = out.keepChat === true
    out.keepUploads = out.keepUploads === true
    out.cursorTtlMs = Math.max(0, Math.floor(Number(out.cursorTtlMs) || 1000))
    out.uploadTotalMax = Math.max(1024 * 1024, Math.floor(Number(out.uploadTotalMax) || 512 * 1024 * 1024))
    for (const k of ['primary', 'fish', 'harness']) {
      if (!isPlainObject(out.peers[k])) out.peers[k] = { ...defaults.peers[k] }
      out.peers[k].tagColor = cleanTagColor(out.peers[k].tagColor)
      out.peers[k].thinkingText = cleanThinkingText(out.peers[k].thinkingText) || DEFAULT_THINKING_TEXT
    }
    out.fish.enabled = out.fish.enabled === true
    out.fish.waitMs = Math.max(5000, Math.min(180_000, Math.floor(Number(out.fish.waitMs) || 90_000)))
    if (!['disabled', 'cli', 'queue'].includes(out.harness.mode)) out.harness.mode = 'disabled'
    if (!['text', 'json'].includes(out.harness.responseFormat)) out.harness.responseFormat = 'text'
    if (!Array.isArray(out.harness.args)) out.harness.args = ['{prompt}']
    if (!['cli', 'http'].includes(out.tts.mode)) out.tts.mode = 'cli'
    if (!Array.isArray(out.tts.args)) out.tts.args = []
    out.tts.enabled = out.tts.enabled === true
    out.tts.stripMarkdown = out.tts.stripMarkdown !== false
    out.remoteControl.enabled = out.remoteControl.enabled === true
    if (!['actions', 'webhook'].includes(out.remoteControl.mode)) out.remoteControl.mode = 'actions'
    if (!Array.isArray(out.remoteControl.actions)) out.remoteControl.actions = []
    return out
  }

  current = normalize(current)

  function get() {
    return current
  }

  function getSafe() {
    const clone = JSON.parse(JSON.stringify(current))
    const hasTtsAuth = Boolean(clone.tts?.authHeader)
    const hasRcSecret = Boolean(clone.remoteControl?.webhookSecret)
    if (clone.tts) {
      clone.tts.authHeader = ''
      clone.tts.hasAuthHeader = hasTtsAuth
    }
    if (clone.remoteControl) {
      clone.remoteControl.webhookSecret = ''
      clone.remoteControl.hasWebhookSecret = hasRcSecret
    }
    return clone
  }

  function update(patch = {}) {
    if (!isPlainObject(patch)) throw new Error('Config patch must be a JSON object')
    const sanitized = JSON.parse(JSON.stringify(patch))
    if (sanitized.tts) {
      if (sanitized.tts.clearAuthHeader) {
        sanitized.tts.authHeader = ''
      } else if (!sanitized.tts.authHeader || sanitized.tts.authHeader === SECRET_SENTINEL) {
        sanitized.tts.authHeader = current.tts.authHeader
      }
      delete sanitized.tts.clearAuthHeader
      delete sanitized.tts.hasAuthHeader
    }
    if (sanitized.remoteControl) {
      if (sanitized.remoteControl.clearWebhookSecret) {
        sanitized.remoteControl.webhookSecret = ''
      } else if (!sanitized.remoteControl.webhookSecret || sanitized.remoteControl.webhookSecret === SECRET_SENTINEL) {
        sanitized.remoteControl.webhookSecret = current.remoteControl.webhookSecret
      }
      delete sanitized.remoteControl.clearWebhookSecret
      delete sanitized.remoteControl.hasWebhookSecret
    }
    const next = normalize(deepMerge(current, sanitized))
    writeFileAtomic(filePath, `${JSON.stringify(next, null, 2)}\n`)
    current = next
    return getSafe()
  }

  return {
    filePath,
    get,
    getSafe,
    update,
  }
}
