/**
 * dsh-phone-chat — Desktop DSH Settings Panel
 *
 * Registers "远程聊天" in DSH Settings (settings.section slot).
 * Zero-build pure ESM using DSH's built-in React runtime and CSS tokens.
 */
window.__ModuleLoader__.load({
  id: 'dsh-phone-chat',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { createElement: h, useCallback, useEffect, useRef, useState } = React

    const ADMIN = '/phone-chat/admin'
    const CSS_ID = 'dsh-phone-chat/panel.css'
    const BASE_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#6b7280']

    const CSS = [
      '.dpc{max-width:780px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:12px;padding-bottom:24px}',
      '.dpc-hd{display:flex;flex-direction:column;gap:4px}',
      '.dpc-title{margin:0;font-size:18px;font-weight:600;line-height:26px}',
      '.dpc-sub{margin:0;font-size:12.5px;color:var(--dsw-alias-label-tertiary);line-height:18px}',
      '.dpc-tabs{display:flex;gap:6px;flex-wrap:wrap;padding:4px;border-radius:10px;background:rgba(127,127,127,.08);border:.5px solid var(--dsw-alias-border-l2)}',
      '.dpc-tab{background:transparent;border:none;border-radius:7px;padding:6px 11px;font-size:12.5px;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .15s}',
      '.dpc-tab:hover{background:rgba(127,127,127,.1)}',
      '.dpc-tab.on{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:500}',
      '.dpc-card{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:14px 16px;background:rgba(127,127,127,.03);display:flex;flex-direction:column;gap:10px}',
      '.dpc-ct{font-size:13.5px;font-weight:600;margin:0;display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '.dpc-row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px 18px;padding:8px 0;border-bottom:.5px solid var(--dsw-alias-border-l2);flex-wrap:wrap}',
      '.dpc-row:last-child{border-bottom:none;padding-bottom:0}',
      '.dpc-row>div:first-child{flex:1;min-width:190px}',
      '.dpc-lbl{font-size:13px;line-height:19px;display:flex;align-items:center;gap:6px}',
      '.dpc-hint{font-size:11.5px;color:var(--dsw-alias-label-tertiary);margin-top:2px;line-height:17px}',
      '.dpc-in,.dpc-sel,.dpc-ta{background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);font-size:12.5px;padding:4px 8px;outline:none;min-width:200px}',
      '.dpc-in,.dpc-sel{height:30px}',
      '.dpc-in.wide,.dpc-ta{min-width:280px;width:100%;max-width:360px}',
      '.dpc-ta{min-height:66px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}',
      '.dpc-in:focus-visible,.dpc-sel:focus-visible,.dpc-ta:focus-visible{border-color:var(--dsw-alias-brand-primary)}',
      '.dpc-btn{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground,#fff);border:none;border-radius:6px;font-size:12.5px;height:30px;padding:0 12px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}',
      '.dpc-btn:disabled{opacity:.5;cursor:default}',
      '.dpc-btn2{background:transparent;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}',
      '.dpc-btn-danger{background:transparent;border:1px solid var(--dsw-alias-state-error-primary,#e5484d);color:var(--dsw-alias-state-error-primary,#e5484d)}',
      '.dpc-btns{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
      '.dpc-badge{font-size:11px;padding:1px 7px;border-radius:999px;background:rgba(127,127,127,.14);color:var(--dsw-alias-label-secondary);border:1px solid transparent}',
      '.dpc-badge.ok{background:rgba(52,199,89,.16);color:#28a745}',
      '.dpc-badge.warn{background:rgba(255,176,32,.18);color:#d98200}',
      '.dpc-swatches{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.dpc-sw{width:20px;height:20px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0}',
      '.dpc-sw.on{border-color:var(--dsw-alias-label-primary);transform:scale(1.1)}',
      '.dpc-cpick{width:28px;height:24px;border:1px solid var(--dsw-alias-border-l2);border-radius:5px;background:transparent;padding:0;cursor:pointer}',
      '.dpc-qr-box{display:flex;gap:16px;align-items:center;flex-wrap:wrap}',
      '.dpc-qr{width:132px;height:132px;border-radius:10px;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);background:#fff;flex-shrink:0}',
      '.dpc-qr svg{width:100%;height:100%;display:block}',
      '.dpc-av{width:46px;height:46px;border-radius:50%;object-fit:cover;background:#000;border:1px solid var(--dsw-alias-border-l2);flex-shrink:0}',
      '.dpc-peer{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:.5px solid var(--dsw-alias-border-l2);flex-wrap:wrap}',
      '.dpc-peer:last-child{border-bottom:none;padding-bottom:0}',
      '.dpc-code{white-space:pre-wrap;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:17px;background:rgba(127,127,127,.08);border-radius:8px;padding:10px 12px;margin:6px 0 0;color:var(--dsw-alias-label-secondary)}',
      '.dpc-bar{height:8px;border-radius:999px;background:rgba(127,127,127,.16);overflow:hidden;margin-top:6px}',
      '.dpc-bar>i{display:block;height:100%;background:var(--dsw-alias-brand-primary);border-radius:999px}',
      '.dpc-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l2)}',
      '.dpc-err{color:var(--dsw-alias-state-error-primary,#e5484d);font-size:12px;white-space:pre-wrap}',
      '.dpc-ok{color:#28a745;font-size:12px}',
      '.dpc-det{border:.5px dashed var(--dsw-alias-border-l2);border-radius:8px;padding:8px 10px}',
      '.dpc-det summary{cursor:pointer;font-size:12px;color:var(--dsw-alias-label-secondary);font-weight:500}',
      '.dpc-act-item{border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px}',
    ].join('')

    function badgeStyle(color) {
      if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return undefined
      return { background: `${color}22`, color, borderColor: `${color}44` }
    }

    function useCss() {
      useEffect(() => {
        if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return
        const s = document.createElement('style')
        s.id = CSS_ID
        s.textContent = CSS
        document.head.appendChild(s)
      }, [])
    }

    async function api(p, opts = {}) {
      const resp = await fetch(`${ADMIN}${p}`, opts)
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`)
      return data
    }

    function fmtBytes(n) {
      const v = Number(n) || 0
      if (v < 1024) return `${v} B`
      if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
      return `${(v / (1024 * 1024)).toFixed(2)} MB`
    }

    function clone(o) {
      return JSON.parse(JSON.stringify(o))
    }

    const TABS = [
      ['overview', '概览与连接'],
      ['peers', '助手头像'],
      ['harness', 'Agent / Harness 接入'],
      ['tts', '语音合成接口'],
      ['rc', '远程控制接口'],
      ['storage', '存储与诊断'],
    ]

    function PhoneChatSection() {
      useCss()
      const [tab, setTab] = useState('overview')
      const [ov, setOv] = useState(null)
      const [cfg, setCfg] = useState(null)
      const [savedJson, setSavedJson] = useState('')
      const [busy, setBusy] = useState('')
      const [msg, setMsg] = useState('')
      const [err, setErr] = useState('')
      const [avTick, setAvTick] = useState(0)
      const [modelsMap, setModelsMap] = useState({ primary: [], fish: [] })
      const [audit, setAudit] = useState([])
      const [ttsSample, setTtsSample] = useState('Hello, this is a TTS interface test.')
      const [ttsAudioUrl, setTtsAudioUrl] = useState('')
      const [probeRes, setProbeRes] = useState('')
      const filePrimaryRef = useRef(null)
      const fileFishRef = useRef(null)
      const fileHarnessRef = useRef(null)

      const loadAll = useCallback(async () => {
        setErr('')
        try {
          const [o, c] = await Promise.all([api('/overview'), api('/config')])
          setOv(o)
          setCfg(c.config)
          setSavedJson(JSON.stringify(c.config))
        } catch (e) {
          setErr(String(e?.message || e))
        }
      }, [])

      useEffect(() => {
        loadAll()
      }, [loadAll])

      useEffect(() => {
        if (tab === 'peers') {
          Promise.allSettled([api('/models?who=primary'), api('/models?who=fish')]).then(([r1, r2]) => {
            setModelsMap({
              primary: r1.status === 'fulfilled' ? r1.value.groups || [] : [],
              fish: r2.status === 'fulfilled' ? r2.value.groups || [] : [],
            })
          })
        } else if (tab === 'rc') {
          api('/rc/audit').then((d) => setAudit(d.audit || [])).catch(() => {})
        }
      }, [tab])

      const dirty = Boolean(cfg && savedJson && JSON.stringify(cfg) !== savedJson)

      function patchCfg(fn) {
        setCfg((prev) => {
          const next = clone(prev)
          fn(next)
          return next
        })
      }

      async function saveConfig() {
        setBusy('save')
        setErr('')
        setMsg('')
        try {
          const res = await api('/config', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(cfg),
          })
          setCfg(res.config)
          setSavedJson(JSON.stringify(res.config))
          setMsg('配置已保存至本机 config.json（不进入 Git）。')
          await loadAll()
        } catch (e) {
          setErr(String(e?.message || e))
        } finally {
          setBusy('')
        }
      }

      async function uploadAvatar(who, file) {
        if (!file) return
        setBusy(`av-${who}`)
        setErr('')
        setMsg('')
        try {
          const buf = await file.arrayBuffer()
          await api(`/avatar?who=${who}`, {
            method: 'POST',
            headers: { 'content-type': file.type || 'application/octet-stream' },
            body: buf,
          })
          setAvTick((t) => t + 1)
          setMsg(`已更新 ${who} 头像。`)
          await loadAll()
        } catch (e) {
          setErr(String(e?.message || e))
        } finally {
          setBusy('')
        }
      }

      async function resetAvatar(who) {
        setBusy(`av-reset-${who}`)
        setErr('')
        try {
          await api(`/avatar?who=${who}`, { method: 'DELETE' })
          setAvTick((t) => t + 1)
          setMsg(`已将 ${who} 头像恢复为纯黑默认。`)
          await loadAll()
        } catch (e) {
          setErr(String(e?.message || e))
        } finally {
          setBusy('')
        }
      }

      async function copyText(t, label) {
        try {
          await navigator.clipboard.writeText(t)
          setMsg(`已复制 ${label}。`)
        } catch {
          setErr('剪贴板不可用，请手动复制。')
        }
      }

      if (!cfg || !ov) {
        return h('div', { className: 'dpc' },
          h('h3', { className: 'dpc-title' }, '远程聊天'),
          err ? h('div', { className: 'dpc-err' }, err) : h('div', { className: 'dpc-sub' }, '正在加载插件状态…'))
      }

      const diag = ov.diag || {}
      const storage = diag.storage || { totalBytes: 0, quotaBytes: 512 * 1024 * 1024 }
      const pct = Math.min(100, Math.round((storage.totalBytes / Math.max(1, storage.quotaBytes)) * 100))

      // ---- Tab 1: Overview & Connection ----
      const renderOverview = () =>
        h(React.Fragment, null,
          h('div', { className: 'dpc-card' },
            h('div', { className: 'dpc-ct' },
              '手机连接与二维码',
              h('span', { className: 'dpc-badge ok' }, '● 服务运行中')),
            h('div', { className: 'dpc-qr-box' },
              ov.qrSvg ? h('div', { className: 'dpc-qr', dangerouslySetInnerHTML: { __html: ov.qrSvg } }) : null,
              h('div', { style: { flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '8px' } },
                h('div', { className: 'dpc-hint' }, '使用手机扫码或打开下方链接即可建立授权 Cookie（30 天）：'),
                h('div', { className: 'dpc-code' }, ov.connectUrl),
                h('div', { className: 'dpc-btns' },
                  h('button', { className: 'dpc-btn', onClick: () => copyText(ov.connectUrl, '连接链接') }, '复制连接链接'),
                  h('button', {
                    className: 'dpc-btn dpc-btn2',
                    disabled: !!busy,
                    onClick: async () => {
                      if (!confirm('轮换 Key 后旧手机链接将全部失效，确认继续？')) return
                      setBusy('rot')
                      try {
                        await api('/key/rotate', { method: 'POST' })
                        setMsg('Key 已轮换，请重新扫码连接。')
                        await loadAll()
                      } catch (e) {
                        setErr(String(e?.message || e))
                      } finally {
                        setBusy('')
                      }
                    },
                  }, '轮换 Key')))),
            h('div', { className: 'dpc-row' },
              h('div', null,
                h('div', { className: 'dpc-lbl' }, '公网 / 隧道基础地址（可选）'),
                h('div', { className: 'dpc-hint' }, '填写如 Tailscale Serve / FRP / Cloudflare Tunnel 的 https:// 域名，留空则使用本机地址生成二维码。')),
              h('input', {
                className: 'dpc-in wide',
                placeholder: 'https://your-host.example.com',
                value: cfg.publicUrl || '',
                onChange: (e) => patchCfg((c) => { c.publicUrl = e.target.value }),
              }))),

          h('div', { className: 'dpc-card' },
            h('div', { className: 'dpc-ct' }, '会话助手实时状态'),
            ...(ov.peers || []).map((p) =>
              h('div', { key: p.id, className: 'dpc-peer' },
                h('img', { className: 'dpc-av', src: `${ADMIN}/avatar?who=${p.id}&t=${avTick}`, alt: p.name }),
                h('div', { style: { flex: 1, minWidth: '180px' } },
                  h('div', { className: 'dpc-lbl' },
                    h('strong', null, p.name),
                    h('span', { className: 'dpc-badge', style: badgeStyle(p.tagColor) }, p.tag),
                    h('span', { className: `dpc-badge ${p.enabled ? 'ok' : ''}` }, p.enabled ? (p.busy ? '处理中' : '就绪') : '未启用')),
                  h('div', { className: 'dpc-hint' },
                    `消息缓存：${p.count} 条` + (p.model?.model ? ` · 模型：${p.model.model}` : ''))),
                p.enabled && p.id !== 'fish'
                  ? h('button', {
                      className: 'dpc-btn dpc-btn2',
                      disabled: !!busy,
                      onClick: async () => {
                        setBusy(`new-${p.id}`)
                        try {
                          await api('/new', {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ who: p.id }),
                          })
                          setMsg(`已为 ${p.name} 开启新会话。`)
                          await loadAll()
                        } catch (e) {
                          setErr(String(e?.message || e))
                        } finally {
                          setBusy('')
                        }
                      },
                    }, '新建会话')
                  : null))))

      // ---- Tab 2: Assistant Avatars & Badges ----
      const renderPeerCard = (who, title, desc, fileRef, allowModelSwitch) => {
        const peerCfg = cfg.peers?.[who] || { name: '', tag: '', tagColor: '' }
        const groups = allowModelSwitch ? (modelsMap[who] || []) : []
        const flatModels = []
        for (const g of groups) {
          const prov = g.id || g.provider || ''
          for (const m of g.models || []) {
            const id = typeof m === 'string' ? m : (m.id || m.model || '')
            if (!id) continue
            const label = typeof m === 'string' ? m : (m.label || m.name || id)
            flatModels.push({ provider: prov, id, label })
          }
        }
        return h('div', { key: who, className: 'dpc-card' },
          h('div', { className: 'dpc-ct' },
            title,
            h('span', { className: 'dpc-badge', style: badgeStyle(peerCfg.tagColor) }, peerCfg.tag || who)),
          h('div', { className: 'dpc-hint' }, desc),
          h('div', { className: 'dpc-row' },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
              h('img', { className: 'dpc-av', src: `${ADMIN}/avatar?who=${who}&t=${avTick}`, alt: peerCfg.name }),
              h('div', null,
                h('div', { className: 'dpc-lbl' }, '助手头像（默认纯黑）'),
                h('div', { className: 'dpc-hint' }, '支持 PNG / JPEG / WEBP，上限 2 MB。'))),
            h('div', { className: 'dpc-btns' },
              h('input', {
                ref: fileRef,
                type: 'file',
                accept: 'image/png,image/jpeg,image/webp',
                style: { display: 'none' },
                onChange: (e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  uploadAvatar(who, f)
                },
              }),
              h('button', { className: 'dpc-btn dpc-btn2', disabled: !!busy, onClick: () => fileRef.current?.click() }, '上传自定义头像'),
              h('button', { className: 'dpc-btn dpc-btn2', disabled: !!busy, onClick: () => resetAvatar(who) }, '恢复纯黑默认'))),
          h('div', { className: 'dpc-row' },
            h('div', null, h('div', { className: 'dpc-lbl' }, '显示名称'), h('div', { className: 'dpc-hint' }, '手机端与面板展示的名称（最多 16 字）。')),
            h('input', {
              className: 'dpc-in',
              maxLength: 16,
              value: peerCfg.name || '',
              onChange: (e) => patchCfg((c) => { c.peers[who].name = e.target.value }),
            })),
          h('div', { className: 'dpc-row' },
            h('div', null, h('div', { className: 'dpc-lbl' }, '回复中提示文案'), h('div', { className: 'dpc-hint' }, 'Agent 回复消息时，手机主页面与会话页名字下方显示的提示（默认：正在思考，也可在手机头像资料卡修改）。')),
            h('input', {
              className: 'dpc-in',
              maxLength: 24,
              placeholder: '正在思考',
              value: peerCfg.thinkingText ?? '正在思考',
              onChange: (e) => patchCfg((c) => { c.peers[who].thinkingText = e.target.value }),
            })),
          h('div', { className: 'dpc-row' },
            h('div', null, h('div', { className: 'dpc-lbl' }, '徽章标签'), h('div', { className: 'dpc-hint' }, '列表行名称右侧的短标签。')),
            h('input', {
              className: 'dpc-in',
              maxLength: 12,
              value: peerCfg.tag || '',
              onChange: (e) => patchCfg((c) => { c.peers[who].tag = e.target.value }),
            })),
          h('div', { className: 'dpc-row' },
            h('div', null, h('div', { className: 'dpc-lbl' }, '徽章基色'), h('div', { className: 'dpc-hint' }, '选择预设基色或自定义色盘，手机端与面板同步生效。')),
            h('div', { className: 'dpc-swatches' },
              ...BASE_COLORS.map((col) =>
                h('button', {
                  key: col,
                  type: 'button',
                  className: `dpc-sw${peerCfg.tagColor === col ? ' on' : ''}`,
                  style: { background: col },
                  title: col,
                  onClick: () => patchCfg((c) => { c.peers[who].tagColor = col }),
                })),
              h('input', {
                type: 'color',
                className: 'dpc-cpick',
                value: peerCfg.tagColor || '#6b7280',
                onChange: (e) => patchCfg((c) => { c.peers[who].tagColor = e.target.value }),
              }),
              h('button', {
                type: 'button',
                className: 'dpc-btn dpc-btn2',
                style: { height: '24px', padding: '0 8px', fontSize: '11.5px' },
                onClick: () => patchCfg((c) => { c.peers[who].tagColor = '' }),
              }, '默认'))),
          allowModelSwitch && flatModels.length > 0
            ? h('div', { className: 'dpc-row' },
                h('div', null, h('div', { className: 'dpc-lbl' }, 'DSH 原生模型切换（即时生效）')),
                h('select', {
                  className: 'dpc-sel',
                  defaultValue: '',
                  onChange: async (e) => {
                    const val = e.target.value
                    if (!val) return
                    const [provider, ...rest] = val.split('::')
                    const model = rest.join('::')
                    setBusy(`mod-${who}`)
                    try {
                      await api('/model', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ who, provider, model }),
                      })
                      setMsg(`已将 ${peerCfg.name || who} 模型切换为 ${model}。`)
                      await loadAll()
                    } catch (ex) {
                      setErr(String(ex?.message || ex))
                    } finally {
                      setBusy('')
                    }
                  },
                },
                  h('option', { value: '' }, '选择模型以立即切换…'),
                  flatModels.map((m) => h('option', { key: `${m.provider}::${m.id}`, value: `${m.provider}::${m.id}` }, m.provider ? `${m.provider} / ${m.label}` : m.label))))
            : !allowModelSwitch
              ? h('div', { className: 'dpc-hint' }, '模型说明：外部 Agent / Harness 的模型使用与切换，请直接前往对应提供方进行更改。')
              : null)
      }

      const renderPeers = () => {
        const fc = cfg.fish || {}
        return h(React.Fragment, null,
          renderPeerCard('primary', '主会话助手 (Primary)', '直连当前 DSH 宿主 sessionController，开箱即用。', filePrimaryRef, true),
          h('div', { className: 'dpc-card' },
            h('div', { className: 'dpc-ct' }, '主会话运行参数'),
            h('div', { className: 'dpc-row' },
              h('div', null, h('div', { className: 'dpc-lbl' }, '工作目录 (leadCwd)'), h('div', { className: 'dpc-hint' }, '新建主会话时使用的工作区路径。')),
              h('input', { className: 'dpc-in wide', value: cfg.leadCwd || '', onChange: (e) => patchCfg((c) => { c.leadCwd = e.target.value }) })),
            h('div', { className: 'dpc-row' },
              h('div', null, h('div', { className: 'dpc-lbl' }, 'Agent 预设 (leadPreset)'), h('div', { className: 'dpc-hint' }, '透传给 sessionController.create 的 agentPreset（如 standard）。')),
              h('input', { className: 'dpc-in', value: cfg.leadPreset || '', onChange: (e) => patchCfg((c) => { c.leadPreset = e.target.value }) }))),

          renderPeerCard('fish', 'dsh-fish 伙伴插件（可选）', '对接开源插件 github.com/mochi-fish/dsh-fish；未安装时可保持关闭。', fileFishRef, true),
          h('div', { className: 'dpc-card' },
            h('div', { className: 'dpc-ct' }, 'dsh-fish 插件集成配置'),
            h('div', { className: 'dpc-row' },
              h('div', null, h('div', { className: 'dpc-lbl' }, '启用 dsh-fish 通道'), h('div', { className: 'dpc-hint' }, '开启后在手机列表显示 dsh-fish 助手并走其 sayToHer 接口收发消息。')),
              h('input', { type: 'checkbox', checked: !!fc.enabled, onChange: (e) => patchCfg((c) => { c.fish.enabled = e.target.checked }) })),
            h('div', { className: 'dpc-row' },
              h('div', null, h('div', { className: 'dpc-lbl' }, 'dsh-fish 数据根目录 (fish.root)')),
              h('input', { className: 'dpc-in wide', value: fc.root || '', onChange: (e) => patchCfg((c) => { c.fish.root = e.target.value }) })),
            h('div', { className: 'dpc-row' },
              h('div', null, h('div', { className: 'dpc-lbl' }, '回复等待上限 (waitMs)'), h('div', { className: 'dpc-hint' }, '默认 90000 ms，超时后插件自动兜底释放忙碌态。')),
              h('input', { className: 'dpc-in', type: 'number', value: fc.waitMs ?? 90000, onChange: (e) => patchCfg((c) => { c.fish.waitMs = Number(e.target.value) || 90000 }) }))),

          renderPeerCard('harness', '外部 Agent / Harness 助手', '通过「Agent / Harness 接入」分页连接任意 CLI 或文件队列守护进程。', fileHarnessRef, false))
      }

      // ---- Tab 3: Agent / Harness Adapter ----
      const renderHarness = () => {
        const hc = cfg.harness || {}
        return h(React.Fragment, null,
          h('div', { className: 'dpc-card' },
            h('div', { className: 'dpc-ct' }, 'Agent / Harness 接入配置'),
            h('div', { className: 'dpc-hint' }, '合规说明：本插件仅作为本地消息收发桥接，不提供第三方 Agent / Harness 的模型枚举或切换功能；模型使用与切换请前往对应提供方自行更改。'),
            h('div', { className: 'dpc-row' },
              h('div', null, h('div', { className: 'dpc-lbl' }, '接入模式'), h('div', { className: 'dpc-hint' }, '关闭时隐藏外部 Agent 入口；CLI 模式直连任意命令行工具；队列模式走通用目录文件交换。')),
              h('select', {
                className: 'dpc-sel',
                value: hc.mode || 'disabled',
                onChange: (e) => patchCfg((c) => { c.harness.mode = e.target.value }),
              },
                h('option', { value: 'disabled' }, '关闭 (disabled)'),
                h('option', { value: 'cli' }, 'CLI 直连协议 (cli)'),
                h('option', { value: 'queue' }, '文件队列协议 (queue)'))),
            hc.mode === 'cli'
              ? h(React.Fragment, null,
                  h('div', { className: 'dpc-row' },
                    h('div', null, h('div', { className: 'dpc-lbl' }, '可执行文件路径 (bin)'), h('div', { className: 'dpc-hint' }, '例如 claude、codex、gemini 或自定义脚本解释器路径。')),
                    h('input', { className: 'dpc-in wide', placeholder: 'claude / codex / /path/to/agent-cli', value: hc.bin || '', onChange: (e) => patchCfg((c) => { c.harness.bin = e.target.value }) })),
                  h('div', { className: 'dpc-row' },
                    h('div', null, h('div', { className: 'dpc-lbl' }, '参数模板 (args，每行一个参数)'), h('div', { className: 'dpc-hint' }, '可用占位符：{prompt} {promptFile} {session} {image}。空可选占位符所在参数会自动跳过。')),
                    h('textarea', {
                      className: 'dpc-ta',
                      value: (hc.args || []).join('\n'),
                      onChange: (e) => patchCfg((c) => { c.harness.args = e.target.value.split(/\r?\n/).filter((x) => x.length > 0) }),
                    })),
                  h('div', { className: 'dpc-row' },
                    h('div', null, h('div', { className: 'dpc-lbl' }, '工作目录 (cwd)')),
                    h('input', { className: 'dpc-in wide', placeholder: '留空使用用户主目录', value: hc.cwd || '', onChange: (e) => patchCfg((c) => { c.harness.cwd = e.target.value }) })),
                  h('div', { className: 'dpc-row' },
                    h('div', null, h('div', { className: 'dpc-lbl' }, '输出解析格式'), h('div', { className: 'dpc-hint' }, 'text 直接取 stdout；json 解析最后一行 JSON 并提取回复与会话 ID。')),
                    h('select', {
                      className: 'dpc-sel',
                      value: hc.responseFormat || 'text',
                      onChange: (e) => patchCfg((c) => { c.harness.responseFormat = e.target.value }),
                    },
                      h('option', { value: 'text' }, '纯文本 (text)'),
                      h('option', { value: 'json' }, 'JSON 对象 (json)'))),
                  hc.responseFormat === 'json'
                    ? h('div', { className: 'dpc-row' },
                        h('div', null, h('div', { className: 'dpc-lbl' }, 'JSON 字段映射 (reply / sessionId)')),
                        h('div', { className: 'dpc-btns' },
                          h('input', { className: 'dpc-in', style: { minWidth: '130px' }, placeholder: 'reply', value: hc.jsonReplyField || 'reply', onChange: (e) => patchCfg((c) => { c.harness.jsonReplyField = e.target.value }) }),
                          h('input', { className: 'dpc-in', style: { minWidth: '130px' }, placeholder: 'sessionId', value: hc.jsonSessionField || 'sessionId', onChange: (e) => patchCfg((c) => { c.harness.jsonSessionField = e.target.value }) })))
                    : null,
                  h('div', { className: 'dpc-row' },
                    h('div', null, h('div', { className: 'dpc-lbl' }, '可选代理地址 (proxy)'), h('div', { className: 'dpc-hint' }, '填写后调用前会先 TCP 探活并注入标准大写代理环境变量；留空直连。')),
                    h('div', { className: 'dpc-btns' },
                      h('input', { className: 'dpc-in', placeholder: 'http://127.0.0.1:7890', value: hc.proxy || '', onChange: (e) => patchCfg((c) => { c.harness.proxy = e.target.value }) }),
                      h('button', {
                        className: 'dpc-btn dpc-btn2',
                        disabled: !!busy,
                        onClick: async () => {
                          setBusy('probe')
                          setProbeRes('')
                          try {
                            const r = await api('/harness/probe', { method: 'POST' })
                            setProbeRes(r.ok ? '✓ 代理连通正常' : `✗ ${r.probe?.error || '不可达'}`)
                          } catch (e) {
                            setProbeRes(`✗ ${e?.message || e}`)
                          } finally {
                            setBusy('')
                          }
                        },
                      }, '探活测试'))),
                  probeRes ? h('div', { className: probeRes.startsWith('✓') ? 'dpc-ok' : 'dpc-err' }, probeRes) : null)
              : null,
            h('details', { className: 'dpc-det' },
              h('summary', null, '接入指南：如何连接 Claude Code / Codex / Gemini CLI 或自定义脚本？'),
              h('div', { className: 'dpc-code' }, [
                '【方式 A：CLI 直连协议】',
                '1. 任意命令行工具，只要能接收提示词并把回答打印到 stdout 即可。',
                '2. 模型使用与切换请直接在对应提供方 / CLI 官方配置中设置，本插件不接管第三方模型切换。',
                '3. 示例（通用脚本）：bin = "node", args = ["/path/to/my-agent.mjs", "--file", "{promptFile}", "--session", "{session}"]',
                '',
                '【方式 B：文件队列协议（零语言限制）】',
                '1. 手机发消息 → 写入 <chatCwd>/to-agent/<timestamp>.md（含 from/at/image 头与正文）',
                '2. 你的守护脚本读取后删除该文件，把回复写到 <chatCwd>/to-phone/<timestamp>.md 或 .json（{"reply":"..."}）',
              ].join('\n')))))
      }

      // ---- Tab 4: TTS Interface ----
      const renderTts = () => {
        const tc = cfg.tts || {}
        const ts = diag.tts || {}
        return h(React.Fragment, null,
          h('div', { className: 'dpc-card' },
            h('div', { className: 'dpc-ct' }, '语音合成接口（纯契约，无内置第三方通道）'),
            h('div', { className: 'dpc-row' },
              h('div', null, h('div', { className: 'dpc-lbl' }, '启用语音合成接口'), h('div', { className: 'dpc-hint' }, '关闭时隐藏手机端所有播放按钮，相关路由返回 404。')),
              h('input', { type: 'checkbox', checked: !!tc.enabled, onChange: (e) => patchCfg((c) => { c.tts.enabled = e.target.checked }) })),
            h('div', { className: 'dpc-row' },
              h('div', null, h('div', { className: 'dpc-lbl' }, '接口类型')),
              h('select', { className: 'dpc-sel', value: tc.mode || 'cli', onChange: (e) => patchCfg((c) => { c.tts.mode = e.target.value }) },
                h('option', { value: 'cli' }, 'CLI 命令行接口 (cli)'),
                h('option', { value: 'http' }, 'HTTP Webhook 接口 (http)'))),
            tc.mode === 'http'
              ? h(React.Fragment, null,
                  h('div', { className: 'dpc-row' },
                    h('div', null, h('div', { className: 'dpc-lbl' }, 'HTTP 接口地址 (POST)')),
                    h('input', { className: 'dpc-in wide', placeholder: 'http://127.0.0.1:8080/tts', value: tc.endpoint || '', onChange: (e) => patchCfg((c) => { c.tts.endpoint = e.target.value }) })),
                  h('div', { className: 'dpc-row' },
                    h('div', null, h('div', { className: 'dpc-lbl' }, 'Authorization 请求头（只写不回显）'), h('div', { className: 'dpc-hint' }, tc.hasAuthHeader ? '✓ 已配置认证头（留空保存将保留原值）' : '未配置')),
                    h('input', { className: 'dpc-in wide', type: 'password', placeholder: tc.hasAuthHeader ? '已保存，输入新值以覆盖' : 'Bearer ...', value: tc.authHeader || '', onChange: (e) => patchCfg((c) => { c.tts.authHeader = e.target.value }) })))
              : h(React.Fragment, null,
                  h('div', { className: 'dpc-row' },
                    h('div', null, h('div', { className: 'dpc-lbl' }, '执行命令 (command)'), h('div', { className: 'dpc-hint' }, '指向你自己的本地 TTS 程序或脚本解释器。')),
                    h('input', { className: 'dpc-in wide', placeholder: 'python / /path/to/my-tts-cli', value: tc.command || '', onChange: (e) => patchCfg((c) => { c.tts.command = e.target.value }) })),
                  h('div', { className: 'dpc-row' },
                    h('div', null, h('div', { className: 'dpc-lbl' }, '参数模板 (每行一个)'), h('div', { className: 'dpc-hint' }, '占位符：{textFile}（UTF-8 文本临时文件）、{outFile}（目标音频文件）、{voice}。')),
                    h('textarea', {
                      className: 'dpc-ta',
                      value: (tc.args || []).join('\n'),
                      onChange: (e) => patchCfg((c) => { c.tts.args = e.target.value.split(/\r?\n/).filter((x) => x.length > 0) }),
                    }))),
            h('div', { className: 'dpc-row' },
              h('div', null, h('div', { className: 'dpc-lbl' }, '可选 Voice 参数 ({voice})')),
              h('input', { className: 'dpc-in', placeholder: '可选透传给后端的音色名', value: tc.voice || '', onChange: (e) => patchCfg((c) => { c.tts.voice = e.target.value }) })),
            h('div', { className: 'dpc-row' },
              h('div', null, h('div', { className: 'dpc-lbl' }, '合成前剥离 Markdown'), h('div', { className: 'dpc-hint' }, '跳过代码块、链接 URL 与表格分隔线，避免被逐字念出。')),
              h('input', { type: 'checkbox', checked: tc.stripMarkdown !== false, onChange: (e) => patchCfg((c) => { c.tts.stripMarkdown = e.target.checked }) })),
            h('details', { className: 'dpc-det' },
              h('summary', null, 'TTS 接口契约说明（如何接入你自己的语音服务）'),
              h('div', { className: 'dpc-code' }, [
                '• CLI 契约：从 {textFile} 读取 UTF-8 纯文本，写出非空 MP3 音频至 {outFile}，退出码为 0。',
                '• HTTP 契约：接收 POST JSON { "text": "...", "voice": "..." }，直接返回 audio/mpeg 或 audio/wav 二进制流，或返回 JSON { "audioBase64": "...", "contentType": "audio/mpeg" }。',
              ].join('\n')))),

          h('div', { className: 'dpc-card' },
            h('div', { className: 'dpc-ct' }, '试听与缓存管理'),
            h('div', { className: 'dpc-row' },
              h('div', null, h('div', { className: 'dpc-lbl' }, '接口试听（需先启用并保存）')),
              h('div', { className: 'dpc-btns' },
                h('input', { className: 'dpc-in', value: ttsSample, onChange: (e) => setTtsSample(e.target.value) }),
                h('button', {
                  className: 'dpc-btn dpc-btn2',
                  disabled: !!busy || !tc.enabled,
                  onClick: async () => {
                    setBusy('tts-test')
                    setErr('')
                    try {
                      const r = await api('/tts/test', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ text: ttsSample }),
                      })
                      setTtsAudioUrl(`${r.audioUrl}&t=${Date.now()}`)
                      setMsg(`合成成功（${fmtBytes(r.bytes)}，${r.cached ? '命中缓存' : `${r.tookMs} ms`}）。`)
                      await loadAll()
                    } catch (e) {
                      setErr(String(e?.message || e))
                    } finally {
                      setBusy('')
                    }
                  },
                }, '测试合成'))),
            ttsAudioUrl ? h('audio', { controls: true, autoPlay: true, src: ttsAudioUrl, style: { width: '100%' } }) : null,
            h('div', { className: 'dpc-row' },
              h('div', null,
                h('div', { className: 'dpc-lbl' }, `音频缓存：${ts.cacheCount || 0} 条 · ${fmtBytes(ts.cacheBytes || 0)}`),
                h('div', { className: 'dpc-hint' }, `目录：${ts.cacheDir || '—'}（不自动淘汰，可在此手动清理）`)),
              h('button', {
                className: 'dpc-btn dpc-btn-danger',
                disabled: !!busy,
                onClick: async () => {
                  setBusy('tts-clear')
                  try {
                    const r = await api('/tts/clear', { method: 'POST' })
                    setMsg(`已清理 ${r.removed} 个音频缓存文件。`)
                    await loadAll()
                  } catch (e) {
                    setErr(String(e?.message || e))
                  } finally {
                    setBusy('')
                  }
                },
              }, '清空音频缓存'))))
      }

      // ---- Tab 5: Remote Control Interface ----
      const renderRc = () => {
        const rc = cfg.remoteControl || { enabled: false, mode: 'actions', actions: [] }
        const actions = Array.isArray(rc.actions) ? rc.actions : []
        return h(React.Fragment, null,
          h('div', { className: 'dpc-card' },
            h('div', { className: 'dpc-ct' },
              '远程控制连接接口',
              h('span', { className: `dpc-badge ${rc.enabled ? 'warn' : ''}` }, rc.enabled ? '已启用（请注意安全）' : '默认关闭')),
            h('div', { className: 'dpc-row' },
              h('div', null,
                h('div', { className: 'dpc-lbl' }, '启用手机端远程控制接口'),
                h('div', { className: 'dpc-hint' }, '开启后，手机端「连接/远控」页将展示已注册动作或连接至你的本地远控服务。插件绝不暴露任意 Shell 执行口。')),
              h('input', { type: 'checkbox', checked: !!rc.enabled, onChange: (e) => patchCfg((c) => { c.remoteControl.enabled = e.target.checked }) })),
            h('div', { className: 'dpc-row' },
              h('div', null, h('div', { className: 'dpc-lbl' }, '对接模式')),
              h('select', { className: 'dpc-sel', value: rc.mode || 'actions', onChange: (e) => patchCfg((c) => { c.remoteControl.mode = e.target.value }) },
                h('option', { value: 'actions' }, '动作白名单模式 (actions)'),
                h('option', { value: 'webhook' }, 'HTTP Webhook 桥接模式 (webhook)'))),
            rc.mode === 'webhook'
              ? h(React.Fragment, null,
                  h('div', { className: 'dpc-row' },
                    h('div', null, h('div', { className: 'dpc-lbl' }, '本地远控 Webhook 地址 (POST)')),
                    h('input', { className: 'dpc-in wide', placeholder: 'http://127.0.0.1:9000/rc/trigger', value: rc.webhookUrl || '', onChange: (e) => patchCfg((c) => { c.remoteControl.webhookUrl = e.target.value }) })),
                  h('div', { className: 'dpc-row' },
                    h('div', null, h('div', { className: 'dpc-lbl' }, 'HMAC-SHA256 签名密钥（可选，只写不回显）'), h('div', { className: 'dpc-hint' }, rc.hasWebhookSecret ? '✓ 已配置签名密钥（请求头 X-DSH-Signature）' : '留空则不签名')),
                    h('input', { className: 'dpc-in wide', type: 'password', placeholder: rc.hasWebhookSecret ? '已保存，输入新值以覆盖' : '可选签名密钥', value: rc.webhookSecret || '', onChange: (e) => patchCfg((c) => { c.remoteControl.webhookSecret = e.target.value }) })))
              : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                  h('div', { className: 'dpc-ct' },
                    `已注册动作白名单（${actions.length} 项）`,
                    h('button', {
                      className: 'dpc-btn dpc-btn2',
                      onClick: () => patchCfg((c) => {
                        c.remoteControl.actions.push({
                          id: `action_${Date.now().toString(36).slice(-4)}`,
                          label: '自定义动作',
                          description: '',
                          command: '',
                          args: [],
                          confirm: true,
                        })
                      }),
                    }, '+ 添加动作')),
                  ...actions.map((act, idx) =>
                    h('div', { key: idx, className: 'dpc-act-item' },
                      h('div', { className: 'dpc-btns' },
                        h('input', { className: 'dpc-in', style: { minWidth: '120px' }, placeholder: '动作 ID', value: act.id || '', onChange: (e) => patchCfg((c) => { c.remoteControl.actions[idx].id = e.target.value }) }),
                        h('input', { className: 'dpc-in', style: { minWidth: '140px' }, placeholder: '按钮标题', value: act.label || '', onChange: (e) => patchCfg((c) => { c.remoteControl.actions[idx].label = e.target.value }) }),
                        h('label', { style: { fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' } },
                          h('input', { type: 'checkbox', checked: act.confirm !== false, onChange: (e) => patchCfg((c) => { c.remoteControl.actions[idx].confirm = e.target.checked }) }),
                          '手机端二次确认'),
                        h('button', {
                          className: 'dpc-btn dpc-btn-danger',
                          onClick: () => patchCfg((c) => { c.remoteControl.actions.splice(idx, 1) }),
                        }, '删除')),
                      h('div', { className: 'dpc-btns' },
                        h('input', { className: 'dpc-in', style: { flex: 1 }, placeholder: '可执行命令（如 powershell / python / /usr/bin/osascript）', value: act.command || '', onChange: (e) => patchCfg((c) => { c.remoteControl.actions[idx].command = e.target.value }) }),
                        h('input', { className: 'dpc-in', style: { flex: 1 }, placeholder: '参数（空格分隔）', value: Array.isArray(act.args) ? act.args.join(' ') : '', onChange: (e) => patchCfg((c) => { c.remoteControl.actions[idx].args = e.target.value.trim() ? e.target.value.trim().split(/\s+/) : [] }) }))))),
            h('details', { className: 'dpc-det' },
              h('summary', null, '远程控制接口契约（如何从手机控制你的 PC 主机）'),
              h('div', { className: 'dpc-code' }, [
                '• 手机端调用：POST /phone-chat/api/rc/trigger  Body: { "actionId": "<id>", "payload": {} }',
                '• 白名单模式：仅允许执行上方注册的 actionId，输出前 1000 字符回传手机。',
                '• Webhook 模式：转发 POST { actionId, payload, timestamp } 至你的本地控制守护进程，并附带 X-DSH-Signature (HMAC-SHA256)。',
              ].join('\n')))),

          h('div', { className: 'dpc-card' },
            h('div', { className: 'dpc-ct' }, '最近执行审计日志'),
            audit.length === 0
              ? h('div', { className: 'dpc-hint' }, '暂无远程控制执行记录。')
              : h('div', { className: 'dpc-code' }, audit.slice(0, 10).map((a) => `[${a.at}] ${a.actionId} (${a.mode}) -> ${a.ok ? 'OK' : 'ERR'} (${a.tookMs}ms) ${a.output || a.error || ''}`).join('\n'))))
      }

      // ---- Tab 6: Storage & Diagnostics ----
      const renderStorage = () =>
        h(React.Fragment, null,
          h('div', { className: 'dpc-card' },
            h('div', { className: 'dpc-ct' }, '上传配额与目录配置'),
            h('div', null,
              h('div', { className: 'dpc-lbl' }, `已用空间：${fmtBytes(storage.totalBytes)} / ${fmtBytes(storage.quotaBytes)}（${pct}%）`),
              h('div', { className: 'dpc-bar' }, h('i', { style: { width: `${pct}%` } }))),
            h('div', { className: 'dpc-row' },
              h('div', null, h('div', { className: 'dpc-lbl' }, '聊天与队列目录 (chatCwd)')),
              h('input', { className: 'dpc-in wide', value: cfg.chatCwd || '', onChange: (e) => patchCfg((c) => { c.chatCwd = e.target.value }) })),
            h('div', { className: 'dpc-row' },
              h('div', null, h('div', { className: 'dpc-lbl' }, '图片落盘目录 (uploadCwd)')),
              h('input', { className: 'dpc-in wide', value: cfg.uploadCwd || '', onChange: (e) => patchCfg((c) => { c.uploadCwd = e.target.value }) })),
            h('div', { className: 'dpc-row' },
              h('div', null, h('div', { className: 'dpc-lbl' }, '文件落盘目录 (filesCwd)')),
              h('input', { className: 'dpc-in wide', value: cfg.filesCwd || '', onChange: (e) => patchCfg((c) => { c.filesCwd = e.target.value }) })),
            h('div', { className: 'dpc-row' },
              h('div', null, h('div', { className: 'dpc-lbl' }, '保留上传图片超过 24 小时 (keepUploads)')),
              h('input', { type: 'checkbox', checked: !!cfg.keepUploads, onChange: (e) => patchCfg((c) => { c.keepUploads = e.target.checked }) })),
            h('div', { className: 'dpc-row' },
              h('div', null, h('div', { className: 'dpc-lbl' }, '保留队列聊天归档 (keepChat)')),
              h('input', { type: 'checkbox', checked: !!cfg.keepChat, onChange: (e) => patchCfg((c) => { c.keepChat = e.target.checked }) })),
            h('div', { className: 'dpc-row' },
              h('div', null, h('div', { className: 'dpc-lbl' }, '仅接受本机回环流量 (hostOnly)'), h('div', { className: 'dpc-hint' }, '强烈建议保持开启；通过本地隧道转发时来源仍为 127.0.0.1。')),
              h('input', { type: 'checkbox', checked: cfg.hostOnly !== false, onChange: (e) => patchCfg((c) => { c.hostOnly = e.target.checked }) }))),

          h('div', { className: 'dpc-card' },
            h('div', { className: 'dpc-ct' },
              '运行诊断与维护',
              h('div', { className: 'dpc-btns' },
                h('button', { className: 'dpc-btn dpc-btn2', onClick: loadAll }, '刷新诊断'),
                h('button', {
                  className: 'dpc-btn dpc-btn2',
                  disabled: !!busy,
                  onClick: async () => {
                    setBusy('tmp')
                    try {
                      const r = await api('/cleanup/tmp', { method: 'POST' })
                      setMsg(`已清理 ${r.removed} 个临时项。`)
                    } catch (e) {
                      setErr(String(e?.message || e))
                    } finally {
                      setBusy('')
                    }
                  },
                }, '清理 .tmp 暂存'))),
            h('div', { className: 'dpc-hint' }, `本地配置文件路径：${ov.configPath}`),
            h('details', { className: 'dpc-det' },
              h('summary', null, '查看完整诊断 JSON 快照'),
              h('div', { className: 'dpc-code' }, JSON.stringify(diag, null, 2)))))

      return h('div', { className: 'dpc' },
        h('div', { className: 'dpc-hd' },
          h('h3', { className: 'dpc-title' }, '远程聊天'),
          h('p', { className: 'dpc-sub' }, '配置手机端远程对话、dsh-fish 伙伴插件、外部 Agent/Harness 接入、纯接口化语音合成与主机远程控制。所有个人配置均存于本机 ~/.dsh/phone-chat/config.json。')),

        h('div', { className: 'dpc-tabs' },
          TABS.map(([id, label]) =>
            h('button', {
              key: id,
              type: 'button',
              className: `dpc-tab${tab === id ? ' on' : ''}`,
              onClick: () => setTab(id),
            }, label))),

        tab === 'overview' ? renderOverview() : null,
        tab === 'peers' ? renderPeers() : null,
        tab === 'harness' ? renderHarness() : null,
        tab === 'tts' ? renderTts() : null,
        tab === 'rc' ? renderRc() : null,
        tab === 'storage' ? renderStorage() : null,

        h('div', { className: 'dpc-foot' },
          h('button', { className: 'dpc-btn', disabled: !!busy || !dirty, onClick: saveConfig }, busy === 'save' ? '保存中…' : '保存配置'),
          h('button', { className: 'dpc-btn dpc-btn2', disabled: !!busy, onClick: loadAll }, '重新读取'),
          dirty ? h('span', { className: 'dpc-badge warn' }, '● 有未保存修改') : null,
          msg ? h('span', { className: 'dpc-ok' }, msg) : null,
          err ? h('span', { className: 'dpc-err' }, err) : null))
    }

    const inject = ['slots']

    function apply(ctx) {
      ctx.effect(
        () =>
          ctx.slots.inject(
            'settings.section',
            () =>
              ctx.slots.register(
                { name: 'settings.section', id: 'phone-chat', order: 5, label: () => '远程聊天' },
                PhoneChatSection,
              ),
            'dsh-phone-chat: settings section',
          ),
        'dsh-phone-chat: settings section',
      )
    }

    exports.apply = apply
    exports.inject = inject
    exports.PhoneChatSection = PhoneChatSection
    return module.exports
  },
})
