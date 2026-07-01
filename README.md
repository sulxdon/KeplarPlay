# KeplarPlay — Xtream IPTV Player

A dark, cinematic, browser-based Xtream IPTV player built with the [Twitch Rivals aesthetic](.claude/skills/twitchrivals_aesthetic/SKILL.md). Connect to any Xtream Codes-compatible server and watch Live TV, Movies, and Series.

![Aesthetic](https://img.shields.io/badge/style-Twitch%20Rivals%20Aesthetic-9146ff)

## Features

- **Dark cinematic UI** — deep blacks, neon purple / magenta / cyan accents, bold typography
- **Live TV** — browse by category, channel logos, quick search
- **TV Guide / EPG** — see what's on now and what's coming up across live channels, then click to watch
- **Movies & Series** — poster grids, category filtering, episode selectors
- **Built-in player** — HLS.js powered playback for `.m3u8` streams with HTML5 fallback
- **Favorites & Recently Watched** — saved locally in your browser
- **PWA support** — installable app with offline app-shell caching
- **TV / arrow-pad navigation** — use arrow keys, Enter, and Back to browse without a mouse
- **Responsive layout** — works on desktop and mobile
- **No build step** — open `index.html` in a browser and go

## Getting Started

1. Open `index.html` in a modern browser.
2. Enter your Xtream Codes credentials:
   - **Server URL** — e.g. `http://example.com:8080`
   - **Username**
   - **Password**
3. Click **Start Watching**.
4. Browse Live TV, Movies, or Series and click any item to play.

> ⚠️ **CORS requirement**: Because this is a pure client-side app, your Xtream server must allow cross-origin requests from your browser. If the server blocks CORS, streams and API calls will fail. For a production deployment, route requests through a backend proxy.

## Project Structure

```
├── index.html          # Login / landing page
├── app.html            # Main dashboard & player
├── css/
│   ├── base.css        # Design tokens, reset, utilities
│   ├── components.css  # Buttons, cards, forms, nav, player
│   └── pages.css       # Login & dashboard layouts
├── js/
│   ├── api.js          # Xtream API wrapper
│   ├── auth.js         # Login / logout / credential storage
│   ├── app.js          # Dashboard router & content rendering
│   ├── player.js       # HLS.js video player logic
│   ├── ui.js           # DOM rendering helpers
│   ├── storage.js      # localStorage helpers
│   └── focus.js        # Arrow-pad / TV remote focus navigation
├── sw.js               # Service worker for offline app shell
├── manifest.json       # PWA manifest
├── icons/              # App icons
└── README.md
```

## Design System

This project follows the `twitchrivals_aesthetic` skill:

| Token | Value |
|-------|-------|
| Background | `#0a0a0a` |
| Surface | `#141414` |
| Accent Purple | `#9146ff` |
| Accent Magenta | `#ff4fd8` |
| Accent Cyan | `#00f0ff` |
| Text Primary | `#f5f5f5` |
| Text Secondary | `#a0a0a0` |

- Full-bleed sections, minimal chrome
- Pill-shaped primary CTAs
- Card grids with hover glows
- Kinetic load-in ready text treatments

## Security Note

Credentials are stored in `localStorage` for convenience. This is acceptable for local/personal use but **not recommended for production** or shared devices. A production version should:

- Store credentials server-side or use short-lived tokens
- Proxy API and stream requests through a backend
- Serve over HTTPS

## Browser Support

- Chrome / Edge / Firefox / Safari (latest)
- HLS playback uses HLS.js for browsers without native HLS support

## License

MIT — built for personal use and experimentation.
