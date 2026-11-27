# dsh-phone-chat

[![CI](https://github.com/Hyrrokin141/Dsh-phone-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/Hyrrokin141/Dsh-phone-chat/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

English | [简体中文](./README.zh-CN.md)

A lightweight, self-hosted **mobile remote chat & host control plugin** for DeepSeek Harness (DSH), complete with an integrated **DSH Settings Panel** (`远程聊天`).

## Highlights

- **Zero-build DSH Settings Panel**: Registers directly into DSH Settings (`settings.section`) with 6 tabs:
  1. **Overview & QR Connect** — Access key URL, QR code pairing, and tunnel base URL configuration.
  2. **Assistant Avatars (`助手头像`)** — Per-peer display names, badge colors, thinking status text, and custom avatars.
  3. **Agent / Harness Adapter** — Bridge external CLI agents or file-queue daemons.
  4. **TTS Contract** — Plug in your own CLI or HTTP text-to-speech backend.
  5. **Remote Control Interface** — Opt-in whitelisted host actions or signed local HTTP webhooks.
  6. **Storage & Diagnostics** — Data directories, retention policy, upload quota, and runtime diagnostics.
- **Code vs. Personal Data Separation**: All personal settings, custom avatars, keys, and logs live in `~/.dsh/phone-chat/` (outside the repository), so you can develop and publish safely on GitHub without leaking private data.
- **Pure-Black Default Avatars & Customizable Badge Colors**: Ships with zero bundled personal artwork; every peer defaults to a minimal solid-black avatar (`#000000`) and supports customizable hex badge colors.
- **Optional `dsh-fish` Integration**: Officially supports optional integration with the open-source [dsh-fish](https://github.com/mochi-fish/dsh-fish) plugin (disabled by default; auto-connects when enabled and installed).
- **Pluggable Agent / Harness Channel**: Connect any external CLI agent or file queue daemon for pure message bridging. Model usage and switching on external harnesses are intentionally NOT managed by this plugin — please configure models directly with your respective provider.
- **Pure TTS Contract**: Ships with zero bundled or unofficial TTS providers. Bring your own CLI (`--text-file {textFile} --out {outFile}`) or HTTP TTS endpoint.
- **Opt-In Remote Control Interface**: Disabled by default. Exposes only explicitly whitelisted host actions or HMAC-signed local HTTP webhooks to the mobile Remote Control tab — never an arbitrary shell endpoint.

## Requirements

- **Node.js**: `>= 20` (tested on Node.js 22)
- **DSH**: `>= 0.2.0-rc.1 < 0.3.0-0` (`desktop`, `web`, or `headless` profile)

## Quick Start

1. **Install / Link the plugin**
   Clone or link this repository into your DSH desktop profile's plugin directory:
   ```bash
   git clone https://github.com/Hyrrokin141/Dsh-phone-chat.git
   ```
2. **Enable in `cordis.patch.yml`**
   Copy the snippet from [`cordis.patch.example.yml`](./cordis.patch.example.yml) into your DSH profile's `cordis.patch.yml`:
   ```yaml
   - insert:
       - id: phone-chat
         name: dsh-phone-chat
         config:
           hostOnly: true
   ```
3. **Open the Settings Panel**
   Restart DSH and navigate to **Settings → `远程聊天`**.
4. **Connect from your phone**
   On the **Overview & Connect** tab, scan the QR code (or open the `?k=<key>` URL) in your mobile browser.
5. **Remote access over the internet (optional)**
   Point a private tunnel (such as Tailscale Serve, FRP, or Cloudflare Tunnel) to DSH's local HTTP port, and set your public tunnel URL in **Public / Tunnel Base URL**.

## Configuration & Storage

Runtime configuration merges in the following order:

```text
Built-in defaults  ←  cordis.patch.yml config  ←  ~/.dsh/phone-chat/config.json
```

- Sensitive fields (`tts.authHeader`, `remoteControl.webhookSecret`) are **write-only** and are never echoed back to the browser UI.
- Default data directories under `~/.dsh/phone-chat/data/`:
  - `workspace/` — Primary DSH session working directory
  - `chat/` — File-queue bridge directory
  - `photos/` — Uploaded mobile images (bounded by `uploadTotalMax`, default 512 MiB)
  - `files/` — Shared files
  - `history/` — Chat history records

## Project Structure

```text
.
├── cordis.patch.example.yml   # Example DSH bundle patch
├── lib/
│   ├── index.js               # Main DSH plugin entry & HTTP routes
│   ├── client.js              # DSH Settings panel UI (zero-build)
│   ├── page.html              # Mobile web chat & remote control UI
│   ├── config.mjs             # Unified config store & secret redaction
│   ├── harness.mjs            # External CLI / queue agent adapter
│   ├── tts.mjs                # Pure CLI / HTTP TTS contract
│   ├── remote-control.mjs     # Opt-in actions & signed webhook runner
│   └── qr.mjs                 # Zero-dependency QR code generator
├── tests/
│   └── test-open-plugin.mjs   # Automated plugin & contract tests
└── tools/
    └── check-privacy.mjs      # Pre-publish privacy & BOM hygiene scanner
```

## Verification & Privacy Check

Before committing or publishing changes, run both checks:

```bash
npm test
npm run check:privacy
```

## Acknowledgements

- [mochi-fish/dsh-fish](https://github.com/mochi-fish/dsh-fish) by [@mochi-fish](https://github.com/mochi-fish) — Optional companion agent plugin supported by `dsh-phone-chat`.
- **DeepSeek Harness (DSH)** — Host plugin platform.

## License

[MIT](./LICENSE) © 2026 Hyrrokin
