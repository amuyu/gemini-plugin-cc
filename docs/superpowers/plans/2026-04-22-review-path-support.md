# Review Path Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/gemini:review`에 positional path 인수를 추가해 파일/폴더를 직접 리뷰할 수 있게 한다.

**Architecture:** `gemini-companion.mjs`의 `main()`에서 인수 검증을 `checkGeminiAvailable()` 이전에 수행하도록 재구성한다. `review` case는 `--base` 추출 후 남은 positional args를 경로 목록으로 간주하고, 경로가 있으면 `PROMPTS.pathReview(paths)`로 Gemini가 직접 파일을 읽게 하고 없으면 기존 git diff 흐름을 탄다. paths + `--base` 동시 사용은 에러로 처리한다.

**Tech Stack:** Node.js (ESM), Gemini CLI

---

## File Map

| 파일 | 역할 |
|---|---|
| `plugins/gemini/scripts/gemini-companion.mjs` | PROMPTS 추가, main() 재구성, review case 분기 로직 추가 |
| `plugins/gemini/commands/review.md` | argument-hint 업데이트 |
| `tests/gemini-companion.test.mjs` | 새 동작 단위 테스트 + subprocess 테스트 추가 |

---

### Task 1: PROMPTS.pathReview 추가 및 테스트

**Files:**
- Modify: `plugins/gemini/scripts/gemini-companion.mjs`
- Modify: `tests/gemini-companion.test.mjs`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/gemini-companion.test.mjs`의 `describe("PROMPTS", ...)` 블록에 다음을 추가한다:

```js
it("pathReview is a function", () => {
  assert.equal(typeof PROMPTS.pathReview, "function");
});

it("pathReview includes given paths in output", () => {
  const result = PROMPTS.pathReview(["src/utils/", "src/api.js"]);
  assert.match(result, /src\/utils\//);
  assert.match(result, /src\/api\.js/);
});

it("pathReview includes review instructions", () => {
  const result = PROMPTS.pathReview(["src/"]);
  assert.match(result, /code reviewer/i);
  assert.match(result, /file reading tools/i);
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
node --test tests/gemini-companion.test.mjs 2>&1 | head -40
```

Expected: `pathReview` 관련 테스트 FAIL (PROMPTS.pathReview is undefined)

- [ ] **Step 3: PROMPTS.pathReview 추가**

`plugins/gemini/scripts/gemini-companion.mjs`의 `PROMPTS` 객체에 다음을 추가한다 (`review` 키 바로 뒤):

```js
pathReview: (paths) =>
  `You are a senior code reviewer. Review the following paths:\n${paths.join("\n")}\n\nUse your file reading tools to read and analyze these files and directories.\nFocus on: bugs, security issues, performance problems, and code quality.\nBe specific and actionable. Format your output clearly with sections.`,
```

> `pathReview`는 함수(`(paths: string[]) => string`)다. 문자열이 아니다.

- [ ] **Step 4: 테스트 실행해서 통과 확인**

```bash
node --test tests/gemini-companion.test.mjs 2>&1 | head -40
```

Expected: 모든 PROMPTS 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add plugins/gemini/scripts/gemini-companion.mjs tests/gemini-companion.test.mjs
git commit -m "feat: add PROMPTS.pathReview for file/folder review"
```

---

### Task 2: main() 재구성 — 인수 검증을 gemini 체크 앞으로 이동

현재 `main()`은 `checkGeminiAvailable()` → 인수 파싱 순서로 실행되어, gemini가 설치된 환경에서 인수만 검증하는 subprocess 테스트가 hang된다. 인수 검증을 먼저 수행하도록 재구성한다.

**Files:**
- Modify: `plugins/gemini/scripts/gemini-companion.mjs`
- Modify: `tests/gemini-companion.test.mjs`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/gemini-companion.test.mjs`에 새 describe 블록을 추가한다:

```js
describe("review paths + --base conflict", () => {
  it("exits with code 1 when paths and --base are both given", () => {
    let threw = false;
    try {
      execFileSync("node", [COMPANION, "review", "src/", "--base", "main"], {
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch (err) {
      threw = true;
      assert.equal(err.status, 1);
      assert.match(err.stderr, /--base와 경로는 함께 사용할 수 없습니다/);
    }
    assert.ok(threw, "should have thrown");
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
node --test tests/gemini-companion.test.mjs 2>&1 | head -40
```

Expected: 새 테스트 FAIL 또는 hang (gemini 설치 여부에 따라)

- [ ] **Step 3: main() 재구성**

`plugins/gemini/scripts/gemini-companion.mjs`의 `main()` 함수 전체를 다음으로 교체한다:

```js
async function main() {
  const [, , subcommand, ...args] = process.argv;

  if (!subcommand) {
    printUsage();
    process.exit(1);
  }

  const { ko, remaining: afterKo } = extractKoFlag(args);
  const { model, remaining: parsedArgs } = extractModelFlag(afterKo);

  // ── review 인수를 gemini 체크 전에 파싱/검증 ──────────────────────────
  let reviewBase = null;
  let reviewPaths = [];

  if (subcommand === "review") {
    const baseIndex = parsedArgs.indexOf("--base");
    const baseValue = parsedArgs[baseIndex + 1];
    if (baseIndex !== -1 && (!baseValue || baseValue.startsWith("--"))) {
      process.stderr.write("--base requires a ref argument\n");
      process.exit(1);
    }
    reviewBase = baseIndex !== -1 ? baseValue : null;
    reviewPaths =
      baseIndex !== -1
        ? [...parsedArgs.slice(0, baseIndex), ...parsedArgs.slice(baseIndex + 2)]
        : [...parsedArgs];

    if (reviewPaths.length > 0 && reviewBase) {
      process.stderr.write("--base와 경로는 함께 사용할 수 없습니다\n");
      process.exit(1);
    }
  }

  // ── Gemini CLI 가용성 체크 ──────────────────────────────────────────────
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
      // 경로 기반 리뷰
      if (reviewPaths.length > 0) {
        const basePrompt = PROMPTS.pathReview(reviewPaths);
        const pathPrompt = ko
          ? basePrompt + "\n\nRespond entirely in Korean."
          : basePrompt;
        await runGemini(pathPrompt, null, { model });
        break;
      }

      // git diff 리뷰 (기존 동작)
      let diff;
      try {
        diff = collectGitDiff(reviewBase);
      } catch (err) {
        process.stderr.write(`git diff 수집 실패: ${err.message}\n`);
        process.exit(1);
      }

      if (!diff.trim()) {
        process.stdout.write(
          "리뷰할 변경사항이 없습니다.\n" +
            "브랜치 전체를 리뷰하려면 --base 옵션으로 비교 기준 브랜치를 지정하세요.\n" +
            "예: /gemini:review --base main\n"
        );
        process.exit(0);
      }

      const reviewPrompt = ko
        ? PROMPTS.review + "\n\nRespond entirely in Korean."
        : PROMPTS.review;
      await runGemini(reviewPrompt, diff, { model });
      break;
    }

    case "fullrepo-review": {
      const fullrepoPrompt = ko
        ? PROMPTS.fullrepoReview + "\n\nRespond entirely in Korean."
        : PROMPTS.fullrepoReview;
      await runGemini(fullrepoPrompt, null, { model });
      break;
    }

    case "architecture": {
      const archPrompt = ko
        ? PROMPTS.architecture + "\n\nRespond entirely in Korean."
        : PROMPTS.architecture;
      await runGemini(archPrompt, null, { model });
      break;
    }

    case "security-audit": {
      const auditPrompt = ko
        ? PROMPTS.securityAudit + "\n\nRespond entirely in Korean."
        : PROMPTS.securityAudit;
      await runGemini(auditPrompt, null, { model });
      break;
    }

    default:
      process.stderr.write(`Unknown subcommand: ${subcommand}\n`);
      printUsage();
      process.exit(1);
  }
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

```bash
node --test tests/gemini-companion.test.mjs 2>&1 | head -60
```

Expected: 모든 테스트 PASS, hang 없음

- [ ] **Step 5: 커밋**

```bash
git add plugins/gemini/scripts/gemini-companion.mjs tests/gemini-companion.test.mjs
git commit -m "refactor: validate review args before checkGeminiAvailable, add path-conflict error"
```

---

### Task 3: 경로 분기 진입 여부를 검증하는 subprocess 테스트 추가

fake gemini 실행 파일을 PATH에 심어 경로 리뷰 브랜치가 실제로 실행되는지, 프롬프트에 경로가 포함되는지 검증한다.

**Files:**
- Modify: `tests/gemini-companion.test.mjs`

- [ ] **Step 1: import 추가**

`tests/gemini-companion.test.mjs` 상단의 import 블록에 다음을 추가한다:

```js
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import os from "node:os";
```

- [ ] **Step 2: fake gemini를 이용한 subprocess 테스트 작성**

`tests/gemini-companion.test.mjs`에 새 describe 블록을 추가한다:

```js
describe("review path branch (fake gemini)", () => {
  it("passes pathReview prompt containing given paths to gemini", () => {
    // fake gemini: -p 플래그 값을 파일에 기록하고 exit 0
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "fake-gemini-"));
    const promptFile = path.join(tmpDir, "prompt.txt");
    const fakeGeminiPath = path.join(tmpDir, "gemini");

    writeFileSync(
      fakeGeminiPath,
      `#!/bin/sh
# -p <prompt> --approval-mode plan 형태로 호출됨
while [ "$#" -gt 0 ]; do
  case "$1" in
    -p) echo "$2" > "${promptFile}"; shift 2 ;;
    *) shift ;;
  esac
done
exit 0
`,
      { mode: 0o755 }
    );

    execFileSync(
      "node",
      [COMPANION, "review", "src/utils/", "src/api.js"],
      {
        encoding: "utf8",
        stdio: "pipe",
        env: { ...process.env, PATH: `${tmpDir}:${process.env.PATH}` },
      }
    );

    assert.ok(existsSync(promptFile), "fake gemini should have been called");
    const prompt = readFileSync(promptFile, "utf8");
    assert.match(prompt, /src\/utils\//);
    assert.match(prompt, /src\/api\.js/);
    // git diff 경로로 빠지지 않았는지 확인
    assert.doesNotMatch(prompt, /git diff/i);
  });
});
```

- [ ] **Step 3: 테스트 실행해서 통과 확인**

```bash
node --test tests/gemini-companion.test.mjs 2>&1 | head -60
```

Expected: 모든 테스트 PASS, fake gemini 테스트 포함

- [ ] **Step 4: 커밋**

```bash
git add tests/gemini-companion.test.mjs
git commit -m "test: add fake-gemini subprocess test for path-review branch"
```

---

### Task 4: review.md argument-hint 업데이트

**Files:**
- Modify: `plugins/gemini/commands/review.md`

- [ ] **Step 1: argument-hint 수정**

`plugins/gemini/commands/review.md`의 frontmatter를 다음과 같이 변경한다:

변경 전:
```yaml
argument-hint: '[--base <ref>]'
```

변경 후:
```yaml
argument-hint: '[paths...] [--base <ref>] [--model <model>] [--ko]'
```

- [ ] **Step 2: 커밋**

```bash
git add plugins/gemini/commands/review.md
git commit -m "docs: update review.md argument-hint to include paths, --model, --ko"
```

---

### Task 5: 전체 테스트 실행 및 최종 확인

- [ ] **Step 1: 전체 테스트 실행**

```bash
node --test tests/gemini-companion.test.mjs 2>&1
```

Expected: 모든 테스트 PASS, hang 없음, 실패 없음

- [ ] **Step 2: 수동 동작 확인 (Gemini CLI 설치된 환경)**

```bash
# 충돌 에러 확인 (gemini 없이도 동작해야 함)
node plugins/gemini/scripts/gemini-companion.mjs review src/ --base main
# Expected stderr: --base와 경로는 함께 사용할 수 없습니다

# --base 단독 사용 (기존 동작 회귀 없음 확인)
node plugins/gemini/scripts/gemini-companion.mjs review --base HEAD~1

# 경로 리뷰 (gemini 설치 필요)
node plugins/gemini/scripts/gemini-companion.mjs review plugins/gemini/scripts/
```
