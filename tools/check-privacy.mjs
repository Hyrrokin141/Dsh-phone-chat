/**
 * Pre-publish privacy & hygiene scanner for dsh-phone-chat.
 * Fails if any tracked source file contains UTF-8 BOM, personal paths,
 * private hostnames, personal nicknames, bundled TTS vendors, or secret patterns.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const IGNORE_DIRS = new Set(['node_modules', '.git', '.tmp'])
const SELF = path.normalize(fileURLToPath(import.meta.url))

const FORBIDDEN = [
  { name: 'Windows user profile path', re: /C:\\Users\\[^\\\s]+/i },
  { name: 'Personal D:\\houses or D:\\workspace path', re: /D:\\(houses|workspace)\\/i },
  { name: 'Tailscale private domain', re: /\.ts\.net\b/i },
  { name: 'Personal proxy port 17890', re: /127\.0\.0\.1:17890/ },
  { name: 'Personal nicknames', re: /(工作鱼|生活鱼|哈基米|大肥鱼|小肥鱼)/i },
  { name: 'Bundled private TTS vendors', re: /(edge-tts|edge_tts|XiaoxiaoNeural|heygen-voice|openrouter-key)/i },
  { name: 'Potential API key literal', re: /(sk-[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z_-]{20,})/ },
]

const issues = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue
    const fp = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fp)
      continue
    }
    if (path.normalize(fp) === SELF) continue
    const raw = fs.readFileSync(fp)
    if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
      issues.push(`${path.relative(ROOT, fp)}: contains UTF-8 BOM`)
    }
    const text = raw.toString('utf8')
    const rel = path.relative(ROOT, fp)
    for (const rule of FORBIDDEN) {
      // Allow test file to explicitly assert absence of vendor names
      if (rel.startsWith('tests') && rule.name === 'Bundled private TTS vendors') continue
      const m = rule.re.exec(text)
      if (m) issues.push(`${rel}: matched [${rule.name}] -> ${m[0]}`)
    }
  }
}

walk(ROOT)

if (issues.length) {
  console.error('PRIVACY CHECK FAILED:')
  for (const i of issues) console.error('  -', i)
  process.exit(1)
}
console.log('PRIVACY CHECK PASSED: 0 issues, 0 BOMs, 0 personal traces.')
