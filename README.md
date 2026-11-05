# HyperFacebook

A Chrome extension (Manifest V3) for Facebook, Messenger, Instagram and Threads.

## Features

- **Find videos** – scans the active Facebook tab for direct video links and downloads them from inside the popup.
- **Remember video volume** – keeps your volume / mute choice across Facebook videos.
- **Message tools** (Facebook, Messenger, Instagram, Threads)
  - **Block seen** – stops read receipts from being sent.
  - **Block typing** – stops the typing indicator from being sent.
  - **Block story seen** – stops story views from being recorded (Facebook, Instagram; Threads has no stories).

Message tools work by dropping matching outgoing requests (fetch, XHR, beacons, WebSocket frames, including those sent from workers). The sites change their internal request names often, so a pattern may stop matching; watch the Network tab in DevTools to find the new name and update the regexes in `public/msg-main.js`.

Only Block seen on Instagram has been verified so far.

## Build

```sh
npm install
npm run build      # outputs to dist/
npm run dev        # rebuild on change
```

## Install

Download `HyperFacebook-<version>.zip` from the [Releases](https://github.com/hungp1601/HyperFacebook/releases) page, unzip it and load that folder. (Releases are built automatically when a `v*` tag is pushed.)

The prebuilt extension is also committed in `dist/`, so you can skip the build.

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select the `dist/` folder.
3. After changing a toggle, reload the Facebook / Instagram tab.

## Layout

- `src/` – React popup UI
- `public/manifest.json` – extension manifest
- `public/content.js` – volume memory
- `public/msg-main.js` – page-world blocker; `public/msg-bridge.js` relays settings to it

Use only on accounts and content you have permission to access.
