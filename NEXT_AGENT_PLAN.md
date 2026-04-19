# Cuddle Code - Next Agent Plan

## Snapshot
- Core extension flow is stable: scheduler + trigger detectors + audio cache + Sandy LLM path.
- Sandy now supports:
  - debounce before response (2s idle after last edit)
  - inline and line-start comment mentions across languages
  - context window (+/- ~20 lines) in LLM request
  - OpenRouter/OpenAI-compatible endpoint/model configuration
  - detailed debug logging for request/response payloads
- Default settings currently favor active demo behavior:
  - `mode = audio`
  - `pacingMode = demo`
  - `audioKeepAlive = true`

## What Was Fixed Recently (Do Not Regress)
- Sandy fallback loop caused by `event is not defined` scope bug in `buildSandyResponse` was fixed.
- Sandy prompt is now loaded from `src/llm/SandyPrompt.md` and copied to `dist/llm/SandyPrompt.md` during build.
- Response truncation was removed; Sandy reply now uses API text as-is.
- Universal Sandy mention detection added (case-insensitive, supports phrases like `hello sandy`, `please SANDY`).
- Trigger suppression was added while actively editing Sandy line to avoid noisy competing triggers.
- Windows playback path now has built-in PowerShell-based fallback (no third-party player required).

## Immediate Priorities

### 1) Packaging hygiene (high)
- VSIX currently includes `throwaway/` and other dev artifacts.
- Action:
  - add `.vscodeignore` / refine packaging include list
  - exclude `throwaway/`, local scratch files, unnecessary test artifacts if not needed at runtime
  - verify with `vsce ls --tree`

### 2) Sandy response reliability tuning (high)
- Current model can still return reasoning-only payloads in some runs.
- Current mitigation (retry with stricter prompt + minimal reasoning) works better but should be hardened.
- Action:
  - add one structured metric/log counter for:
    - first response empty
    - retry success/fail
    - final fallback usage
  - ensure retry path cannot spam API on repeated triggers
  - optionally add config switch for model preset dedicated to Sandy reliability

### 3) Trigger false-positive review pass (high)
- Sandy detection is intentionally broad now (all languages + broad markers).
- Action:
  - run targeted manual checks in 4-5 languages to ensure non-comment false positives are acceptable
  - if too broad, keep universal behavior but tighten marker logic for specific edge cases

### 4) `lines.md` alignment with trigger taxonomy (medium)
- Trigger model now includes `largeRefactor`; script organization should reflect it clearly.
- Action:
  - audit headings and aliases
  - ensure `minorRefactor` vs `largeRefactor` have intentional distinct pools
  - remove/mark stale buckets that cannot currently fire (or annotate as future)

## Known Gaps / Future Work
- `functionFinished` remains intentionally disabled; AST-based detection still pending.
- More detector thresholds should be config-driven (currently hardcoded in a few places).
- OpenRouter response parsing may need additional formats depending on upstream model behavior.

## Guardrails For Next Agent
- Do not remove detailed Sandy debug logs until reliability is fully settled.
- Preserve backward compatibility for `cuddleCode.apiKey` fallback (mapped to `elevenlabsApiKey`).
- Keep non-destructive git behavior; do not clean/remove user scratch dirs unless explicitly asked.

## Quick Validation Checklist
- `npm run build`
- `npm test`
- Sandy scenario smoke test:
  - add comment containing sandy (mixed case, inline and standalone)
  - verify 2s debounce
  - verify debug logs show request+response
  - verify no noisy trigger spam while editing Sandy line
- VSIX sanity:
  - `npm run package:vsix`
  - inspect included tree for unwanted files

## Suggested First Task For Next Agent
Implement packaging cleanup (`.vscodeignore`) and regenerate VSIX, then report included file tree diff before/after.
