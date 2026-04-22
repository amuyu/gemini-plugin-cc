# Review Path Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/gemini:review`에 positional path 인수를 추가해 파일/폴더를 직접 리뷰할 수 있게 한다.

**Architecture:** `gemini-companion.mjs`의 `review` case에서 `--base` 추출 후 남은 positional args를 경로 목록으로 간주한다. 경로가 있으면 `PROMPTS.pathReview`로 Gemini가 직접 파일을 읽게 하고, 없으면 기존 git diff 흐름을 그대로 탄다. paths + `--base` 동시 사용은 에러로 처리한다.

**Tech Stack:** Node.js (ESM), Gemini CLI

---

## File Map

| 파일 | 역할 |
|---|---|
| `plugins/gemini/scripts/gemini-companion.mjs` | PROMPTS 추가, review case 분기 로직 추가 |
| `plugins/gemini/commands/review.md` | argument-hint 업데이트 |
| `tests/gemini-companion.test.mjs` | 새 동작 단위 테스트 추가 |

---

### Task 1: PROMPTS.pathReview 추가 및 테스트

**Files:**
- Modify: `plugins/gemini/scripts/gemini-companion.mjs`
- Modify: `tests/gemini-companion.test.mjs`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/gemini-companion.test.mjs`의 `describe("PROMPTS", ...)` 블록에 다음을 추가한다:

```js
it("pathReview prompt mentions path", () => {
  assert.match(PROMPTS.pathReview, /path/i);
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
node --test tests/gemini-companion.test.mjs
```

Expected: `pathReview prompt mentions path` — FAIL (PROMPTS.pathReview is undefined)

- [ ] **Step 3: PROMPTS.pathReview 추가**

`plugins/gemini/scripts/gemini-companion.mjs`의 `PROMPTS` 객체에 다음을 추가한다:

```js
export const PROMPTS = {
  review: `...`,          // 기존 그대로

  pathReview: (paths) =>
    `You are a senior code reviewer. Review the following paths:\n${paths.join("\n")}\n\nUse your file reading tools to read and analyze these files and directories.\nFocus on: bugs, security issues, performance problems, and code quality.\nBe specific and actionable. Format your output clearly with sections.`,

  fullrepoReview: `...`,  // 기존 그대로
  // ...
};
```

> **주의:** `pathReview`는 함수다 — 문자열이 아니라 `(paths) => string` 형태.

- [ ] **Step 4: 테스트 실행해서 통과 확인**

```bash
node --test tests/gemini-companion.test.mjs
```

Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add plugins/gemini/scripts/gemini-companion.mjs tests/gemini-companion.test.mjs
git commit -m "feat: add PROMPTS.pathReview for file/folder review"
```

---

### Task 2: paths + --base 충돌 에러 처리 및 테스트

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
node --test tests/gemini-companion.test.mjs
```

Expected: 새 테스트 FAIL (에러 없이 다른 방향으로 종료됨)

- [ ] **Step 3: review case에 충돌 감지 로직 추가**

`gemini-companion.mjs`의 `case "review":` 블록에서 `--base` 추출 직후에 추가한다:

```js
case "review": {
  const baseIndex = parsedArgs.indexOf("--base");
  const baseValue = parsedArgs[baseIndex + 1];
  if (baseIndex !== -1 && (!baseValue || baseValue.startsWith("--"))) {
    process.stderr.write("--base requires a ref argument\n");
    process.exit(1);
  }
  const base = baseIndex !== -1 ? baseValue : null;

  // --base와 path 인수를 분리
  let pathArgs;
  if (baseIndex !== -1) {
    // --base <value> 두 토큰을 제거하고 나머지가 경로
    pathArgs = [
      ...parsedArgs.slice(0, baseIndex),
      ...parsedArgs.slice(baseIndex + 2),
    ];
  } else {
    pathArgs = [...parsedArgs];
  }

  // 충돌 감지
  if (pathArgs.length > 0 && base) {
    process.stderr.write("--base와 경로는 함께 사용할 수 없습니다\n");
    process.exit(1);
  }

  // ... (이후 분기는 Task 3에서 추가)
  // 일단 기존 git diff 로직 그대로 둔다
  let diff;
  try {
    diff = collectGitDiff(base);
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
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

```bash
node --test tests/gemini-companion.test.mjs
```

Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add plugins/gemini/scripts/gemini-companion.mjs tests/gemini-companion.test.mjs
git commit -m "feat: error on paths + --base conflict in review"
```

---

### Task 3: 경로 기반 리뷰 분기 구현 및 테스트

**Files:**
- Modify: `plugins/gemini/scripts/gemini-companion.mjs`
- Modify: `tests/gemini-companion.test.mjs`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/gemini-companion.test.mjs`에 PROMPTS.pathReview 함수 동작 테스트를 추가한다:

```js
describe("PROMPTS.pathReview", () => {
  it("is a function", () => {
    assert.equal(typeof PROMPTS.pathReview, "function");
  });

  it("includes each path in the output", () => {
    const result = PROMPTS.pathReview(["src/utils/", "src/api.js"]);
    assert.match(result, /src\/utils\//);
    assert.match(result, /src\/api\.js/);
  });

  it("includes review instructions", () => {
    const result = PROMPTS.pathReview(["src/"]);
    assert.match(result, /code reviewer/i);
    assert.match(result, /file reading tools/i);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
node --test tests/gemini-companion.test.mjs
```

Expected: `PROMPTS.pathReview` 관련 테스트 FAIL

- [ ] **Step 3: review case에 경로 분기 추가**

Task 2에서 작성한 `case "review":` 블록의 충돌 감지 직후, 기존 git diff 로직 앞에 경로 분기를 삽입한다:

```js
  // 경로가 주어진 경우 → Gemini가 직접 파일 읽기
  if (pathArgs.length > 0) {
    const basePrompt = PROMPTS.pathReview(pathArgs);
    const pathPrompt = ko
      ? basePrompt + "\n\nRespond entirely in Korean."
      : basePrompt;
    await runGemini(pathPrompt, null, { model });
    break;
  }

  // 이하 기존 git diff 로직 그대로
  let diff;
  // ...
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

```bash
node --test tests/gemini-companion.test.mjs
```

Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add plugins/gemini/scripts/gemini-companion.mjs tests/gemini-companion.test.mjs
git commit -m "feat: add path-based review mode to /gemini:review"
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
argument-hint: '[paths...] [--base <ref>]'
```

- [ ] **Step 2: 커밋**

```bash
git add plugins/gemini/commands/review.md
git commit -m "docs: update review.md argument-hint for path support"
```

---

### Task 5: 전체 테스트 실행 및 최종 확인

- [ ] **Step 1: 전체 테스트 실행**

```bash
node --test tests/gemini-companion.test.mjs
```

Expected: 모든 테스트 PASS, 실패 없음

- [ ] **Step 2: 수동 동작 확인 (Gemini CLI 설치된 환경)**

```bash
# 경로 리뷰
node plugins/gemini/scripts/gemini-companion.mjs review plugins/gemini/scripts/

# 충돌 에러 확인
node plugins/gemini/scripts/gemini-companion.mjs review src/ --base main
# Expected stderr: --base와 경로는 함께 사용할 수 없습니다

# 기존 git diff 리뷰 (변경 없음 확인)
node plugins/gemini/scripts/gemini-companion.mjs review --base HEAD~1
```
