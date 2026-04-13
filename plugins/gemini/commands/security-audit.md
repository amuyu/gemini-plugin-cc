---
description: Run a security audit of the entire codebase using Gemini
argument-hint: ''
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Run a comprehensive security audit using Gemini.

Core constraint:
- This command is audit-only.
- Do not modify any files.
- Return Gemini's output verbatim to the user.

Execution:
- Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" security-audit "$ARGUMENTS"
```
- Return the command stdout verbatim, exactly as-is.
- Do not paraphrase, summarize, or add commentary before or after it.

If the companion script exits with a non-zero code:
- Show the stderr output to the user.
- If the message mentions gemini CLI not installed, tell the user: "gemini CLI가 필요합니다. `npm install -g @google/gemini-cli` 로 설치하고 `gemini auth login` 으로 인증하세요."
