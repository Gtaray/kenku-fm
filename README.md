[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

# Kenku FM

## About this fork

This is an unofficial fork of [owlbear-rodeo/kenku-fm](https://github.com/owlbear-rodeo/kenku-fm). It is not affiliated with or supported by Owlbear Rodeo; please report issues with fork features here, not upstream.

**This fork plays to [Fluxer](https://fluxer.app) voice channels instead of Discord.** Discord support has been removed, so anything in the upstream sections below that mentions Discord now applies to Fluxer.

### New features

- **Fluxer voice bot.** Kenku connects to Fluxer with a bot token, lists the servers and voice channels the bot can see, and plays its mix into the voice channels you pick, just as it did with Discord.
  - In **Settings → Fluxer**, enter your server's **Instance** address (`https://fluxer.app` by default, or your own self-hosted instance) and the bot's **Token**, then press **Connect**. Kenku reconnects automatically on later launches.
  - Choose voice channels in the sidebar's **Output** list. With **Multiple Outputs** enabled you can play to several channels at once, one per server.
  - The bot needs **View Channel**, **Connect** and **Speak** in the voice channels it should join (permission integer `3146752` when inviting it). Without **Speak** it joins but can't be heard.
  - Audio is sent at the voice channel's bitrate; Fluxer sends stereo only at 128 kbps and above, so raise the channel's bitrate for stereo music.
  - The old **Settings → Streaming → Mode** option is gone; it only applied to the Discord audio pipeline.
- **PipeWire virtual microphone (Linux only).** When `pw-loopback` is installed, Kenku creates a **Kenku FM** microphone at startup and removes it on quit. Select **Kenku FM Virtual Mic** in the Output list to play into it, then choose **Kenku FM** as the microphone in your voice chat app; no manual routing or auto-connect scripts needed.
  - Enable **Multiple Outputs** to play to **This Computer** and the virtual mic at the same time.
  - Your choice of This Computer / Virtual Mic is remembered between launches.
  - Kenku's own devices are hidden from the External Inputs list to prevent feedback loops. Ignore the **Monitor of Kenku FM Output** entry other apps show; it carries the same audio.
  - On Windows, macOS, or Linux without PipeWire, nothing changes.
- **Custom colour themes.** Every `*.json` file in the theme folder (`~/.config/Kenku FM/theme/` on Linux, alongside Kenku's existing data) appears in a new **Settings → Theme** selector. Kenku recolours instantly when you switch themes or edit the selected file, in both the main window and the player.
  - `default.json` is created on first launch with Kenku's original colours and is never overwritten, so it's a safe starting point to copy.
  - If the selected file is missing or invalid, Kenku falls back to its original colours and switches back once the file is fixed. Invalid files are greyed out in the selector.
  - An **Open Theme Folder** button opens the folder in your file manager.
- **Desktop theme integration.** Because themes reload live, a tool that regenerates a theme file when your desktop palette changes (for example a [Noctalia](https://docs.noctalia.dev) template) keeps Kenku in sync with the rest of your desktop.
- **Ad and tracker blocking** for pages opened in Kenku's browser tabs.
- **Add Bookmark button.** The **+** next to **Bookmarks** adds a bookmark by URL.
- **Per-tab volume.** Hover a tab's speaker icon for a volume slider; clicking the icon still mutes.
- **Track and playlist copy/paste.** Copy a track and paste it into another playlist, duplicate a playlist, copy a track's file path or link, and show a local track in your file manager or open a web track in your browser.

Ad blocking, bookmarks, per-tab volume and copy/paste are ported from [Soteyl/better-kenku-fm](https://github.com/Soteyl/better-kenku-fm).

### Theme file format

```json
{
  "mode": "dark",
  "colors": {
    "primary": "#bb99ff",
    "on_primary": "#000000de",
    "secondary": "#ee99ff",
    "on_secondary": "#000000de",
    "error": "#f44336",
    "on_error": "#ffffff",
    "surface": "#1e2231",
    "surface_container": "#222639",
    "surface_container_high": "#2d3143",
    "on_surface": "#ffffff",
    "on_surface_variant": "#ffffffb3",
    "outline_variant": "#ffffff1f"
  }
}
```

`mode` is `dark` or `light`. Every colour above is required and must be `#rrggbb` or `#rrggbbaa`; any extra keys are ignored. The names follow Material Design's colour roles, so palettes from Material-based tools map across directly.

## About Kenku FM

Kenku FM is a desktop application for Windows, MacOS and Linux designed to be the easiest way to share music in a Discord voice call.

- Use the Kenku Player interface to share your **local music** and sound effects to your discord calls.
- Use the built in web browser to share audio from your favourite websites like **YouTube** and **Spotify**.
- Trigger and control sounds with the Kenku FM plugin for the **Elgato Stream Deck**.
- If you already have a **virtual audio cable** setup use Kenku FM as an easy way to connect to Discord with your existing software.

<p align="center">
  <img src="./docs/example.png" alt="Kenku FM Interface" width="738">
</p>

## Installing

Prebuilt binaries can be found at [kenku.fm](https://www.kenku.fm) or from the [GitHub releases](https://github.com/owlbear-rodeo/kenku-fm/releases).

## Docs

Docs on using Kenku FM can be found [here](https://www.kenku.fm/docs).

## How it Works

1. Kenku FM is an [Electron](https://www.electronjs.org/) application primarily written in [Typescript](https://www.typescriptlang.org/) and [React](https://reactjs.org/).
2. Electron browser views are used to display external web content or the built in audio player app.
3. The user creates and provides their own Discord bot token to connect to Discord.
4. The Electron media capture API is used to capture audio from each browser view. The audio is then mixed using a Web Audio Context and sent to a Discord voice call using [Eris](https://github.com/abalabahaha/eris).
5. An optional HTTP server allows users to trigger and control the playback of the built in player app. An example of this in action can be seen with our [Stream Deck plugin](https://www.kenku.fm/docs/using-kenku-remote).
6. Enable external inputs to allow mixing in OS audio inputs.
7. Enable multiple outputs to send your audio to multiple Discord servers at once.
8. If you plan to use Kenku FM for streaming you can also output to your local machine for capture by a streaming app and a discord call for your players at the same time.

## Building

Kenku FM uses [Yarn](https://yarnpkg.com/) as a package manager and [Electron Forge](https://www.electronforge.io/) as an Electron builder.

To install all the dependencies run:

`yarn`

To run Kenku FM in a development mode run:

`yarn start`

To make a production build run:

`yarn make`

If you wish to add protected media playback support follow the build steps from the [Electron for Content Security](https://github.com/castlabs/electron-releases) repo.

## Stream Deck

The stream deck plugin can be found [here](https://github.com/owlbear-rodeo/kenku-fm-stream-deck).

## Protected Media

As we act as a web browser in order to play protected media we need to support Google's Widevine [Content Decryption Module (CDM)](https://www.widevine.com/). To do this Kenku FM uses the [Electron for Content Security](https://github.com/castlabs/electron-releases) version of Electron provided by Castlabs.

This allows us to support loading of DRM protected media on Windows and MacOS.

Unfortunately the story isn't as simple on Linux. While we are able to provide support for protected media on x64 Linux builds, Linux doesn't support the Widevine Verified Media Path (VMP) this means that sites that require the use of VMP will not work. Unfortunately at this time Spotify requires VMP. You can read more about VMP and Linux [here](https://arstechnica.com/gadgets/2020/08/hbo-max-cranks-up-the-widevine-drm-leaves-linux-users-in-the-cold/).

Next Google doesn't provide a publicly available ARM Linux version of their Widevine Content Delivery Module so we are unable to provide any protected media support on ARM Linux.

If any of these change we'll be happy to update Kenku FM with full support for protected media on Linux.

## Project Structure

All source files can be found in the `src` folder, our build scripts for CI/CD are in the `publish` folder.

Within the `src` folder the `index.ts` file and `main` folder contains the code for the main process of Electron. This includes things like managing the Discord connection, creating the HTTP server for the remote control and managing the browser views.

The `renderer.ts` file and `renderer` folder contains code for the renderer process of Electron. The renderer is written in React and uses Redux Toolkit for state management.

The `preload.ts` file and `preload` folder contains code for the preload script for the renderer. The preload script mainly acts as a bridge to expose functionality from the main process to the renderer.

The `player` folder contains the code for the built in audio player. This runs as a separate web view and is loaded as a separate entry point in the `forge.config.js`. The player app is written in React and also uses Redux Toolkit for state management.

## Licence

Kenku FM is licensed under the GNU General Public Licence v3.0.

## Contributing

For our own wellbeing Kenku FM follows a similar contribution policy projects like [Litestream](https://github.com/benbjohnson/litestream#open-source-not-open-contribution).

This means we are open to pull requests for bug fixes only. Pull requests for new features will not be accepted due to the burden of maintaining these features into the future.
