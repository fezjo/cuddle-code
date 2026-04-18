# Cuddle Code (POC)

VS Code extension proof-of-concept that reacts to your coding activity with short supportive coaching lines.

## What it does

- Loads trigger lines from `lines.md` using heading alias mapping.
- Uses high-confidence trigger detection with strict rules for git commits and passing tests.
- Supports scheduler pacing modes (`normal`, `demo`, `debug`) with token budget and cooldown governance.
- Detects Sandy mentions in Python/C++/Rust comments and generates dynamic OpenAI responses.
- Supports `mock` mode (logs only) and `audio` mode (ElevenLabs speech + local playback).
- Supports pre-generated audio caching to reduce API calls and latency.

## Setup

1. Install dependencies:
   - `npm install`
2. Build once:
   - `npm run build`

## Fast local dev (quick reloads)

Use the included VS Code debug config for fast iteration:

1. Open this folder in VS Code.
2. Press `F5` and run `Run Extension`.
   - This starts `npm run watch` automatically.
3. Edit files in `src/`.
4. In the Extension Development Host window, press `Ctrl+R` (or `Cmd+R` on macOS) to reload quickly.

You do not need to rebuild manually while `watch` is running.

## Package as VSIX

1. Create the package:
   - `npm run package:vsix`
2. Install it in VS Code:
   - `code --install-extension cuddle-code.vsix`

Or inside VS Code: Extensions view -> `...` menu -> `Install from VSIX...`.

## Easy test flow

1. In Extension Development Host, run `Cuddle Code: Show Trigger Debug`.
2. Set mode with `Cuddle Code: Toggle Mock/Audio`.
3. For quick validation, run `Cuddle Code: Test Voice Line`.
4. Type quickly for burst/sustained triggers; pause for idle trigger.
5. Run `Cuddle Code: Pre-Generate Voice Cache` once to generate all clips up front.

## Settings

- `cuddleCode.enabled`
- `cuddleCode.mode` (`mock` or `audio`)
- `cuddleCode.apiKey`
- `cuddleCode.voicePersona` (`female` default, `male`, or `mixed`)
- `cuddleCode.pacingMode` (`normal`, `demo`, `debug`)
- `cuddleCode.llmApiKey` (OpenAI key for Sandy mention replies)
- `cuddleCode.audioKeepAlive` (optional tiny periodic pulse to keep audio hardware awake)
- `cuddleCode.usePreGeneratedAudio`
- `cuddleCode.preGenerateOnStartup`
- Trigger thresholds and cooldowns use longer defaults for less frequent interruptions.

Current defaults favor audible demo behavior (audio mode + demo pacing), with keepalive enabled to reduce clipped starts on power-saving audio devices.

Open command palette and use:

- `Cuddle Code: Toggle Enabled`
- `Cuddle Code: Toggle Mock/Audio`
- `Cuddle Code: Toggle Audio KeepAlive`
- `Cuddle Code: Test Voice Line`
- `Cuddle Code: Test Voice Line (Force Fetch)`
- `Cuddle Code: Show Trigger Debug`
- `Cuddle Code: Pre-Generate Voice Cache`
- `Cuddle Code: Clear Voice Cache`
- `Cuddle Code: Show Cache Stats`
- `Cuddle Code: Show Trigger Health`
- `Cuddle Code: Simulate Trigger`

`Show Cache Stats` reports both:

- all scripted lines across male+female personas
- active route lines (the persona currently selected per trigger)

`Test Voice Line (Force Fetch)` bypasses cache lookup for that run, fetches from ElevenLabs even if current mode is `mock`, then stores the result in cache.

## Pre-generated audio cache

When `cuddleCode.usePreGeneratedAudio` is enabled:

- If a line has a cached MP3, it plays immediately.
- If a line is missing, the extension synthesizes once, saves it, then reuses it later.
- Existing indexed phrases are never regenerated, which protects credits.
- Adding new phrases only generates audio for those new lines.
- If ElevenLabs returns `paid_plan_required` for a phrase, that phrase is marked blocked for on-demand playback.

Updated behavior:

- On-demand trigger playback does not retry blocked phrases; it uses cached fallback audio if available, otherwise logs a mock fallback line.
- Pre-generate does retry previously blocked phrases, so you can recover after upgrading plan/changing voices.

To build the full cache in advance:

1. Set `cuddleCode.mode` to `audio`.
2. Set `cuddleCode.apiKey`.
3. Run `Cuddle Code: Pre-Generate Voice Cache`.

Optional: set `cuddleCode.preGenerateOnStartup` to auto-fill the cache at startup.

## Sandy mention behavior

- If a Python/C++/Rust comment line contains `sandy`, Cuddle Code generates a custom short reply.
- Provider is OpenAI (`cuddleCode.llmApiKey`) and tone is globally spicy/supportive.
- If OpenAI is unavailable, fallback line is used: `I am here, keep going - you have got this.`
- Sandy mentions are forced through scheduler gating so Sandy always replies.

## Audio playback notes

For `audio` mode, the extension tries these players in order:

- `ffplay`
- `mpg123`
- `paplay`
- `aplay`
- `play` (SoX)
- `cvlc`
- `afplay`
- `powershell` SoundPlayer

Install at least one locally.

If you hear nothing, open `Cuddle Code` output and run `Cuddle Code: Test Voice Line` to see the exact playback error.

## Fixed voices

This POC uses fixed voice IDs in `src/voice/elevenlabsClient.ts`:

- Female: `j05EIz3iI3JmBTWC3CsA`
- Male: `HgyIHe81F3nXywNwkraY`

Swap those constants if you want different voices.
