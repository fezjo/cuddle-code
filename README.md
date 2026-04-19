# Cuddle Code

VS Code extension that reacts to your coding activity with supportive voice lines.

## What it does

- Watches common coding signals (typing burst, idle, save, tests passing, commits, etc.) and reacts accordingly.
- Supports dynamic Sandy mentions (comment with `sandy`) via OpenAI-compatible LLMs (see optional settings below).
- Windows support is flaky -- sometimes works, sometimes does not.

## Optional settings

- `cuddleCode.voicePersona`: `female`, `male`, or `mixed`
- `cuddleCode.pacingMode`: `demo` (more frequent) or `normal` (less frequent)
- `cuddleCode.llmApiKey`, `cuddleCode.llmBaseUrl`, `cuddleCode.llmModel` (for Sandy dynamic replies)
- `cuddleCode.elevenlabsApiKey` (only needed when a line is missing from cache/bundle and must be synthesized)

## Core commands

- `Cuddle Code: Toggle Enabled`
- `Cuddle Code: Test Voice Line`
- `Cuddle Code: Simulate Trigger`
