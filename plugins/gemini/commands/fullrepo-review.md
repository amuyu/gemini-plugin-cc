---
description: Run a Gemini review of the entire codebase using Gemini's long context window
argument-hint: ''
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Run a full repository review using Gemini's long context window.

Core constraint:
- This command is review-only.
- Do not fix issues, apply patches, or suggest that you are about to make changes.
- Your only job is to run the review and return Gemini's output verbatim to the user.

Execution:
- Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" fullrepo-review "$ARGUMENTS"
```
- Return the command stdout verbatim, exactly as-is.
- Do not paraphrase, summarize, or add commentary before or after it.

If the companion script exits with a non-zero code:
- Show the stderr output to the user.
- If the message mentions gemini CLI not installed, tell the user: "gemini CLI가 필요합니다. `npm install -g @google/gemini-cli` 로 설치하고 `gemini auth login` 으로 인증하세요."
