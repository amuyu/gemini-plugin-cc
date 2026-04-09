---
description: Run a Gemini code review against current git changes
argument-hint: '[--base <ref>]'
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(git:*)
---

Run a Gemini review through the companion script.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraint:
- This command is review-only.
- Do not fix issues, apply patches, or suggest that you are about to make changes.
- Your only job is to run the review and return Gemini's output verbatim to the user.

Execution:
- Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" review $ARGUMENTS
```
- Return the command stdout verbatim, exactly as-is.
- Do not paraphrase, summarize, or add commentary before or after it.
- Do not fix any issues mentioned in the review output.

If the companion script exits with a non-zero code:
- Show the stderr output to the user.
- If the message mentions gemini CLI not installed, tell the user: "gemini CLI가 필요합니다. `npm install -g @google/gemini-cli` 로 설치하고 `gemini auth login` 으로 인증하세요."
