# ASMR Coach (POC)

VS Code extension proof-of-concept that reacts to your coding activity with short ASMR-style coaching lines.

## What it does

- Detects a long line and praises you.
- Detects idle time and nudges you.
- Detects sustained typing and celebrates focus.
- Detects burst typing and comments on speed.
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
   - `code --install-extension asmr-coach.vsix`

Or inside VS Code: Extensions view -> `...` menu -> `Install from VSIX...`.

## Easy test flow

1. In Extension Development Host, run `ASMR Coach: Show Trigger Debug`.
2. Set mode with `ASMR Coach: Toggle Mock/Audio`.
3. For quick validation, run `ASMR Coach: Test Voice Line`.
4. Type quickly for burst/sustained triggers; pause for idle trigger.
5. Run `ASMR Coach: Pre-Generate Voice Cache` once to generate all clips up front.

## Settings

- `asmrCoach.enabled`
- `asmrCoach.mode` (`mock` or `audio`)
- `asmrCoach.apiKey`
- `asmrCoach.voicePersona` (`female` default, `male`, or `mixed`)
- `asmrCoach.usePreGeneratedAudio`
- `asmrCoach.preGenerateOnStartup`
- Trigger thresholds and cooldowns use longer defaults for less frequent interruptions.

Current defaults favor longer, less frequent interruptions (production-like pacing).

Open command palette and use:

- `ASMR Coach: Toggle Enabled`
- `ASMR Coach: Toggle Mock/Audio`
- `ASMR Coach: Test Voice Line`
- `ASMR Coach: Test Voice Line (Force Fetch)`
- `ASMR Coach: Show Trigger Debug`
- `ASMR Coach: Pre-Generate Voice Cache`
- `ASMR Coach: Clear Voice Cache`
- `ASMR Coach: Show Cache Stats`

`Show Cache Stats` reports both:

- all scripted lines across male+female personas
- active route lines (the persona currently selected per trigger)

`Test Voice Line (Force Fetch)` bypasses cache lookup for that run, fetches from ElevenLabs even if current mode is `mock`, then stores the result in cache.

## Pre-generated audio cache

When `asmrCoach.usePreGeneratedAudio` is enabled:

- If a line has a cached MP3, it plays immediately.
- If a line is missing, the extension synthesizes once, saves it, then reuses it later.
- Existing indexed phrases are never regenerated, which protects credits.
- Adding new phrases only generates audio for those new lines.
- If ElevenLabs returns `paid_plan_required` for a phrase, that phrase is marked blocked for on-demand playback.

Updated behavior:

- On-demand trigger playback does not retry blocked phrases; it uses cached fallback audio if available, otherwise logs a mock fallback line.
- Pre-generate does retry previously blocked phrases, so you can recover after upgrading plan/changing voices.

To build the full cache in advance:

1. Set `asmrCoach.mode` to `audio`.
2. Set `asmrCoach.apiKey`.
3. Run `ASMR Coach: Pre-Generate Voice Cache`.

Optional: set `asmrCoach.preGenerateOnStartup` to auto-fill the cache at startup.

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

If you hear nothing, open `ASMR Coach` output and run `ASMR Coach: Test Voice Line` to see the exact playback error.

## Fixed voices

This POC uses fixed voice IDs in `src/voice/elevenlabsClient.ts`:

- Female: `j05EIz3iI3JmBTWC3CsA`
- Male: `HgyIHe81F3nXywNwkraY`

Swap those constants if you want different voices.
