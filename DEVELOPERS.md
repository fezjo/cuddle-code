# Cuddle Code Developer Guide

This file contains local development, debugging, packaging, and advanced configuration details.

## Setup

1. Install dependencies:
   - `npm install`
2. Build once:
   - `npm run build`

## Fast local dev (quick reloads)

1. Open this folder in VS Code.
2. Press `F5` and run `Run Extension`.
   - This starts `npm run watch` automatically.
3. Edit files in `src/`.
4. In the Extension Development Host, press `Ctrl+R` (`Cmd+R` on macOS) to reload.

## Package as VSIX

1. Create package:
   - `npm run package:vsix`
2. Install:
   - `code --install-extension cuddle-code.vsix`

## Easy test flow

1. Run `Cuddle Code: Show Trigger Debug`.
2. Set mode via `Cuddle Code: Toggle Mock/Audio`.
3. Run `Cuddle Code: Test Voice Line`.
4. Type quickly for burst/sustained; pause for idle.
5. Optional: `Cuddle Code: Pre-Generate Voice Cache`.

## Settings

- `cuddleCode.enabled`
- `cuddleCode.mode` (`mock` or `audio`)
- `cuddleCode.elevenlabsApiKey`
- `cuddleCode.voicePersona` (`female`, `male`, `mixed`)
- `cuddleCode.pacingMode` (`normal`, `demo`, `debug`)
- `cuddleCode.llmApiKey` (OpenAI key for Sandy mention replies)
- `cuddleCode.llmBaseUrl` (default `https://api.openai.com/v1`)
- `cuddleCode.llmModel`
- `cuddleCode.llmReferer` (optional header)
- `cuddleCode.llmTitle` (optional header)
- `cuddleCode.audioKeepAlive`
- `cuddleCode.usePreGeneratedAudio`
- `cuddleCode.preGenerateOnStartup`
- `cuddleCode.voiceBundleIndexUrl`

## Commands

- `Cuddle Code: Toggle Enabled`
- `Cuddle Code: Toggle Mock/Audio`
- `Cuddle Code: Toggle Audio KeepAlive`
- `Cuddle Code: Test Voice Line`
- `Cuddle Code: Test Voice Line (Force Fetch)`
- `Cuddle Code: Show Trigger Debug`
- `Cuddle Code: Pre-Generate Voice Cache`
- `Cuddle Code: Clear Voice Cache`
- `Cuddle Code: Show Cache Stats`
- `Cuddle Code: Export Bundled Voice Cache`
- `Cuddle Code: Download Voice Bundle`
- `Cuddle Code: Clear Downloaded Voice Bundle`
- `Cuddle Code: Show Trigger Health`
- `Cuddle Code: Simulate Trigger`

## Pre-generated audio cache

When `cuddleCode.usePreGeneratedAudio` is enabled:

- Cached MP3 is played immediately when found.
- Missing line is synthesized once and cached.
- Existing indexed phrases are not regenerated.
- New phrases generate only for new lines.
- `paid_plan_required` phrases are marked blocked for on-demand playback.

To build cache in advance:

1. Set `cuddleCode.mode = audio`
2. Set `cuddleCode.elevenlabsApiKey`
3. Run `Cuddle Code: Pre-Generate Voice Cache`

Optional: set `cuddleCode.preGenerateOnStartup = true`.

## Sandy mention behavior

- If a comment line contains `sandy`, dynamic reply is generated.
- Provider is OpenAI-compatible (`llmBaseUrl` + `llmModel` + `llmApiKey`).
- If unavailable, fallback line is used.

OpenRouter example:

- `cuddleCode.llmApiKey = sk-or-...`
- `cuddleCode.llmBaseUrl = https://openrouter.ai/api/v1`
- `cuddleCode.llmModel = openai/gpt-5-mini`
- optional `cuddleCode.llmReferer`, `cuddleCode.llmTitle`

## Audio playback notes

For `audio` mode, player order:

- Windows: PowerShell MediaPlayer, then SoundPlayer
- Linux/macOS: `ffplay`, `mpg123`, `paplay`, `aplay`, `play`, `cvlc`, `afplay`

Install at least one local player on Linux/macOS.

## Fixed voices

Defined in `src/voice/elevenlabsClient.ts`:

- Female: `j05EIz3iI3JmBTWC3CsA`
- Male: `HgyIHe81F3nXywNwkraY`
