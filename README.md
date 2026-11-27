# dsh-phone-chat

[![CI](https://github.com/Hyrrokin141/Dsh-phone-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/Hyrrokin141/Dsh-phone-chat/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

简体中文 | [English](./README.en.md)

面向 DeepSeek Harness (DSH) 的轻量级、自托管**手机端远程聊天与宿主机控制插件**，内置零构建的 **DSH 设置面板**（`远程聊天`）。

## 界面预览

### DSH 桌面端设置面板

<p align="center">
  <img src="./docs/images/dsh-settings-panel.png" alt="DSH 远程聊天设置面板" width="560" />
</p>

### 手机端界面（对话列表 / 资料修改与模型切换）

<table>
  <tr>
    <td align="center">
      <img src="./docs/images/mobile-chat-ui.jpg" alt="手机端聊天主界面" width="320" /><br />
      <sub>手机端聊天列表、在线状态与底部功能栏</sub>
    </td>
    <td align="center">
      <img src="./docs/images/mobile-profile-model.jpg" alt="信息修改和模型切换" width="320" /><br />
      <sub>自定义昵称、思考中文案与实时切换模型</sub>
    </td>
  </tr>
</table>

> 注：仓库默认不附带任何个人头像素材（出厂默认纯黑头像 `#000000`），以上截图中展示的头像与昵称为用户本机自定义效果。

## 核心特性

- **零构建 DSH 设置面板**：直接注册到 DSH 设置页（`settings.section`），包含 6 个标签页：
  1. **概览与连接** — 访问密钥链接、二维码配对、公网隧道基址与会话助手实时状态。
  2. **助手头像** — 自定义各通道显示名称、徽章底色、思考中提示文案与自定义头像。
  3. **Agent / Harness 接入** — 桥接外部 CLI Agent 或文件队列守护进程。
  4. **语音合成接口（TTS）** — 按标准契约接入自备 CLI 或 HTTP 语音合成后端。
  5. **远程控制接口** — 按需开启的白名单动作或带签名本地 HTTP Webhook。
  6. **存储与诊断** — 数据目录、保留策略、上传容量上限与运行状态诊断。
- **代码与个人数据彻底隔离**：所有个人配置、自定义头像、密钥与日志均存放在 `~/.dsh/phone-chat/`（仓库外部），安全开发并开源发布，避免泄露隐私。
- **纯黑默认头像与自定义徽章色**：仓库不包含任何个人素材；所有对话角色默认使用极简纯黑头像（`#000000`），并支持自定义十六进制徽章底色。
- **可选 `dsh-fish` 联动**：官方支持与开源插件 [dsh-fish](https://github.com/mochi-fish/dsh-fish) 联动（默认关闭；开启并安装后自动连接）。
- **可插拔 Agent / Harness 通道**：支持以纯消息桥接方式接入任意外部 CLI Agent 或文件队列守护进程。本插件不接管外部 Harness 的模型路由与切换，请在对应工具侧自行配置模型。
- **纯 TTS 契约接口**：不捆绑任何第三方或非官方 TTS 服务，可自由接入本地 CLI（`--text-file {textFile} --out {outFile}`）或 HTTP TTS 接口。
- **按需开启的远程控制**：默认关闭。仅向手机端「远程控制」标签页暴露明确白名单化的宿主机动作，或带签名的本地 HTTP Webhook，绝不暴露任意 Shell 执行端点。

## 运行环境要求

- **Node.js**：`>= 20`（已在 Node.js 22 上验证）
- **DSH**：`>= 0.2.0-rc.1 < 0.3.0-0`（支持 `desktop`、`web`、`headless` 模式）

## 快速开始

1. **获取插件**
   将本仓库克隆或软链接到你的 DSH 桌面端 Profile 插件目录：
   ```bash
   git clone https://github.com/Hyrrokin141/Dsh-phone-chat.git
   ```
2. **在 `cordis.patch.yml` 中启用**
   参考 [`cordis.patch.example.yml`](./cordis.patch.example.yml)，将以下片段加入你的 DSH Profile 的 `cordis.patch.yml`：
   ```yaml
   - insert:
       - id: phone-chat
         name: dsh-phone-chat
         config:
           hostOnly: true
   ```
3. **打开设置面板**
   重启 DSH，进入 **设置 → `远程聊天`**。
4. **手机扫码连接**
   在 **概览与连接** 标签页用手机扫描二维码（或复制 `?k=<key>` 链接在手机浏览器打开）。
5. **公网远程访问（可选）**
   使用私有隧道（如 Tailscale Serve、FRP 或 Cloudflare Tunnel）转发 DSH 本地 HTTP 端口，并将隧道地址填入面板的 **公网 / 隧道基础地址**。

## 配置与数据存储

运行时配置按以下优先级合并：

```text
内置默认值  ←  cordis.patch.yml 配置  ←  ~/.dsh/phone-chat/config.json
```

- 敏感字段（`tts.authHeader`、`remoteControl.webhookSecret`）为**只写不回显**，不会暴露给前端页面。
- 默认数据目录位于 `~/.dsh/phone-chat/data/`：
  - `workspace/` — 主 DSH 会话工作目录
  - `chat/` — 文件队列桥接目录
  - `photos/` — 手机上传图片目录（受 `uploadTotalMax` 上限保护，默认 512 MiB）
  - `files/` — 共享文件目录
  - `history/` — 聊天历史记录目录

## 目录结构

```text
.
├── cordis.patch.example.yml   # DSH Bundle 配置示例
├── docs/images/               # 文档展示截图
├── lib/
│   ├── index.js               # DSH 插件主入口与 HTTP 路由
│   ├── client.js              # DSH 设置面板前端（零构建）
│   ├── page.html              # 手机端聊天与远程控制页面
│   ├── config.mjs             # 统一配置存储与敏感字段脱敏
│   ├── harness.mjs            # 外部 CLI / 队列 Agent 适配器
│   ├── tts.mjs                # 纯 CLI / HTTP TTS 契约实现
│   ├── remote-control.mjs     # 白名单动作与签名 Webhook 执行器
│   └── qr.mjs                 # 零依赖二维码生成器
├── tests/
│   └── test-open-plugin.mjs   # 插件与契约自动化测试
└── tools/
    └── check-privacy.mjs      # 发布前隐私与 BOM 卫生扫描器
```

## 测试与隐私检查

提交或发布前请运行以下两项校验：

```bash
npm test
npm run check:privacy
```

## 致谢

- [mochi-fish/dsh-fish](https://github.com/mochi-fish/dsh-fish)（作者：[@mochi-fish](https://github.com/mochi-fish)）— `dsh-phone-chat` 支持可选联动的开源伙伴插件。
- **DeepSeek Harness (DSH)** — 插件运行平台。

## 开源协议

[MIT](./LICENSE) © 2026 Hyrrokin
