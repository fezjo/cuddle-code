# Cuddle Code

VS Code extension that reacts to your coding activity with supportive voice lines.

## What it does

- Watches common coding signals (typing burst, idle, save, tests passing, commits, etc.).
- Plays pre-scripted lines from `lines.md`.
- Supports dynamic Sandy mentions (comment with `sandy`) via OpenAI-compatible LLMs.
- Supports local audio cache and optional downloadable voice bundle.

## Quick start (Marketplace)

1. Install the extension.
2. Open Command Palette and run:
   - `Cuddle Code: Download Voice Bundle`
3. Optional settings:
   - `cuddleCode.voicePersona`: `female`, `male`, or `mixed`
   - `cuddleCode.pacingMode`: `demo` (more frequent) or `normal` (less frequent)
   - `cuddleCode.llmApiKey`, `cuddleCode.llmBaseUrl`, `cuddleCode.llmModel` (for Sandy dynamic replies)
   - `cuddleCode.elevenlabsApiKey` (only needed when a line is missing from cache/bundle and must be synthesized)

## Core commands

- `Cuddle Code: Toggle Enabled`
- `Cuddle Code: Test Voice Line`
- `Cuddle Code: Simulate Trigger`
- `Cuddle Code: Download Voice Bundle`
- `Cuddle Code: Clear Downloaded Voice Bundle`

## Notes

- Windows support is flaky -- sometimes works, sometimes does not.

## Developer docs

For local development, packaging, and deep configuration, see `DEVELOPERS.md`.
