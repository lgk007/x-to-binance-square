# X → Binance Square

> **Disclaimer**: This is a community project, **not affiliated with, endorsed by, or sponsored by X (Twitter) or Binance**. Publishing is done with your own Binance Square OpenAPI key; you are responsible for the content you publish and for complying with both platforms' rules.

**EN** — A personal-use Chrome extension (Manifest V3) that bridges **your own** X posts to [Binance Square](https://www.binance.com/square/creator-center/home). It adds a gold sync button under your original tweets, opens a review panel where you can edit the text and pick images, and publishes **only after you click confirm** — nothing is ever automatic.

**中文** — 一个仅供个人使用的 Chrome 扩展：在 X 页面检查并编辑**自己的**推文，确认后手动发布到币安广场。支持纯文字和最多 4 张静态图片，绝不自动发布。

![Options page](artifacts/options-preview.png)

## Privacy & security / 隐私与安全

- **No server, no telemetry.** The extension talks directly to Binance's official OpenAPI from your browser. There is no third-party backend, no analytics, and nothing leaves your machine except the publish request itself.
- **Key stays local.** Your Square OpenAPI key is stored in `chrome.storage.local` restricted to trusted extension contexts. Content scripts on x.com can never read it, and it is never logged.
- **Least privilege.** Host permissions are limited to `x.com` (parse your tweets), `www.binance.com` (Square OpenAPI), `pbs.twimg.com` (download your images) and `*.amazonaws.com` (upload to Binance's presigned S3 URLs).
- **Your account only.** The sync button appears only on original posts by the handle you configure — never on other people's tweets or reposts.
- **Publishing scope only.** A Square creator key cannot touch trading or funds.

## Features

- Review-before-publish panel: edit text, toggle the source-link footer, select up to 4 images.
- Handles X's lazy media rendering and "Show more" text truncation: the panel re-parses the tweet live when you click sync, so long posts and images are captured in full.
- Duplicate protection via local sync records; uncertain results (504 / mid-submit network loss) are marked **"needs confirmation"** and require an explicit, token-confirmed retry instead of silently re-publishing.
- Built-in **network diagnostics** on the options page to pinpoint VPN/split-proxy problems with the Binance API path.
- Plain ES modules, zero dependencies, zero build step.

## Install / 安装

1. Clone or download this repository.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the repository root (the folder containing `manifest.json`).
4. The options page opens automatically; the toolbar icon reopens it later.

## Setup / 配置

1. Create a dedicated **Square OpenAPI key** in the [Binance Square Creator Center](https://www.binance.com/square/creator-center/home). It only allows publishing Square content — no trading, no assets.
2. In the options page, enter your X username (without `@`) and paste the key.
3. Refresh any open `x.com` tabs.
4. (Recommended) Run **网络诊断 / Network diagnostics** on the options page once to verify the extension backend can reach the Binance API — especially if you use a VPN with split/pac routing.

## Usage / 使用

Find one of your own posts → click the gold icon → review the panel (text, source link, images) → click **发布到币安广场**. On success the panel links straight to the Square post, and the tweet stays marked as synced.

## Limitations

- No video/GIF, no scheduled or automatic posting, no editing/deleting Square posts, no X Articles (long-form) — text and up to 4 static images only.
- Depends on X's DOM structure (`data-testid` attributes); a redesign may require updating `content/tweet-parser.js`.
- Binance's current public defaults are 100 successful posts and 400 media uploads per day — respect them and the Square content rules.

## Troubleshooting

- **No gold icon** — check the configured username, refresh x.com; other users' posts and reposts never show it.
- **Key invalid/expired** — regenerate it in the Creator Center and update the options page.
- **"Uncertain / 待确认"** — check your Square profile first; the extension deliberately does not auto-retry to avoid double posting.
- **Web pages load but publishing fails** — run the built-in network diagnostics; it separates proxy split-routing issues from Binance-side blocking.

## Development

No dependencies to install:

```sh
node --test        # unit tests (never call the real Binance API)
npm run check      # syntax-checks all sources + manifest
```

## License

MIT — see [LICENSE](LICENSE).
