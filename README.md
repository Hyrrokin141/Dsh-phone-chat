# dsh-phone-chat

[![CI](https://github.com/Hyrrokin141/Dsh-phone-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/Hyrrokin141/Dsh-phone-chat/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

简体中文 | [English](./README.en.md)

一个给 **DeepSeek Harness (DSH)** 用的轻量手机远程聊天与控制插件。  
**人在外面，掏出手机就能让家里的 Agent 自己帮你干活**——不用装手机 App、不用背电脑，打开手机浏览器扫个码，就能随时给家里的电脑派活、传图片传文件、新开会话解放上下文、自由切换模型，甚至异地远程控制家里的电脑、手机、NAS 等设备。

## 界面预览

### 电脑端：DSH 设置面板（`远程聊天`）

<p align="center">
  <img src="./docs/images/dsh-settings-panel.png" alt="DSH 远程聊天设置面板" width="560" />
</p>

### 手机端：聊天列表 / 改资料与切模型

<table>
  <tr>
    <td align="center">
      <img src="./docs/images/mobile-chat-ui.jpg" alt="手机端聊天主界面" width="320" /><br />
      <sub>打开手机就能看所有助手的在线状态、聊天、传文件</sub>
    </td>
    <td align="center">
      <img src="./docs/images/mobile-profile-model.jpg" alt="信息修改和模型切换" width="320" /><br />
      <sub>在手机上直接改昵称、改“正在思考”提示词、切换模型</sub>
    </td>
  </tr>
</table>

> 说明：本仓库不包含任何个人头像（刚装好时默认是纯黑头像 `#000000`），上面截图里的头像和昵称都是用户在自己电脑上自定义的展示效果。

## 它能做什么？

- **出门在外，手机指挥家里的 Agent 干活**：把家里的 DSH 接上内网穿透后，无论你在通勤、吃饭还是出差，掏出手机打开网页就能像发微信一样下达任务，让家里的电脑替你跑脚本、查资料、改代码。
- **随时发图、传文件**：在外面随手拍的照片、手机里的截图或文档，直接从手机端上传，家里的 Agent 立刻就能看到并接手处理。
- **一键换/开新会话，解放上下文**：任务聊太长、怕上下文堆积变慢或跑偏？直接新开会话或切换会话，随时轻装上阵，不卡顿、不串台。
- **按场景自由切换模型**：日常闲聊切轻量快模型，遇到复杂活切主力强模型，直接在手机端随时切换，兼顾速度、效果和成本。
- **异地远程控制（电脑、手机、NAS 等）**：按需开启远程控制后，可以通过你自定义的白名单动作或带签名的本地 Webhook，把家里常用操作做成手机按钮——不只控制宿主机电脑，还能顺手联动局域网里的 NAS、备用手机或其他本地服务。（默认关闭，绝不开放任意执行系统命令的危险口子。）
- **一个入口，玩转多种助手与扩展**：
  - 默认接通你的主 DSH 助手；
  - 支持和开源插件 [dsh-fish](https://github.com/mochi-fish/dsh-fish) 可选联动（默认关闭；装了并打开开关就能自动连上）；
  - 还能再挂一个外部助手（命令行工具或本地文件队列），本插件只负责传话，不干涉外部工具自己的模型设置；
  - 想要语音回复（TTS）也能按需接入你自己的本地命令行或 HTTP 语音接口，不捆绑任何第三方收费服务。
- **全在 DSH 面板里可视化配置，隐私与代码彻底分离**：装好后 DSH 设置里会多出一个 **`远程聊天`** 菜单（含 `概览与连接`、`助手头像`、`Agent / Harness 接入`、`语音合成接口`、`远程控制接口`、`存储与诊断` 共 6 个标签页），改头像、改昵称、改“正在思考”提示词全都能点点鼠标搞定。所有个人配置、密钥、头像和聊天记录都存在 `~/.dsh/phone-chat/`（仓库外部），升级不丢数据、开源不泄隐私。

## 怎么安装和使用？

> **懒人用法**：如果你正在用 AI Agent，直接把这个仓库链接发给它，说一句「帮我把这个插件装到 DSH 里」，它照着 `cordis.patch.example.yml` 就能帮你配好。

### 手动安装步骤

**前提条件**：电脑已安装 **Node.js 20+**（已在 Node.js 22 测试通过）和 **DSH**（`>= 0.2.0-rc.1 < 0.3.0-0`）。

1. **把插件下载到你的 DSH 插件目录**
   ```bash
   git clone https://github.com/Hyrrokin141/Dsh-phone-chat.git
   ```
2. **启用插件**
   打开你 DSH 配置目录下的 `cordis.patch.yml`，把 [`cordis.patch.example.yml`](./cordis.patch.example.yml) 里的内容粘进去：
   ```yaml
   - insert:
       - id: phone-chat
         name: dsh-phone-chat
         config:
           hostOnly: true
   ```
3. **重启 DSH，打开设置面板**
   重启后进入 DSH 的 **设置 → `远程聊天`**，看到右上角显示「服务运行中」就说明装好了。
4. **手机扫码开聊**
   在 **概览与连接** 页面直接用手机扫二维码（或者复制带 `?k=...` 的链接在手机浏览器打开）。
5. **出门在外也想连？（可选）**
   用 Tailscale Serve、FRP 或 Cloudflare Tunnel 等内网穿透工具，把 DSH 的本地端口映射出一个 `https://` 地址，填进面板的 **公网 / 隧道基础地址**，二维码就会自动变成外网可用的链接。

## 配置和文件存在哪儿？

插件启动时会按下面顺序读取设置，后面的会覆盖前面的：

```text
内置默认设置  ←  cordis.patch.yml 里的配置  ←  你在 DSH 面板里保存的 ~/.dsh/phone-chat/config.json
```

- 像语音鉴权头（`tts.authHeader`）、Webhook 密钥（`remoteControl.webhookSecret`）这类敏感信息都是**只存不回显**的，网页上看不到明文。
- 聊天相关文件默认存在 `~/.dsh/phone-chat/data/` 下：
  - `workspace/` — 主 DSH 会话的工作目录
  - `chat/` — 外部助手队列传话目录
  - `photos/` — 手机发给电脑的图片（默认上限 512 MiB，可在面板调整）
  - `files/` — 上传的共享文件
  - `history/` — 聊天记录

## 代码目录一览

```text
.
├── cordis.patch.example.yml   # DSH 启用插件的配置示例
├── docs/images/               # 文档展示截图
├── lib/
│   ├── index.js               # 插件主入口与接口路由
│   ├── client.js              # DSH 设置面板页面（无需打包编译）
│   ├── page.html              # 手机端聊天与远程控制页面
│   ├── config.mjs             # 配置读写与敏感信息脱敏
│   ├── harness.mjs            # 外部 CLI / 文件队列助手适配
│   ├── tts.mjs                # CLI / HTTP 语音合成接口实现
│   ├── remote-control.mjs     # 白名单远程控制与签名 Webhook
│   └── qr.mjs                 # 零依赖二维码生成
├── tests/
│   └── test-open-plugin.mjs   # 自动化功能测试
└── tools/
    └── check-privacy.mjs      # 发布前隐私与文件编码检查
```

## 开发者自检

改完代码后，跑一下这两条命令确认功能和隐私都没问题：

```bash
npm test
npm run check:privacy
```

## 致谢

- [mochi-fish/dsh-fish](https://github.com/mochi-fish/dsh-fish)（作者：[@mochi-fish](https://github.com/mochi-fish)）— 本插件支持可选联动的开源伙伴插件。
- **DeepSeek Harness (DSH)** — 插件运行平台。

## 开源协议

[MIT](./LICENSE) © 2026 Hyrrokin
