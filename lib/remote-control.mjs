/**
 * dsh-phone-chat / Pluggable Remote Control Interface
 *
 * Disabled by default. Never exposes an arbitrary shell endpoint.
 * Supports two user-configured integration modes:
 *   1. 'actions': whitelisted action buttons registered in the DSH settings panel
 *   2. 'webhook': forwards action triggers to a user-hosted local HTTP service
 *                 with optional HMAC-SHA256 signature (X-DSH-Signature)
 */

import { createHmac } from 'node:crypto'
import { spawn as nodeSpawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ACTION_ID_RE = /^[a-zA-Z0-9_-]{1,48}$/
const MAX_AUDIT = 50

export function createRemoteControl(getConfig, deps = {}) {
  const stateDir = deps.stateDir
  const auditFile = path.join(stateDir, 'rc-audit.jsonl')
  const spawnFn = typeof deps.spawn === 'function' ? deps.spawn : nodeSpawn
  const fetchFn = typeof deps.fetch === 'function' ? deps.fetch : globalThis.fetch

  function cfg() {
    return getConfig().remoteControl || {}
  }

  function appendAudit(entry) {
    try {
      fs.mkdirSync(stateDir, { recursive: true })
      fs.appendFileSync(auditFile, `${JSON.stringify(entry)}\n`, 'utf8')
    } catch {
      /* audit failure should not break action response */
    }
  }

  function readAudit(limit = 20) {
    try {
      const lines = fs.readFileSync(auditFile, 'utf8').split(/\r?\n/).filter(Boolean)
      return lines
        .slice(-Math.min(MAX_AUDIT, limit))
        .map((l) => {
          try {
            return JSON.parse(l)
          } catch {
            return null
          }
        })
        .filter(Boolean)
        .reverse()
    } catch {
      return []
    }
  }

  function publicActions() {
    const c = cfg()
    const list = Array.isArray(c.actions) ? c.actions : []
    return list
      .filter((a) => a && ACTION_ID_RE.test(String(a.id || '')))
      .map((a) => ({
        id: String(a.id),
        label: String(a.label || a.id).slice(0, 32),
        description: String(a.description || '').slice(0, 120),
        confirm: a.confirm !== false,
      }))
  }

  function runCommandAction(action, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (!action.command) return reject(new Error(`Action "${action.id}" has no command configured`))
      const args = Array.isArray(action.args) ? action.args.map(String) : []
      let child
      try {
        child = spawnFn(String(action.command), args, {
          cwd: action.cwd || os.homedir(),
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch (err) {
        return reject(new Error(`Failed to spawn action command: ${err?.message || err}`))
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
        finish(reject, new Error(`Action timed out after ${Math.round(timeoutMs / 1000)}s`))
      }, timeoutMs)

      child.stdout?.on('data', (d) => {
        if (stdout.length < 8192) stdout += String(d)
      })
      child.stderr?.on('data', (d) => {
        if (stderr.length < 4096) stderr += String(d)
      })
      child.once('error', (err) => finish(reject, new Error(`Action spawn error: ${err?.message || err}`)))
      child.once('close', (code) => {
        if (code !== 0) {
          return finish(reject, new Error(`Exited with code ${code}: ${(stderr || stdout).trim().slice(0, 300)}`))
        }
        finish(resolve, { output: (stdout || 'OK').trim().slice(0, 1000) })
      })
    })
  }

  async function runWebhookAction(actionId, payload, c, timeoutMs) {
    if (!c.webhookUrl) throw new Error('Remote Control webhook URL is not configured')
    const bodyStr = JSON.stringify({
      actionId,
      payload: payload ?? {},
      timestamp: new Date().toISOString(),
    })
    const headers = { 'content-type': 'application/json' }
    if (c.webhookSecret) {
      headers['x-dsh-signature'] = createHmac('sha256', String(c.webhookSecret)).update(bodyStr).digest('hex')
    }
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    try {
      const resp = await fetchFn(c.webhookUrl, { method: 'POST', headers, body: bodyStr, signal: ac.signal })
      const text = await resp.text().catch(() => '')
      if (!resp.ok) throw new Error(`Webhook HTTP ${resp.status}: ${text.slice(0, 240)}`)
      return { output: text.trim().slice(0, 1000) || 'OK' }
    } finally {
      clearTimeout(timer)
    }
  }

  async function trigger(actionId, payload = {}) {
    const c = cfg()
    if (!c.enabled) {
      const err = new Error('Remote Control is disabled')
      err.code = 'RC_DISABLED'
      throw err
    }
    const cleanId = String(actionId ?? '').trim()
    if (!ACTION_ID_RE.test(cleanId)) {
      const err = new Error('Invalid actionId')
      err.code = 'INVALID_ACTION'
      throw err
    }

    const started = Date.now()
    const timeoutMs = Math.max(2000, Number(c.timeoutMs) || 30_000)
    try {
      let result
      if (c.mode === 'webhook') {
        result = await runWebhookAction(cleanId, payload, c, timeoutMs)
      } else {
        const list = Array.isArray(c.actions) ? c.actions : []
        const action = list.find((a) => a && String(a.id) === cleanId)
        if (!action) {
          const err = new Error(`Action "${cleanId}" is not in the whitelist`)
          err.code = 'ACTION_NOT_FOUND'
          throw err
        }
        const actTimeout = Math.max(2000, Number(action.timeoutMs) || timeoutMs)
        result = await runCommandAction(action, actTimeout)
      }
      const record = {
        at: new Date().toISOString(),
        actionId: cleanId,
        mode: c.mode,
        ok: true,
        tookMs: Date.now() - started,
        output: result.output,
      }
      appendAudit(record)
      return record
    } catch (err) {
      const record = {
        at: new Date().toISOString(),
        actionId: cleanId,
        mode: c.mode,
        ok: false,
        tookMs: Date.now() - started,
        error: String(err?.message ?? err),
      }
      appendAudit(record)
      throw err
    }
  }

  function state() {
    const c = cfg()
    return {
      enabled: c.enabled === true,
      mode: c.mode || 'actions',
      actions: publicActions(),
      webhookConfigured: Boolean(c.webhookUrl),
    }
  }

  return {
    get enabled() {
      return cfg().enabled === true
    },
    state,
    trigger,
    readAudit,
  }
}
