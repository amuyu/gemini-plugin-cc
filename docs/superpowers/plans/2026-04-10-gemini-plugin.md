# Gemini Plugin for Claude Code — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude Code 플러그인을 만들어 Gemini CLI로 코드 리뷰 및 분석을 할 수 있게 한다.

**Architecture:** `gemini-companion.mjs` 스크립트가 Gemini CLI 호출을 담당하고, 각 명령어 `.md` 파일이 Claude에게 동작을 지시한다. `git diff`를 stdin으로 Gemini CLI에 파이핑하거나 (`review`), `--approval-mode plan`으로 저장소 전체를 읽어 분석한다 (`fullrepo-review`, `architecture`, `security-audit`).

**Tech Stack:** Node.js (ESM), Gemini CLI (`@google/gemini-cli`), Git

---

## 파일 구조

| 파일 | 역할 |
|------|------|
| `package.json` | 패키지 메타데이터, Node.js 엔진 요구사항 |
| `.gitignore` | node_modules 등 제외 |
| `.claude-plugin/marketplace.json` | Claude Code 마켓플레이스 메타데이터 |
| `plugins/gemini/scripts/gemini-companion.mjs` | Gemini CLI 래퍼 스크립트 (핵심 로직) |
| `plugins/gemini/commands/review.md` | `/gemini:review` 명령어 지시문 |
| `plugins/gemini/commands/fullrepo-review.md` | `/gemini:fullrepo-review` 명령어 지시문 |
| `plugins/gemini/commands/architecture.md` | `/gemini:architecture` 명령어 지시문 |
| `plugins/gemini/commands/security-audit.md` | `/gemini:security-audit` 명령어 지시문 |
| `tests/gemini-companion.test.mjs` | companion 스크립트 단위 테스트 |
| `README.md` | 사용자 문서 |

---

## Task 1: 프로젝트 초기화

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: git 저장소 초기화**

```bash
cd /Users/amuyu/private/work/ai/claude-code-plugin/gemini-plugin-cc
git init
```

Expected: `Initialized empty Git repository in .../gemini-plugin-cc/.git/`

- [ ] **Step 2: package.json 작성**

Create `package.json`:

```json
{
  "name": "@google/gemini-plugin-cc",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Use Gemini from Claude Code for code review and codebase analysis.",
  "license": "Apache-2.0",
  "engines": {
    "node": ">=18.18.0"
  },
  "scripts": {
    "test": "node --test tests/*.test.mjs"
  }
}
```

- [ ] **Step 3: .gitignore 작성**

Create `.gitignore`:

```
node_modules/
.DS_Store
*.log
```

- [ ] **Step 4: 커밋**

```bash
git add package.json .gitignore
git commit -m "chore: initialize project"
```

Expected: `[main (root-commit) ...] chore: initialize project`

---

## Task 2: 플러그인 메타데이터

**Files:**
- Create: `.claude-plugin/marketplace.json`

- [ ] **Step 1: .claude-plugin 디렉토리 및 marketplace.json 작성**

Create `.claude-plugin/marketplace.json`:

```json
{
  "name": "google-gemini",
  "owner": {
    "name": "Google"
  },
  "metadata": {
    "description": "Gemini plugin for Claude Code — code review and codebase analysis.",
    "version": "0.1.0"
  },
  "plugins": [
    {
      "name": "gemini",
      "description": "Use Gemini from Claude Code for code review and codebase analysis.",
      "version": "0.1.0",
      "author": {
        "name": "Google"
      },
      "source": "./plugins/gemini"
    }
  ]
}
```

- [ ] **Step 2: 커밋**

```bash
git add .claude-plugin/marketplace.json
git commit -m "chore: add plugin marketplace metadata"
```

---

## Task 3: companion 스크립트 — 핵심 구조 및 바이너리 체크

**Files:**
- Create: `plugins/gemini/scripts/gemini-companion.mjs`
- Create: `tests/gemini-companion.test.mjs`

- [ ] **Step 1: 테스트 파일 작성 (바이너리 체크 테스트)**

Create `tests/gemini-companion.test.mjs`:

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPANION = path.resolve(__dirname, "../plugins/gemini/scripts/gemini-companion.mjs");

describe("gemini-companion", () => {
  describe("unknown subcommand", () => {
    it("exits with code 1 and prints usage", () => {
      let threw = false;
      try {
        execFileSync("node", [COMPANION, "unknown-cmd"], { encoding: "utf8", stdio: "pipe" });
      } catch (err) {
        threw = true;
        assert.equal(err.status, 1);
        assert.match(err.stderr, /Unknown subcommand/);
      }
      assert.ok(threw, "should have thrown");
    });
  });

  describe("no subcommand", () => {
    it("exits with code 1 and prints usage", () => {
      let threw = false;
      try {
        execFileSync("node", [COMPANION], { encoding: "utf8", stdio: "pipe" });
      } catch (err) {
        threw = true;
        assert.equal(err.status, 1);
        assert.match(err.stderr, /Usage/);
      }
      assert.ok(threw, "should have thrown");
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd /Users/amuyu/private/work/ai/claude-code-plugin/gemini-plugin-cc
npm test
```

Expected: FAIL — "Cannot find module" 또는 파일 없음 에러

- [ ] **Step 3: companion 스크립트 핵심 구조 작성**

Create `plugins/gemini/scripts/gemini-companion.mjs`:

```javascript
#!/usr/bin/env node

import { spawn, execFileSync } from "node:child_process";
import process from "node:process";

// ─── Gemini CLI 가용성 체크 ───────────────────────────────────────────────

export function checkGeminiAvailable() {
  try {
    execFileSync("which", ["gemini"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ─── Git diff 수집 ────────────────────────────────────────────────────────

export function collectGitDiff(base) {
  if (base) {
    return execFileSync("git", ["diff", `${base}...HEAD`], { encoding: "utf8" });
  }
  const staged = execFileSync("git", ["diff", "--cached"], { encoding: "utf8" });
  const unstaged = execFileSync("git", ["diff"], { encoding: "utf8" });
  return staged + unstaged;
}

// ─── Gemini CLI 실행 ──────────────────────────────────────────────────────

export function runGemini(prompt, input) {
  return new Promise((resolve, reject) => {
    const args = ["-p", prompt, "--approval-mode", "plan"];
    const child = spawn("gemini", args, {
      stdio: ["pipe", "inherit", "inherit"]
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();

    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`gemini exited with code ${code}`));
      } else {
        resolve();
      }
    });

    child.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(new Error("gemini CLI를 찾을 수 없습니다."));
      } else {
        reject(err);
      }
    });
  });
}

// ─── 프롬프트 ─────────────────────────────────────────────────────────────

export const PROMPTS = {
  review: `You are a senior code reviewer. Review the following git diff carefully.
Focus on: bugs, security issues, performance problems, and code quality.
Be specific and actionable. Format your output clearly with sections.

Here is the diff to review:`,

  fullrepoReview: `You are a senior code reviewer. Review the entire codebase in the current directory.
Use your file reading tools to explore all source files. Focus on: code quality, architecture, bugs, and improvement opportunities.
Be specific and actionable. Provide a structured report.`,

  architecture: `You are a software architect. Analyze the entire codebase in the current directory.
Use your file reading tools to explore all source files. Provide a comprehensive analysis of:
- Overall architecture and design patterns used
- Module structure and dependencies between components
- Data flow and component interactions
- Strengths of the current design
- Concrete improvement recommendations
Be specific with file and line references where relevant.`,

  securityAudit: `You are a security expert. Perform a thorough security audit of the entire codebase in the current directory.
Use your file reading tools to explore all source files. Check for:
- OWASP Top 10 vulnerabilities
- Hardcoded secrets, credentials, or API keys
- Insecure data handling or storage
- Authentication and authorization issues
- Input validation and sanitization problems
- Dangerous coding patterns (eval, exec, SQL injection, XSS, etc.)
Rate each finding by severity: Critical / High / Medium / Low.
For each finding provide: location, description, and remediation steps.`,
};

// ─── 메인 ─────────────────────────────────────────────────────────────────

function printUsage() {
  process.stderr.write(
    [
      "Usage:",
      "  node gemini-companion.mjs review [--base <ref>]",
      "  node gemini-companion.mjs fullrepo-review",
      "  node gemini-companion.mjs architecture",
      "  node gemini-companion.mjs security-audit",
    ].join("\n") + "\n"
  );
}

async function main() {
  const [, , subcommand, ...args] = process.argv;

  if (!subcommand) {
    printUsage();
    process.exit(1);
  }

  if (!checkGeminiAvailable()) {
    process.stderr.write(
      [
        "gemini CLI가 설치되지 않았습니다.",
        "설치: npm install -g @google/gemini-cli",
        "설치 후 인증: gemini auth login",
      ].join("\n") + "\n"
    );
    process.exit(1);
  }

  switch (subcommand) {
    case "review": {
      const baseIndex = args.indexOf("--base");
      const base = baseIndex !== -1 ? args[baseIndex + 1] : null;

      let diff;
      try {
        diff = collectGitDiff(base);
      } catch (err) {
        process.stderr.write(`git diff 수집 실패: ${err.message}\n`);
        process.exit(1);
      }

      if (!diff.trim()) {
        process.stdout.write("리뷰할 변경사항이 없습니다.\n");
        process.exit(0);
      }

      await runGemini(PROMPTS.review, diff);
      break;
    }

    case "fullrepo-review":
      await runGemini(PROMPTS.fullrepoReview, null);
      break;

    case "architecture":
      await runGemini(PROMPTS.architecture, null);
      break;

    case "security-audit":
      await runGemini(PROMPTS.securityAudit, null);
      break;

    default:
      process.stderr.write(`Unknown subcommand: ${subcommand}\n`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
npm test
```

Expected: PASS — 2 tests pass

- [ ] **Step 5: 커밋**

```bash
git add plugins/gemini/scripts/gemini-companion.mjs tests/gemini-companion.test.mjs
git commit -m "feat: add gemini-companion core structure and binary check"
```

---

## Task 4: companion 스크립트 — review 서브커맨드 테스트 보강

**Files:**
- Modify: `tests/gemini-companion.test.mjs`

- [ ] **Step 1: git diff 수집 로직 테스트 추가**

Append to `tests/gemini-companion.test.mjs` (기존 import 아래에 추가):

```javascript
import { collectGitDiff, PROMPTS, checkGeminiAvailable } from "../plugins/gemini/scripts/gemini-companion.mjs";

describe("collectGitDiff", () => {
  it("returns combined staged and unstaged diff when no base given", () => {
    // 현재 디렉토리가 git repo이므로 에러 없이 실행됨 (빈 문자열이어도 ok)
    const result = collectGitDiff(null);
    assert.equal(typeof result, "string");
  });

  it("throws when invalid base ref given", () => {
    let threw = false;
    try {
      collectGitDiff("nonexistent-branch-xyz-123");
    } catch {
      threw = true;
    }
    assert.ok(threw, "should have thrown for invalid base ref");
  });
});

describe("PROMPTS", () => {
  it("review prompt mentions diff", () => {
    assert.match(PROMPTS.review, /diff/i);
  });

  it("securityAudit prompt mentions OWASP", () => {
    assert.match(PROMPTS.securityAudit, /OWASP/);
  });

  it("architecture prompt mentions dependencies", () => {
    assert.match(PROMPTS.architecture, /dependenc/i);
  });
});

describe("checkGeminiAvailable", () => {
  it("returns a boolean", () => {
    const result = checkGeminiAvailable();
    assert.equal(typeof result, "boolean");
  });
});
```

- [ ] **Step 2: 테스트 실행 — 통과 확인**

```bash
npm test
```

Expected: PASS — 모든 테스트 통과

- [ ] **Step 3: 커밋**

```bash
git add tests/gemini-companion.test.mjs
git commit -m "test: add unit tests for collectGitDiff and PROMPTS"
```

---

## Task 5: 명령어 파일 — `/gemini:review`

**Files:**
- Create: `plugins/gemini/commands/review.md`

- [ ] **Step 1: review.md 작성**

Create `plugins/gemini/commands/review.md`:

```markdown
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
```

- [ ] **Step 2: 커밋**

```bash
git add plugins/gemini/commands/review.md
git commit -m "feat: add /gemini:review command"
```

---

## Task 6: 명령어 파일 — `/gemini:fullrepo-review`

**Files:**
- Create: `plugins/gemini/commands/fullrepo-review.md`

- [ ] **Step 1: fullrepo-review.md 작성**

Create `plugins/gemini/commands/fullrepo-review.md`:

```markdown
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
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" fullrepo-review
```
- Return the command stdout verbatim, exactly as-is.
- Do not paraphrase, summarize, or add commentary before or after it.

If the companion script exits with a non-zero code:
- Show the stderr output to the user.
- If the message mentions gemini CLI not installed, tell the user: "gemini CLI가 필요합니다. `npm install -g @google/gemini-cli` 로 설치하고 `gemini auth login` 으로 인증하세요."
```

- [ ] **Step 2: 커밋**

```bash
git add plugins/gemini/commands/fullrepo-review.md
git commit -m "feat: add /gemini:fullrepo-review command"
```

---

## Task 7: 명령어 파일 — `/gemini:architecture` 및 `/gemini:security-audit`

**Files:**
- Create: `plugins/gemini/commands/architecture.md`
- Create: `plugins/gemini/commands/security-audit.md`

- [ ] **Step 1: architecture.md 작성**

Create `plugins/gemini/commands/architecture.md`:

```markdown
---
description: Analyze the entire codebase architecture using Gemini's long context window
argument-hint: ''
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Run a full codebase architecture analysis using Gemini.

Core constraint:
- This command is analysis-only.
- Do not modify any files.
- Return Gemini's output verbatim to the user.

Execution:
- Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" architecture
```
- Return the command stdout verbatim, exactly as-is.
- Do not paraphrase, summarize, or add commentary before or after it.

If the companion script exits with a non-zero code:
- Show the stderr output to the user.
- If the message mentions gemini CLI not installed, tell the user: "gemini CLI가 필요합니다. `npm install -g @google/gemini-cli` 로 설치하고 `gemini auth login` 으로 인증하세요."
```

- [ ] **Step 2: security-audit.md 작성**

Create `plugins/gemini/commands/security-audit.md`:

```markdown
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
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" security-audit
```
- Return the command stdout verbatim, exactly as-is.
- Do not paraphrase, summarize, or add commentary before or after it.

If the companion script exits with a non-zero code:
- Show the stderr output to the user.
- If the message mentions gemini CLI not installed, tell the user: "gemini CLI가 필요합니다. `npm install -g @google/gemini-cli` 로 설치하고 `gemini auth login` 으로 인증하세요."
```

- [ ] **Step 3: 커밋**

```bash
git add plugins/gemini/commands/architecture.md plugins/gemini/commands/security-audit.md
git commit -m "feat: add /gemini:architecture and /gemini:security-audit commands"
```

---

## Task 8: README 작성

**Files:**
- Create: `README.md`

- [ ] **Step 1: README.md 작성**

Create `README.md`:

```markdown
# Gemini plugin for Claude Code

Use Gemini from inside Claude Code for code reviews and codebase analysis.

This plugin brings Gemini's long context window (1M tokens) to your Claude Code workflow,
enabling full-repository analysis that goes beyond diff-only reviews.

## What You Get

- `/gemini:review` — current changes (git diff) code review
- `/gemini:fullrepo-review` — full repository code review using Gemini's long context
- `/gemini:architecture` — codebase architecture analysis
- `/gemini:security-audit` — security audit based on OWASP Top 10

## Requirements

- **Google account or Gemini API key**
- **Gemini CLI installed:** `npm install -g @google/gemini-cli`
- **Authenticated:** `gemini auth login`
- **Node.js 18.18 or later**

## Install

Add the marketplace in Claude Code:

```bash
/plugin marketplace add google/gemini-plugin-cc
```

Install the plugin:

```bash
/plugin install gemini@google-gemini
```

Reload plugins:

```bash
/reload-plugins
```

## Usage

### `/gemini:review`

Reviews your current git changes (staged + unstaged).

```bash
/gemini:review
/gemini:review --base main
```

### `/gemini:fullrepo-review`

Reviews the entire codebase using Gemini's long context window. Gemini reads all source files and provides a structured report.

```bash
/gemini:fullrepo-review
```

### `/gemini:architecture`

Analyzes the codebase architecture: design patterns, module dependencies, data flow, and improvement recommendations.

```bash
/gemini:architecture
```

### `/gemini:security-audit`

Performs a security audit: OWASP Top 10, hardcoded secrets, insecure patterns. Each finding is rated Critical/High/Medium/Low with remediation steps.

```bash
/gemini:security-audit
```

## How It Works

The plugin uses your locally installed `gemini` CLI binary. All analysis runs on your machine with your Gemini authentication.

- `review` — pipes `git diff` output to Gemini via stdin
- `fullrepo-review`, `architecture`, `security-audit` — runs Gemini in `--approval-mode plan` (read-only) so it explores your codebase using its file reading tools without making any changes
```

- [ ] **Step 2: 커밋**

```bash
git add README.md
git commit -m "docs: add README"
```

---

## Task 9: 최종 검증

- [ ] **Step 1: 전체 테스트 실행**

```bash
npm test
```

Expected: 모든 테스트 PASS

- [ ] **Step 2: 파일 구조 확인**

```bash
find . -not -path './.git/*' -not -name '.DS_Store' | sort
```

Expected output:
```
.
./.claude-plugin
./.claude-plugin/marketplace.json
./.gitignore
./docs
./docs/superpowers
./docs/superpowers/plans
./docs/superpowers/plans/2026-04-10-gemini-plugin.md
./docs/superpowers/specs
./docs/superpowers/specs/2026-04-10-gemini-plugin-design.md
./package.json
./plugins
./plugins/gemini
./plugins/gemini/commands
./plugins/gemini/commands/architecture.md
./plugins/gemini/commands/fullrepo-review.md
./plugins/gemini/commands/review.md
./plugins/gemini/commands/security-audit.md
./plugins/gemini/scripts
./plugins/gemini/scripts/gemini-companion.mjs
./README.md
./tests
./tests/gemini-companion.test.mjs
```

- [ ] **Step 3: companion 스크립트 수동 스모크 테스트**

```bash
node plugins/gemini/scripts/gemini-companion.mjs unknown-cmd 2>&1
```

Expected: exit code 1, "Unknown subcommand" 메시지 출력

- [ ] **Step 4: 최종 커밋**

```bash
git add docs/
git commit -m "docs: add design spec and implementation plan"
```
