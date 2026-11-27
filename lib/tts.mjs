/**
 * dsh-phone-chat / Pluggable TTS Contract Layer
 *
 * Pure interface — ships with zero bundled vendor/unofficial TTS providers.
 * Users plug in their own TTS backend via:
 *   1. CLI mode : command + args with {textFile} {outFile} {voice}
 *   2. HTTP mode: POST endpoint receiving { text, voice } returning audio/* bytes
 *
 * Audio cache is content-addressed (sha256 prefix) and never auto-evicted;
 * users can inspect size/path and clear manually from the DSH settings panel.
 */

import { createHash, randomBytes } from 'node:crypto'
import { spawn as nodeSpawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const HASH_RE = /^[0-9a-f]{32}$/
const CONCURRENCY = 2

export function speakable(raw) {
  let s = String(raw ?? '')
  s = s.replace(/```[\s\S]*?```/g, ' ')
  s = s.replace(/`([^`]+)`/g, '$1')
  s = s.replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  s = s.replace(/https?:\/\/\S+/gi, ' ')
  s = s.replace(/^\s*\|?[\s:-]+\|[\s|:-]*$/gm, ' ')
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '')
  s = s.replace(/(\*\*|__|\*|_|~~)/g, '')
  s = s.replace(/[ \t]+/g, ' ')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

export function createTts(getConfig, deps = {}) {
  const spawnFn = typeof deps.spawn === 'function' ? deps.spawn : nodeSpawn
  const fetchFn = typeof deps.fetch === 'function' ? deps.fetch : globalThis.fetch

  let active = 0
  const waiters = []

  function acquire() {
    if (active < CONCURRENCY) {
      active += 1
      return Promise.resolve()
    }
    return new Promise((resolve) => waiters.push(resolve))
  }

  function release() {
    const next = waiters.shift()
    if (next) next()
    else active = Math.max(0, active - 1)
  }

  function cfg() {
    return getConfig().tts || {}
  }

  function cacheDir() {
    const c = cfg()
    if (c.cacheCwd) return String(c.cacheCwd)
    const chatCwd = getConfig().chatCwd || ''
    return chatCwd ? path.join(chatCwd, '.tts') : ''
  }

  function prepareText(text) {
    const c = cfg()
    const maxText = Math.max(50, Math.floor(Number(c.maxText) || 2000))
    const raw = String(text ?? '').trim()
    if (!raw) {
      const err = new Error('Text is empty')
      err.code = 'EMPTY_TEXT'
      throw err
    }
    if (raw.length > maxText) {
      const err = new Error(`Text exceeds maximum length (${maxText})`)
      err.code = 'TEXT_TOO_LONG'
      throw err
    }
    const clean = c.stripMarkdown !== false ? speakable(raw) : raw
    if (!clean) {
      const err = new Error('Nothing speakable remains after stripping Markdown')
      err.code = 'EMPTY_SPEECH'
      throw err
    }
    return clean
  }

  function hashOf(text) {
    const c = cfg()
    const clean = c.stripMarkdown !== false ? speakable(text) : String(text ?? '').trim()
    if (!clean) return ''
    const key = JSON.stringify([c.mode || 'cli', c.command || c.endpoint || '', c.voice || '', clean])
    return createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 32)
  }

  function resolve(hash) {
    const dir = cacheDir()
    if (!dir || !HASH_RE.test(String(hash ?? ''))) return null
    const mp3 = path.join(dir, `${hash}.mp3`)
    if (fs.existsSync(mp3)) return { file: mp3, contentType: 'audio/mpeg' }
    const wav = path.join(dir, `${hash}.wav`)
    if (fs.existsSync(wav)) return { file: wav, contentType: 'audio/wav' }
    return null
  }

  function runCliSynth(cleanText, outFile, c) {
    return new Promise((resolveFn, rejectFn) => {
      if (!c.command) return rejectFn(new Error('TTS CLI command is not configured'))
      const dir = path.dirname(outFile)
      fs.mkdirSync(dir, { recursive: true })
      const inFile = path.join(dir, `.in-${process.pid}-${randomBytes(4).toString('hex')}.txt`)
      fs.writeFileSync(inFile, cleanText, 'utf8')
      const argsTpl = Array.isArray(c.args) && c.args.length ? c.args : ['--text-file', '{textFile}', '--out', '{outFile}']
      const args = argsTpl.map((a) =>
        String(a)
          .replace(/\{textFile\}/g, inFile)
          .replace(/\{text\}/g, inFile)
          .replace(/\{outFile\}/g, outFile)
          .replace(/\{out\}/g, outFile)
          .replace(/\{voice\}/g, String(c.voice || '')),
      )

      const cleanupIn = () => {
        try {
          fs.unlinkSync(inFile)
        } catch {
          /* ignore */
        }
      }

      let child
      try {
        child = spawnFn(c.command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      } catch (err) {
        cleanupIn()
        return rejectFn(new Error(`Failed to spawn TTS command (${c.command}): ${err?.message || err}`))
      }

      let stderr = ''
      let settled = false
      const timeoutMs = Math.max(5000, Number(c.timeoutMs) || 90_000)
      const finish = (fn, val) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        cleanupIn()
        fn(val)
      }
      const timer = setTimeout(() => {
        try {
          child.kill('SIGTERM')
        } catch {
          /* ignore */
        }
        finish(rejectFn, new Error(`TTS CLI timed out after ${Math.round(timeoutMs / 1000)}s`))
      }, timeoutMs)

      child.stderr?.on('data', (d) => {
        stderr += String(d)
      })
      child.once('error', (err) => finish(rejectFn, new Error(`TTS CLI error: ${err?.message || err}`)))
      child.once('close', (code) => {
        if (code !== 0) {
          return finish(rejectFn, new Error(`TTS CLI exited with code ${code}: ${stderr.trim().slice(-300)}`))
        }
        if (!fs.existsSync(outFile) || fs.statSync(outFile).size === 0) {
          return finish(rejectFn, new Error('TTS CLI succeeded but did not write a non-empty audio file to {outFile}'))
        }
        finish(resolveFn, { contentType: 'audio/mpeg' })
      })
    })
  }

  async function runHttpSynth(cleanText, outBase, c) {
    if (!c.endpoint) throw new Error('TTS HTTP endpoint is not configured')
    const headers = { 'content-type': 'application/json' }
    if (c.authHeader) headers.authorization = String(c.authHeader)
    const timeoutMs = Math.max(5000, Number(c.timeoutMs) || 90_000)
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    try {
      const resp = await fetchFn(c.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: cleanText, voice: c.voice || undefined }),
        signal: ac.signal,
      })
      if (!resp.ok) {
        const bodyText = await resp.text().catch(() => '')
        throw new Error(`TTS HTTP ${resp.status}: ${bodyText.slice(0, 240)}`)
      }
      const ct = String(resp.headers?.get?.('content-type') || 'audio/mpeg').toLowerCase()
      let buf
      let ext = '.mp3'
      if (ct.includes('application/json')) {
        const data = await resp.json()
        if (!data?.audioBase64) throw new Error('TTS HTTP JSON response missing audioBase64')
        buf = Buffer.from(data.audioBase64, 'base64')
        if (String(data.contentType || '').includes('wav')) ext = '.wav'
      } else {
        buf = Buffer.from(await resp.arrayBuffer())
        if (ct.includes('wav')) ext = '.wav'
      }
      if (!buf.length) throw new Error('TTS HTTP endpoint returned empty audio')
      fs.mkdirSync(path.dirname(outBase), { recursive: true })
      const finalFile = `${outBase}${ext}`
      fs.writeFileSync(finalFile, buf)
      return { file: finalFile, bytes: buf.length }
    } finally {
      clearTimeout(timer)
    }
  }

  async function synth(text) {
    const c = cfg()
    if (!c.enabled) {
      const err = new Error('TTS is disabled')
      err.code = 'TTS_DISABLED'
      throw err
    }
    const clean = prepareText(text)
    const hash = hashOf(text)
    const dir = cacheDir()
    if (!dir) throw new Error('TTS cache directory is not configured')

    const existing = resolve(hash)
    if (existing) {
      return {
        hash,
        bytes: fs.statSync(existing.file).size,
        cached: true,
        tookMs: 0,
      }
    }

    const started = Date.now()
    await acquire()
    try {
      const recheck = resolve(hash)
      if (recheck) {
        return { hash, bytes: fs.statSync(recheck.file).size, cached: true, tookMs: Date.now() - started }
      }
      fs.mkdirSync(dir, { recursive: true })
      if (c.mode === 'http') {
        const res = await runHttpSynth(clean, path.join(dir, hash), c)
        return { hash, bytes: res.bytes, cached: false, tookMs: Date.now() - started }
      }
      const tmpOut = path.join(dir, `.out-${hash}-${randomBytes(3).toString('hex')}.mp3`)
      const finalOut = path.join(dir, `${hash}.mp3`)
      try {
        await runCliSynth(clean, tmpOut, c)
        fs.renameSync(tmpOut, finalOut)
      } catch (err) {
        try {
          fs.unlinkSync(tmpOut)
        } catch {
          /* ignore */
        }
        throw err
      }
      return { hash, bytes: fs.statSync(finalOut).size, cached: false, tookMs: Date.now() - started }
    } finally {
      release()
    }
  }

  function stats() {
    const dir = cacheDir()
    let count = 0
    let bytes = 0
    if (dir && fs.existsSync(dir)) {
      try {
        for (const name of fs.readdirSync(dir)) {
          if (!/\.(mp3|wav)$/i.test(name) || name.startsWith('.')) continue
          try {
            bytes += fs.statSync(path.join(dir, name)).size
            count += 1
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    }
    const c = cfg()
    return {
      enabled: c.enabled === true,
      mode: c.mode || 'cli',
      voice: c.voice || null,
      cacheCount: count,
      cacheBytes: bytes,
      cacheDir: dir || null,
      maxText: Math.max(50, Math.floor(Number(c.maxText) || 2000)),
    }
  }

  function clearCache() {
    const dir = cacheDir()
    let removed = 0
    if (dir && fs.existsSync(dir)) {
      for (const name of fs.readdirSync(dir)) {
        if (!/\.(mp3|wav)$/i.test(name) || name.startsWith('.')) continue
        try {
          fs.unlinkSync(path.join(dir, name))
          removed += 1
        } catch {
          /* ignore */
        }
      }
    }
    return { removed }
  }

  return {
    get enabled() {
      return cfg().enabled === true
    },
    hashOf,
    resolve,
    synth,
    stats,
    clearCache,
  }
}
