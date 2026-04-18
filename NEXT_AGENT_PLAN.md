# ASMR Coach - Next Agent Memory / Implementation Plan

## Mission
Build a calm, supportive coding companion with occasional encouragement (not noise), high-confidence triggers, and robust cache/cost behavior.

## Current Known State (from previous work)
- VS Code extension in TypeScript + esbuild.
- ElevenLabs integration with fixed voices:
  - Female: `j05EIz3iI3JmBTWC3CsA`
  - Male: `HgyIHe81F3nXywNwkraY`
- Persona routing config exists and defaults to female (`asmrCoach.voicePersona` with `female|male|mixed`).
- Audio cache exists in global storage with:
  - pre-generation command
  - clear cache command
  - cache stats command
  - blocked-entry handling for paid-plan voice errors
  - on-demand avoids retrying blocked; pre-generate retries blocked.
- Debug output channel exists and logs selected text in current flow.
- `lines.md` contains large trigger+line inventory to be fully integrated.

## Product Direction (confirmed)
1. Use high-confidence trigger detection (especially for commit/tests).
2. Encourage without annoyance:
   - Typical cadence target: once every 1-3 minutes.
   - Sometimes allow short micro-bursts of 2 messages close together (intentional, rare).
3. Add three pacing modes:
   - `debug` (most frequent)
   - `demo` (medium)
   - `normal` (least frequent/default)
   - Modes should differ by multipliers only.
4. Assistant identity: Sandy.
5. If user mentions Sandy in a comment line, Sandy responds with custom response flow.
   - Start support for Python, C++, Rust.
   - Add system prompt + dynamic response generation path (LLM), then TTS.

## TODO (must implement)
- [ ] Load all triggers/lines from `lines.md` (data-driven), not hardcoded-only logic.
- [ ] Add robust header->trigger mapping with aliases.
- [ ] Add pacing mode setting: `asmrCoach.pacingMode = debug|demo|normal`.
- [ ] Implement central scheduler with cooldown budgets and rare cluster behavior.
- [ ] Add high-confidence detectors for all feasible triggers.
- [ ] Add Sandy comment-mention detector for Python/C++/Rust comments.
- [ ] Add dynamic Sandy response generator (LLM call) + safe fallback templates.
- [ ] Keep ElevenLabs TTS/caching behavior credit-safe.
- [ ] Extend stats/debug visibility by trigger and mode.
- [ ] Add tests for parser/mapping/scheduler/detectors.

## Trigger Implementation Strategy

### A) Trigger taxonomy from `lines.md`
Primary categories include:
- pause variants (very short, short, long, very long idle warning)
- typing burst/sustained
- long line
- refactor/minor cleanup
- errors appeared/fixed
- file save/quick save
- autocomplete accepted
- adding comments
- deleting/backspace
- switching files/tabs
- cursor/navigation
- paste
- format document
- undo/redo
- function finished/code completed
- git commit
- tests passing
- late night session

### B) Confidence tiers
- High confidence (ship enabled):
  - save, tab switch, diagnostics appear/fix, paste, undo/redo, format, burst/sustained/idle by telemetry windows.
- Medium confidence (ship but throttled harder):
  - single-line tweak, minor refactor, comment addition, long line.
- Strict-only (explicitly required):
  - `git commit`, `tests passing`.
  - Fire only when command/output signals are explicit and unambiguous.
  - No fuzzy guessing.

## Cadence and Feel Design

### Pacing modes (multipliers only)
Define base timing profile (`normal`) and multiply all cooldowns/threshold gaps:

- `normal` multiplier = `1.0`
  - Goal: ~1 message per 60-180s average under active work.
- `demo` multiplier = `0.45`
  - Noticeably livelier but still controlled.
- `debug` multiplier = `0.2`
  - High-frequency for testing.

Apply multiplier to:
- global min gap
- per-trigger cooldowns
- cluster lockout windows

### Non-annoyance scheduler
Use a central message governor:
- Global token budget:
  - regen ~1 token / 90s (normal), cap 2 tokens.
  - each spoken line costs 1 token.
- Hard min interval:
  - e.g., 50-70s normal after any utterance.
- Priority queue:
  - `error_fixed`, `tests_passed`, `commit` > `sustained`, `long_line` > micro-events.
- Trigger dedupe:
  - same trigger cannot fire again until its own cooldown expires.
- Quiet windows for noisy trigger classes:
  - save/autocomplete/navigation need much longer cooldowns.
- Rare micro-cluster rule:
  - if high-value positive event occurs (e.g., refactor + tests pass),
    allow one follow-up line within 10-20s,
    then enforce extended silence (e.g., +4-6 min lockout).
  - max 1 cluster every 20-30 min in normal mode.

## Data-Driven Scripts

### Parser requirements
- Parse `lines.md` sections by heading (`# ...`).
- Normalize punctuation and Unicode apostrophes.
- Map headings to internal trigger IDs via alias table.
- Keep unknown headings logged (do not crash).

### Fallback behavior
- If a trigger has no loaded lines, fallback to nearest compatible bucket.
- If file parsing fails entirely, fallback to bundled hardcoded script bank.

## Sandy Identity Feature

### Detection
- Watch text edits for comment lines containing `sandy` (case-insensitive).
- Language starters:
  - Python: `# ...`
  - C++: `// ...`, `/* ... */`
  - Rust: `// ...`, `/// ...`, `/* ... */`

### Response flow
1. Detect mention event (high confidence: explicit comment token + name).
2. Build contextual prompt payload (small local context, no full-file dump).
3. Send to LLM for custom short supportive response.
4. TTS with selected persona/voice.
5. Cache by normalized prompt fingerprint where possible.
6. Respect scheduler and cooldown policies.

### System prompt draft (for LLM)
- Persona: Sandy, warm, concise, playful but respectful.
- Output constraints:
  - 1 short sentence, <= 20 words.
  - avoid explicit sexual content unless project mode allows it.
  - never mention policy/system details.
  - encourage focus, confidence, or small next step.
- Language-aware style:
  - if Python/C++/Rust detected, optionally include tiny language nod.

### API wiring
- Keep TTS on ElevenLabs.
- Add optional `asmrCoach.llmProvider` + `asmrCoach.llmApiKey`.
- If LLM unavailable, use deterministic template fallback:
  - "I am here, keep going - you have got this."

## Strict Trigger Specs (high confidence)

### Git commit
Fire only when one of:
- explicit command event indicates commit command succeeded.
- optional terminal integration sees known success signatures.

Avoid firing on mere staged changes.

### Tests passing
Fire only when:
- explicit command result indicates success (exit code + recognizable test success summary).

No heuristic from random green text alone.

## Observability and Commands
- Keep existing commands.
- Add:
  - `ASMR Coach: Show Trigger Health` (counts by trigger fired/skipped reason).
  - `ASMR Coach: Simulate Trigger` (dry-run text selection without TTS).
- Ensure debug logs always include:
  - trigger id, confidence, selected line, persona, cache hit/miss, skip reason, mode.

## Testing Plan
- Unit tests:
  - lines parser + alias mapping.
  - scheduler governor (tokens, cooldown, cluster constraints).
  - trigger detectors for core event types.
- Integration smoke:
  - run each command + confirm logs.
  - verify pre-generate retries blocked entries.
  - verify on-demand never retries blocked entries.
- UX acceptance:
  - in normal mode, sustained coding session should feel sparse, supportive, not chatty.

## Acceptance Criteria
- All `lines.md` sections mapped or explicitly reported as unsupported.
- Normal mode cadence feels occasional (~1-3 min average under active typing).
- Debug/demo/normal differ only by multipliers and are easy to switch.
- Sandy mention in Python/C++/Rust comments triggers custom response path.
- Commit/tests triggers are high-confidence only.
- Cache-safe behavior preserved; no unnecessary regeneration.

## Open Decisions for Product Owner
1. Content boundary: allow current suggestive tone globally, or add `toneLevel` (`safe|spicy`)?
2. LLM provider choice for Sandy custom responses (OpenAI/Anthropic/local)?
3. Should Sandy mention trigger bypass normal cooldown once per N minutes, or always obey scheduler?
