# dsh-phone-chat

A lightweight, self-hosted **mobile remote chat & host control plugin** for DeepSeek Harness (DSH), complete with an integrated **DSH Settings Panel** (`远程聊天`).

## Highlights

- **Zero-build DSH Settings Panel**: Registers directly into DSH Settings (`settings.section`) with 6 tabs: Overview & QR Connect, Assistant Avatars (`助手头像`), Agent / Harness Adapter, TTS Contract, Remote Control Interface, and Storage & Diagnostics.
- **Code vs. Personal Data Separation**: All personal settings, custom avatars, keys, and logs live in `~/.dsh/phone-chat/` (outside the repository), so you can develop and publish safely on GitHub without leaking private data.
- **Pure-Black Default Avatars & Customizable Badge Colors**: Ships with zero bundled personal artwork; every peer defaults to a minimal solid-black avatar (`#000000`) and supports customizable badge base colors.
- **Optional `dsh-fish` Integration**: Officially supports optional integration with the open-source [dsh-fish](https://github.com/mochi-fish/dsh-fish) plugin (disabled by default; auto-connects when enabled and installed).
- **Pluggable Agent / Harness Channel**: Connect any external CLI agent or file queue daemon for pure message bridging. Model usage and switching on external harnesses are intentionally NOT managed by this plugin — please configure models directly with your respective provider.
- **Pure TTS Contract**: Ships with zero bundled or unofficial TTS providers. Bring your own CLI or HTTP TTS backend.
- **Opt-In Remote Control Interface**: Disabled by default. Exposes whitelisted host actions or signed local HTTP webhooks to the mobile Remote Control tab — never an arbitrary shell endpoint.

## Quick Start

1. Link or install this directory into your DSH desktop profile and add the snippet from `cordis.patch.example.yml` to your `cordis.patch.yml`.
2. Restart DSH and open **Settings → `远程聊天`**.
3. On the **Overview & Connect** tab, scan the QR code (or copy the `?k=<key>` URL) on your phone.
4. For remote access over the internet, point a private tunnel (such as Tailscale Serve, FRP, or Cloudflare Tunnel) to DSH's local port and set your tunnel base URL in **Public / Tunnel Base URL**.

## Verification & Privacy Check

```bash
npm test
npm run check:privacy
```
