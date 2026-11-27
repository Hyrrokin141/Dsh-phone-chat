import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import vm from 'node:vm'
import { apply } from '../lib/index.js'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-phone-chat-open-test-'))
const stateDir = path.join(tmpRoot, 'state')

const FAKE_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
])

function makeSpawnStub(handler) {
  return (bin, args, opts) => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {}
    queueMicrotask(async () => {
      try {
        const res = await handler(bin, args, opts)
        if (res.stdout) child.stdout.emit('data', Buffer.from(res.stdout))
        if (res.stderr) child.stderr.emit('data', Buffer.from(res.stderr))
        child.emit('close', res.code ?? 0)
      } catch (err) {
        child.emit('error', err)
      }
    })
    return child
  }
}

function createFakeHost(extraCfg = {}) {
  const registered = []
  let seq = 0
  const messages = []
  const fishHome = path.join(tmpRoot, '.dsh-fish', 'home')
  const ctx = {
    webServer: {
      register(route) {
        registered.push(route)
        return () => {}
      },
    },
    sessionController: {
      async create() {
        return { sessionId: 'sess-primary-1' }
      },
      async list() {
        return { items: [{ sessionId: 'sess-fish-1', cwd: fishHome, updatedAt: Date.now() }] }
      },
      async page({ throughSeq }) {
        if (throughSeq === Number.MAX_SAFE_INTEGER) throw new Error(`past cursor ${seq}`)
        return {
          records: messages.map((m, i) => ({
            seq: i + 1,
            event: m.type
              ? m
              : {
                  seq: i + 1,
                  type: m.role === 'user' ? 'user/message' : 'assistant/message',
                  data: { source: { kind: m.role === 'user' ? 'user' : 'assistant' }, message: { content: [{ type: 'text', text: m.text }] } },
                  time: m.at,
                },
          })),
        }
      },
      async prompt(req) {
        assert.ok(req && typeof req.sessionId === 'string' && req.sessionId.length > 0, 'prompt must receive sessionId')
        assert.ok(typeof req.requestId === 'string' && req.requestId.length > 0, 'prompt must receive requestId')
        assert.ok(Array.isArray(req.content) && req.content[0]?.type === 'text', 'prompt must receive content array')
        const text = req.content[0].text
        seq += 1
        messages.push({ role: 'user', text, at: Date.now() })
        seq += 1
        messages.push({ type: 'turn/start', time: Date.now() })
        seq += 1
        messages.push({ role: 'assistant', text: `Echo: ${text}`, at: Date.now() })
        seq += 1
        messages.push({ type: 'turn/end', time: Date.now() })
        return { accepted: true }
      },
      async modelCatalog() {
        return { default: { provider: 'demo', model: 'demo-v1' }, groups: [{ id: 'demo', models: [{ id: 'demo-v1', label: 'Demo v1' }] }] }
      },
      async selectModel(req) {
        assert.ok(req && typeof req.sessionId === 'string' && req.sessionId.length > 0, 'selectModel must receive top-level sessionId')
        assert.ok(req.provider && req.model, 'selectModel must receive provider and model')
        return { ok: true, selected: { provider: req.provider, model: req.model } }
      },
    },
  }

  const plugin = apply(ctx, { home: tmpRoot, stateDir, ...extraCfg })

  async function invoke(method, urlPath, { headers = {}, body = null, remoteAddress = '127.0.0.1' } = {}) {
    const u = new URL(urlPath, 'http://127.0.0.1')
    const route = registered.find((r) => (r.kind === 'exact' ? u.pathname === r.path : u.pathname.startsWith(r.path)))
    assert.ok(route, `No route matched ${urlPath}`)
    const req = new Readable({ read() {} })
    req.method = method
    req.url = urlPath
    req.headers = { host: '127.0.0.1:4321', ...headers }
    req.socket = { remoteAddress }
    if (body != null) {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8')
      req.push(buf)
    }
    req.push(null)

    let status = 200
    const resHeaders = {}
    const chunks = []
    const res = {
      setHeader(k, v) {
        resHeaders[k.toLowerCase()] = v
      },
      writeHead(st, h = {}) {
        status = st
        for (const [k, v] of Object.entries(h)) resHeaders[k.toLowerCase()] = v
      },
      end(chunk) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      },
    }
    await route.handler(req, res)
    const raw = Buffer.concat(chunks)
    let json = null
    try {
      json = JSON.parse(raw.toString('utf8'))
    } catch {
      /* non-json */
    }
    return { status, headers: resHeaders, raw, json }
  }

  return { plugin, invoke }
}

let passed = 0
function test(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1
      console.log(`  PASS  ${label}`)
    })
}

const webhookCalls = []
const { plugin, invoke } = createFakeHost({
  _fishSay: async (_ctx, text) => ({ herReply: `Fish replied: ${text}`, sessionId: 'sess-fish-1' }),
  _harnessSpawn: makeSpawnStub((bin, args) => {
    const promptIdx = args.indexOf('--prompt')
    const p = promptIdx >= 0 ? args[promptIdx + 1] : args.join(' ')
    return { code: 0, stdout: JSON.stringify({ reply: `Harness replied: ${p}`, sessionId: 'h-sess-42' }) }
  }),
  _harnessProbeProxy: async () => ({ ok: true, host: '127.0.0.1', port: 7890 }),
  _ttsSpawn: makeSpawnStub((bin, args) => {
    const outIdx = args.indexOf('--out')
    const outFile = args[outIdx + 1]
    fs.writeFileSync(outFile, Buffer.from('FAKE_MP3_BYTES'))
    return { code: 0 }
  }),
  _rcSpawn: makeSpawnStub((bin, args) => ({ code: 0, stdout: `Ran ${bin} ${args.join(' ')}` })),
  _rcFetch: async (url, opts) => {
    webhookCalls.push({ url, headers: opts.headers, body: opts.body })
    return { ok: true, status: 200, text: async () => 'Webhook OK' }
  },
})

const key = fs.readFileSync(path.join(stateDir, 'key.txt'), 'utf8').trim()

try {
  await test('1. Mobile page auth + HttpOnly cookie + Admin strict loopback', async () => {
    assert.equal((await invoke('GET', '/phone-chat')).status, 401)
    const r200 = await invoke('GET', `/phone-chat?k=${key}`)
    assert.equal(r200.status, 200)
    assert.match(String(r200.headers['set-cookie'] || ''), /pc_key=.*HttpOnly/)
    assert.equal((await invoke('GET', '/phone-chat/admin/overview', { headers: { 'x-forwarded-for': '10.0.0.2' } })).status, 403)
    const ov = await invoke('GET', '/phone-chat/admin/overview')
    assert.equal(ov.status, 200)
    assert.ok(ov.json.qrSvg.startsWith('<svg'))
  })

  await test('2. Default avatars pure black (#000000) + upload/reset + badge tagColor', async () => {
    const def = await invoke('GET', `/phone-chat/api/avatar?who=primary&k=${key}`)
    assert.match(def.raw.toString('utf8'), /#000000/)
    assert.equal((await invoke('POST', '/phone-chat/admin/avatar?who=primary', { body: FAKE_PNG })).status, 200)
    assert.equal((await invoke('DELETE', '/phone-chat/admin/avatar?who=primary')).status, 200)

    await invoke('POST', '/phone-chat/admin/config', { body: { peers: { primary: { tagColor: '#ec4899' } } } })
    const peers = await invoke('GET', `/phone-chat/api/peers?k=${key}`)
    assert.equal(peers.json.peers[0].tagColor, '#ec4899')
  })

  await test('3. Optional dsh-fish integration works when enabled and supports DSH model switching', async () => {
    await invoke('POST', '/phone-chat/admin/config', { body: { fish: { enabled: true } } })
    const s = await invoke('POST', `/phone-chat/api/send?who=fish&k=${key}`, { body: { text: 'hello fish' } })
    assert.equal(s.status, 200)
    assert.equal(s.json.reply, 'Fish replied: hello fish')
    const m = await invoke('POST', `/phone-chat/api/model?who=fish&k=${key}`, { body: { provider: 'demo', model: 'demo-v1' } })
    assert.equal(m.status, 200)
    assert.equal(m.json.sessionId, 'sess-fish-1')
    const mp = await invoke('POST', `/phone-chat/api/model?who=primary&k=${key}`, { body: { provider: 'demo', model: 'demo-v1' } })
    assert.equal(mp.status, 200)
    assert.equal(mp.json.sessionId, 'sess-primary-1')
    const sp = await invoke('POST', `/phone-chat/api/send?who=primary&k=${key}`, { body: { text: 'hello primary' } })
    assert.equal(sp.status, 200)
    assert.equal(sp.json.accepted, true)
    const stPrimary = await invoke('GET', `/phone-chat/api/state?who=primary&k=${key}`)
    assert.equal(stPrimary.json.messages.length, 2)
    assert.equal(stPrimary.json.messages[1].text, 'Echo: hello primary')
    assert.equal(stPrimary.json.peer.busy, false)
  })

  await test('4. External Harness works in CLI/Queue mode and explicitly disables model switching', async () => {
    await invoke('POST', '/phone-chat/admin/config', {
      body: {
        harness: {
          mode: 'cli',
          bin: 'fake-agent-cli',
          args: ['--prompt', '{prompt}', '--session', '{session}'],
          responseFormat: 'json',
          jsonReplyField: 'reply',
          jsonSessionField: 'sessionId',
        },
      },
    })
    const cliSend = await invoke('POST', `/phone-chat/api/send?who=harness&k=${key}`, { body: { text: 'ping cli' } })
    assert.equal(cliSend.status, 200)
    assert.equal(cliSend.json.reply, 'Harness replied: ping cli')

    const mList = await invoke('GET', `/phone-chat/api/models?who=harness&k=${key}`)
    assert.equal(mList.json.disabled, true)
    const mSet = await invoke('POST', `/phone-chat/api/model?who=harness&k=${key}`, { body: { model: 'x' } })
    assert.equal(mSet.status, 400)
  })

  await test('5. TTS pure contract: disabled=404, enabled CLI synth + cache + clear', async () => {
    assert.equal((await invoke('POST', `/phone-chat/api/tts?k=${key}`, { body: { text: 'hi' } })).status, 404)
    await invoke('POST', '/phone-chat/admin/config', {
      body: { tts: { enabled: true, mode: 'cli', command: 'fake-tts', args: ['--in', '{textFile}', '--out', '{outFile}'] } },
    })
    assert.equal((await invoke('POST', `/phone-chat/api/tts?k=${key}`, { body: { text: '**Hi**' } })).json.cached, false)
    assert.equal((await invoke('POST', `/phone-chat/api/tts?k=${key}`, { body: { text: '**Hi**' } })).json.cached, true)
    assert.equal((await invoke('POST', '/phone-chat/admin/tts/clear')).json.removed, 1)
  })

  await test('6. Remote Control: disabled=403, whitelist actions + webhook HMAC signature', async () => {
    assert.equal((await invoke('POST', `/phone-chat/api/rc/trigger?k=${key}`, { body: { actionId: 'lock' } })).status, 403)
    await invoke('POST', '/phone-chat/admin/config', {
      body: {
        remoteControl: {
          enabled: true,
          mode: 'actions',
          actions: [{ id: 'ping_host', label: 'Ping Host', command: 'echo', args: ['hello'], confirm: true }],
        },
      },
    })
    assert.equal((await invoke('POST', `/phone-chat/api/rc/trigger?k=${key}`, { body: { actionId: 'rm_rf' } })).status, 400)
    assert.equal((await invoke('POST', `/phone-chat/api/rc/trigger?k=${key}`, { body: { actionId: 'ping_host' } })).status, 200)

    await invoke('POST', '/phone-chat/admin/config', {
      body: { remoteControl: { enabled: true, mode: 'webhook', webhookUrl: 'http://127.0.0.1:9999/rc', webhookSecret: 's3cr3t' } },
    })
    assert.equal((await invoke('POST', `/phone-chat/api/rc/trigger?k=${key}`, { body: { actionId: 'sleep_pc' } })).status, 200)
    const expectedSig = createHmac('sha256', 's3cr3t').update(webhookCalls[0].body).digest('hex')
    assert.equal(webhookCalls[0].headers['x-dsh-signature'], expectedSig)
  })

  await test('7. Panel client.js uses "远程聊天" sidebar label, "助手头像" tab, and badge colors', async () => {
    const src = fs.readFileSync(path.resolve('lib/client.js'), 'utf8')
    assert.match(src, /label:\s*\(\)\s*=>\s*'远程聊天'/)
    assert.match(src, /\['peers',\s*'助手头像'\]/)
    assert.match(src, /徽章基色/)
    assert.match(src, /回复中提示文案/)
    assert.match(src, /前往对应提供方/)
    assert.ok(!/edge-tts|noelle|openrouter/i.test(src))
  })

  await test('8. Mobile profile API (nickname + thinkingText) and page.html avatar card / online dot / thinking status', async () => {
    const initPeers = await invoke('GET', `/phone-chat/api/peers?k=${key}`)
    const primaryInit = initPeers.json.peers.find((p) => p.id === 'primary')
    assert.equal(primaryInit.thinkingText, '正在思考')
    assert.equal(primaryInit.supportsModelSwitch, true)
    const harnessInit = initPeers.json.peers.find((p) => p.id === 'harness')
    assert.equal(harnessInit.supportsModelSwitch, false)

    const upd = await invoke('POST', `/phone-chat/api/profile?k=${key}`, {
      body: { who: 'primary', name: 'My Lead', thinkingText: '努力构思中…' },
    })
    assert.equal(upd.status, 200)
    assert.equal(upd.json.peer.name, 'My Lead')
    assert.equal(upd.json.peer.thinkingText, '努力构思中…')

    // Clearing thinkingText resets to default '正在思考'
    const resetThink = await invoke('POST', `/phone-chat/api/profile?k=${key}`, {
      body: { who: 'primary', thinkingText: '' },
    })
    assert.equal(resetThink.status, 200)
    assert.equal(resetThink.json.peer.thinkingText, '正在思考')

    // Third-party harness supports nickname + thinkingText update, still disallows model switch
    const updHarness = await invoke('POST', `/phone-chat/api/profile?k=${key}`, {
      body: { who: 'harness', name: 'Ext Bot', thinkingText: '外部处理中' },
    })
    assert.equal(updHarness.status, 200)
    assert.equal(updHarness.json.peer.name, 'Ext Bot')
    assert.equal(updHarness.json.peer.thinkingText, '外部处理中')
    assert.equal(updHarness.json.peer.supportsModelSwitch, false)

    // Invalid profile payload rejected
    assert.equal((await invoke('POST', `/phone-chat/api/profile?k=${key}`, { body: { who: 'primary', name: 'bad\nname' } })).status, 400)
    assert.equal((await invoke('POST', `/phone-chat/api/profile?k=${key}`, { body: { who: 'unknown', name: 'x' } })).status, 400)

    const html = fs.readFileSync(path.resolve('lib/page.html'), 'utf8')
    assert.match(html, /<header class="bar"><h1>聊天<\/h1>/)
    assert.match(html, /class="av-dot"/)
    assert.match(html, /id="profileModal"/)
    assert.match(html, /openProfileCard/)
    assert.match(html, /pfModelSec/)
    assert.match(html, /正在思考/)
    assert.match(html, /curWho === 'primary' \|\| curWho === 'fish'/)
    assert.match(html, /g\.id \|\| g\.provider/)
    const clientSrc = fs.readFileSync(path.resolve('lib/client.js'), 'utf8')
    assert.match(clientSrc, /g\.id \|\| g\.provider/)
  })

  await test('9. Mobile chat prevents forced auto-scroll on poll and renders **bold** without stray asterisks', async () => {
    const html = fs.readFileSync(path.resolve('lib/page.html'), 'utf8')
    assert.match(html, /function isNearBottom\(/)
    assert.match(html, /addEventListener\('scroll'/)
    assert.match(html, /if \(sig === lastMsgSig\)/)
    assert.match(html, /log\.scrollTop = prevScrollTop/)
    assert.match(html, /txt\.innerHTML = renderMarkdown\(m\.text\)/)
    assert.match(html, /stripMdPreview\(p\.lastText\)/)

    const helperMatch = html.match(/function escHtml\(s\)\{[\s\S]*?function isNearBottom\(el\)\{[\s\S]*?\}/)
    assert.ok(helperMatch, 'Markdown and scroll helpers must exist in page.html')
    const sandbox = {}
    vm.runInNewContext(helperMatch[0], sandbox)

    // Bold **内容** renders to <strong> without stray *
    assert.equal(sandbox.renderMarkdown('信息  **内容**  测试'), '信息  <strong>内容</strong>  测试')
    assert.equal(sandbox.renderMarkdown('**A** 和 **B**'), '<strong>A</strong> 和 <strong>B</strong>')
    assert.equal(sandbox.renderMarkdown('***重要*** 与 *斜体*'), '<strong><em>重要</em></strong> 与 <em>斜体</em>')
    assert.equal(sandbox.renderMarkdown('* 第一项\n* 第二项'), '• 第一项\n• 第二项')
    assert.equal(sandbox.renderMarkdown('2 * 3 * 4'), '2 * 3 * 4')
    assert.equal(sandbox.renderMarkdown('`**保留星号**`'), '<code>**保留星号**</code>')
    assert.equal(
      sandbox.renderMarkdown('<script>alert(1)</script> **安全**'),
      '&lt;script&gt;alert(1)&lt;/script&gt; <strong>安全</strong>',
    )

    // Preview strips ** without stray *
    assert.equal(sandbox.stripMdPreview('信息  **内容**  测试'), '信息 内容 测试')
    assert.equal(sandbox.stripMdPreview('**粗体** 和 *斜体*'), '粗体 和 斜体')

    // isNearBottom threshold check
    assert.equal(sandbox.isNearBottom({ scrollHeight: 1000, scrollTop: 500, clientHeight: 480 }), true)
    assert.equal(sandbox.isNearBottom({ scrollHeight: 1000, scrollTop: 200, clientHeight: 480 }), false)
  })

  console.log(`\nALL ${passed} TESTS PASSED`)
} finally {
  plugin.dispose()
  fs.rmSync(tmpRoot, { recursive: true, force: true })
}
