# Design: `--ko` Flag for Korean Responses

**Date:** 2026-04-13  
**Status:** Approved

## Overview

Add a `--ko` flag to all four Gemini plugin commands so users can request Korean-language responses from Gemini. Passing `--ko` appends a Korean language instruction to the Gemini prompt.

## Affected Commands

| Command | File | `$ARGUMENTS` already passed? |
|---|---|---|
| `review` | `commands/review.md` | Yes — no change needed |
| `fullrepo-review` | `commands/fullrepo-review.md` | No — must add `"$ARGUMENTS"` |
| `architecture` | `commands/architecture.md` | No — must add `"$ARGUMENTS"` |
| `security-audit` | `commands/security-audit.md` | No — must add `"$ARGUMENTS"` |

## Changes

### 1. `plugins/gemini/scripts/gemini-companion.mjs`

In `main()`, parse `--ko` from args independently per subcommand:

- Extract `--ko` from the args array (remove it so it doesn't interfere with other flag parsing).
- If `--ko` is present, append `"\n\nRespond entirely in Korean."` to the prompt before calling `runGemini`.
- For `review`, `--ko` must be extracted before `--base` parsing so neither flag interferes with the other.
- For all other subcommands (`fullrepo-review`, `architecture`, `security-audit`), args currently unused — add `--ko` extraction from the new args passed in.

### 2. `commands/fullrepo-review.md`, `commands/architecture.md`, `commands/security-audit.md`

Update the `node` invocation line to forward `$ARGUMENTS`:

```bash
# Before
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" <subcommand>

# After
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" <subcommand> "$ARGUMENTS"
```

### 3. `tests/gemini-companion.test.mjs`

Add test cases for `--ko` flag parsing:
- `review --ko` → prompt includes Korean instruction
- `review --base main --ko` → base parsed correctly, Korean instruction appended
- `review --ko --base main` → same as above (order-independent)
- `fullrepo-review --ko` → Korean instruction appended
- `architecture --ko` → Korean instruction appended
- `security-audit --ko` → Korean instruction appended

## Data Flow

```
User: /review --base main --ko
  → review.md passes "$ARGUMENTS" = "--base main --ko" to script
  → gemini-companion.mjs:
      ko = true  (--ko extracted and removed from args)
      base = "main"
      prompt = PROMPTS.review + "\n\nRespond entirely in Korean."
  → Gemini outputs in Korean
```

## Edge Cases

- `--ko` may appear at any position in the arguments.
- Unknown flags are ignored (existing behavior unchanged).
- `--ko` without other arguments works for all commands.

## Non-Goals

- No `--lang <code>` generalization (YAGNI).
- No changes to error messages or help text beyond what's needed.
