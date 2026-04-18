# Cuddle Code - Plan Update

This update records every fix request from the product owner, including items believed solved and items still requiring verification.

## Requested Fixes (Complete List)

1. Keep spicy tone globally and do not make it configurable.
2. Use OpenAI as provider for Sandy responses.
3. Sandy should always reply.
4. Pacing modes felt too fast; slow them down.
5. Continue implementation after pacing changes.
6. Cursor navigation was spamming logs.
7. Metrics behaved badly when focus was in output/non-code panes.
8. Enter key triggered false `singleLineEdit`.
9. Pacing later felt too slow; speed it up again.
10. Enter key also triggered false `pasteAction`.
11. Logging expectation: show candidate and then only skipped/triggered outcomes (decision-focused visibility).
12. Only 48 voice lines available despite many in `lines.md`.
13. Add todo: fetched (non-cached) voice playback can be cut off.
14. `singleLineEdit` still fired when typing and then backspacing.
15. Rename project to **Cuddle Code**.
16. Remove remaining mentions of ASMR/asmr.

## Implementation Status Snapshot

### Completed / Implemented

- Spicy tone kept global (no tone-level setting introduced).
- Sandy provider path wired to OpenAI.
- Sandy mention path set to always respond (with fallback line if LLM unavailable/error).
- Scheduler/pacing was tuned multiple times based on feedback.
- Cursor navigation trigger was throttled and deduped.
- Tracking guards added to avoid noisy behavior in non-trackable editor contexts.
- Enter false positives fixed for `singleLineEdit` and `pasteAction`.
- Backspace/delete-only path no longer counts as `singleLineEdit`.
- Logging shape changed to decision-focused flow from the responder path.
- `lines.md` loading path corrected to avoid fallback-only line count.
- Project branding renamed to Cuddle Code.
- ASMR/asmr mentions removed from source/docs/config namespace where requested.

### In Progress / Needs Follow-Up Verification

- **Fetched voice playback cut-off** (non-cached path) remains an active investigation item and should stay tracked as high priority until verified fixed in real playback.

## Verification Checklist (Recommended)

1. Run a fresh Extension Host session and confirm command palette entries show `Cuddle Code: ...`.
2. Confirm settings keys are under `cuddleCode.*`.
3. Confirm `lines.md` load stats indicate full parsed content (not fallback-sized bank).
4. Validate Enter key does not emit `singleLineEdit` or `pasteAction` candidates.
5. Validate delete-only edits emit delete behavior and not `singleLineEdit`.
6. Validate cursor navigation does not spam while moving around quickly.
7. Validate behavior is quiet/stable when output panel is focused.
8. Validate Sandy mention in Python/C++/Rust comments generates a response.
9. Validate uncached TTS playback end-to-end and specifically check for audio truncation.

## Notes

- Because config namespace moved from `asmrCoach.*` to `cuddleCode.*`, existing user settings may need migration/manual copy in local VS Code settings.
- Audio start clipping (missing first syllables) was traced to headset/soundcard power-saving wake behavior, not `ffplay` or extension caching logic. Keep this as first troubleshooting check for future playback-cutoff reports.
- Added optional `cuddleCode.audioKeepAlive` setting to emit imperceptible pulses every second (via ffplay) to keep audio path awake when needed.
