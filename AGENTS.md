# AGENTS.md

Notes for AI coding agents working in this repo.

## Project

Personal fork of [owlbear-rodeo/kenku-fm](https://github.com/owlbear-rodeo/kenku-fm) (`origin` = `github.com/Gtaray/kenku-fm`, work goes straight to `main`). Electron (castlabs build `37.6.0+wvcus`) + React 18 + MUI 6 + Redux Toolkit, built with Electron Forge + webpack. Yarn v1 (`yarn.lock`).

The owner runs Arch Linux + Hyprland (Lua config) + the Noctalia shell, and only uses this fork himself, but **it must keep working as before on Windows/macOS**: Linux-only features must switch themselves off elsewhere.

## Fork features and where they live

- **Fluxer voice bot (replaces Discord, which is removed).**
  - `src/main/broadcast/fluxer/FluxerGateway.ts`: gateway client (instance discovery via `/.well-known/fluxer`, Identify, heartbeats, resume; close code 4004 = bad token).
  - `src/main/broadcast/fluxer/FluxerBroadcast.ts`: guild/voice-channel list, join/leave, IPC `FLUXER_*`.
  - Voice media is LiveKit. Fluxer **force-disconnects a join that doesn't connect to the LiveKit room within 30 s**, so every joined channel gets a room in the hidden audio capture window: `src/preload/managers/VoiceRoomManagerPreload.ts` (`livekit-client` 2.22.3, same version Fluxer vendors). Each room publishes a clone of the mix track (`AudioCaptureManagerPreload.getMixTrack()`) as a Microphone track using Fluxer's own publish options (channel bitrate, `dtx: false`, `red: true`, stereo only at ≥128 kbps).
  - Fluxer gives no refusal on a failed join; we time out after 10 s with no `VOICE_SERVER_UPDATE`.
  - Settings `fluxerInstance` (default `https://fluxer.app`) and `fluxerToken`; redux-persist migration v5 in `src/renderer/app/store.ts`.
  - The Fluxer source is checked out at `~/repos/fluxer` for reference (docs in `fluxer_docs/`). Fluxer plans to replace LiveKit with an in-house system, so keep the LiveKit code contained to the voice room manager.
- **Live colour themes.** `src/main/theme/ThemeManager.ts` loads/watches `~/.config/Kenku FM/theme/*.json` and pushes them over IPC; `src/preload/theme.ts` exposes `window.kenkuTheme`; `src/renderer/app/KenkuThemeProvider.tsx` + `createKenkuTheme()` in `src/renderer/app/theme.ts`. `palette.background.wallpaper` is a custom gradient key. The selected theme id is in electron-store (`theme-settings.json`). A Noctalia template in the owner's dotfiles writes `theme/noctalia.json`.
- **PipeWire virtual mic (Linux only).** `src/main/pipewire/PipewireManager.ts` runs `pw-loopback` creating sink "Kenku FM Output" → source "Kenku FM" (use `Audio/Source`, not `Audio/Source/Virtual`, which crashes pw-loopback 1.6.9). Output list entry id `virtual-mic`, shown only when the device exists (`src/renderer/common/usePipewireAvailable.ts`); the audio window routes a second `<audio>` element to it with `setSinkId`. Local output selections are persisted via a redux-persist transform in `store.ts`.
- **Ported from [Soteyl/better-kenku-fm](https://github.com/Soteyl/better-kenku-fm)** (checked out at `~/repos/better-kenku-fm`):
  - Ad blocker: `src/main/adBlocker.ts` (`@ghostery/adblocker-electron`, ads + tracking lists) on `session.defaultSession`, so it also covers the player and audio window. **Network blocking only** (`loadCosmeticFilters = false`): Ghostery injects uBlock scriptlets one by one, they redeclare `JSONPath` and break YouTube playback. Engine (built with `fromLists(fetch, adsAndTrackingLists, { loadCosmeticFilters: false })`) cached in userData `adblocker-network-engine.bin`, rebuilt daily, stale copy used offline. It owns `webRequest.onBeforeRequest`/`onHeadersReceived` (Electron allows one listener per event).
  - Bookmarks `+` button and `AddBookmark.tsx` dialog.
  - Per-tab volume: hovering a tab's speaker icon shows a slider popup → `AUDIO_CAPTURE_SET_VOLUME` → per-view `GainNode` (gain = muted ? 0 : volume). Browser views draw above the main window's page, so the popup is its own transparent `WebContentsView` (`src/main/managers/VolumePopupManager.ts`, page in `src/volumePopup/`, webpack entry `volume_popup_window`). The main process owns the hide timer: the tab icon and the popup both send enter/leave; slider changes go popup → main → main window (`VOLUME_POPUP_VOLUME`, handled in `Tabs.tsx` via `tabAudio.ts`).
  - Player track copy/paste (in-memory `trackClipboardSlice`), playlist Duplicate, track Copy Path/Link and Show in Folder/Open in Browser via `src/main/managers/SystemManager.ts` (only http/https are opened).
  - PyMusicLooper loop points are not ported yet (owner will revisit).

## Things that will bite you

- **Dev and installed builds keep separate settings.** `yarn start` loads pages from `http://localhost:3000`, the installed app from `file://`, so their `localStorage` (Fluxer token, settings, bookmarks, playlists, soundboards) is separate even though both use `~/.config/Kenku FM`. Main-process data (themes, electron-store) is shared.
- **`CHROME_DESKTOP` crashes Electron 37 at startup** (`zygote_host_impl_linux.cc:225 ... Invalid argument`). VS Code terminals set it; the owner's VS Code settings unset it. Otherwise use `env -u CHROME_DESKTOP yarn start`.
- Quitting a `yarn start` instance by closing its window can leave the terminal with raw arrow keys; the owner quits with Ctrl+C instead. `reset` fixes a broken terminal.
- Only one Kenku instance can run at a time (single-instance lock), dev or installed.

## Commands

- Type check: `./node_modules/.bin/tsc --noEmit -p .` (npm/npx are not installed).
- Lint: `yarn lint` (≈60 pre-existing upstream errors; keep new code clean).
- Run: `yarn start`. Build check: `yarn package` (plain `electron-forge package` fails because it skips the castlabs mirror in `.env`).
- Install on Arch: `packaging/arch/install_or_update.sh` / `packaging/arch/uninstall.sh` (PKGBUILD builds the committed `main` branch into package `kenku-fm-fluxer`, installed to `/opt/kenku-fm`). makepkg rewrites `pkgver=` in the PKGBUILD on every build.

## Agent environment

- The terminal is **fish**: no heredocs or `f(){}`; an unmatched glob aborts the whole command line; never put `$|` or `$"` inside double quotes (the tide prompt loops on it), use single quotes.
- `cp`/`mv` are interactive aliases and `rm` moves to trash: use `command cp`, `command mv`, `/usr/bin/rm`.
- The owner runs `sudo` commands himself.

## Working with the owner

- Explain the plan before making changes; keep explanations brief.
- Limit changes to what was asked; mention related issues rather than fixing them unasked.
- The owner commits and pushes himself.
