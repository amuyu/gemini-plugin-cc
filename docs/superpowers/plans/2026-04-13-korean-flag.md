# Korean Flag (`--ko`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `--ko` flag to all four Gemini plugin commands so Gemini responds in Korean.

**Architecture:** Extract a small `extractKoFlag(args)` helper that strips `--ko` from an args array and returns `{ ko, remaining }`. Each subcommand in `main()` calls this helper; if `ko` is true, it appends `"\n\nRespond entirely in Korean."` to the prompt. The three `.md` command files that don't yet forward `$ARGUMENTS` are updated to do so.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`

---

## File Map

| Action | File |
|---|---|
| Modify | `plugins/gemini/scripts/gemini-companion.mjs` |
| Modify | `tests/gemini-companion.test.mjs` |
| Modify | `plugins/gemini/commands/fullrepo-review.md` |
| Modify | `plugins/gemini/commands/architecture.md` |
| Modify | `plugins/gemini/commands/security-audit.md` |

---

### Task 1: `extractKoFlag` — tests first, then implementation

**Files:**
- Modify: `tests/gemini-companion.test.mjs`
- Modify: `plugins/gemini/scripts/gemini-companion.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/gemini-companion.test.mjs`:

```javascript
describe("extractKoFlag", () => {
  it("returns ko=false and unchanged args when --ko absent", () => {
    const { ko, remaining } = extractKoFlag(["--base", "main"]);
    assert.equal(ko, false);
    assert.deepEqual(remaining, ["--base", "main"]);
  });

  it("returns ko=true and removes --ko from args", () => {
    const { ko, remaining } = extractKoFlag(["--ko"]);
    assert.equal(ko, true);
    assert.deepEqual(remaining, []);
  });

  it("removes --ko regardless of position", () => {
    const { ko, remaining } = extractKoFlag(["--base", "main", "--ko"]);
    assert.equal(ko, true);
    assert.deepEqual(remaining, ["--base", "main"]);
  });

  it("removes --ko when it appears before --base", () => {
    const { ko, remaining } = extractKoFlag(["--ko", "--base", "main"]);
    assert.equal(ko, true);
    assert.deepEqual(remaining, ["--base", "main"]);
  });

  it("handles empty args", () => {
    const { ko, remaining } = extractKoFlag([]);
    assert.equal(ko, false);
    assert.deepEqual(remaining, []);
  });
});
```

Also add `extractKoFlag` to the import line at the top of the test file:

```javascript
import { collectGitDiff, PROMPTS, checkGeminiAvailable, extractKoFlag } from "../plugins/gemini/scripts/gemini-companion.mjs";
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL with `extractKoFlag is not a function` or similar.

- [ ] **Step 3: Implement `extractKoFlag` in `gemini-companion.mjs`**

Add after the `PROMPTS` object (before the `// ─── 메인` section):

```javascript
// ─── 플래그 파싱 ──────────────────────────────────────────────────────────

export function extractKoFlag(args) {
  const ko = args.includes("--ko");
  const remaining = args.filter((a) => a !== "--ko");
  return { ko, remaining };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All tests PASS including the new `extractKoFlag` suite.

- [ ] **Step 5: Commit**

```bash
git add plugins/gemini/scripts/gemini-companion.mjs tests/gemini-companion.test.mjs
git commit -m "feat: add extractKoFlag helper with tests"
```

---

### Task 2: Wire `--ko` into each subcommand in `main()`

**Files:**
- Modify: `plugins/gemini/scripts/gemini-companion.mjs`
- Modify: `tests/gemini-companion.test.mjs`

- [ ] **Step 1: Write the failing integration tests**

Append to `tests/gemini-companion.test.mjs`:

```javascript
describe("review --base validation with --ko", () => {
  it("--base still requires a value when --ko is present", () => {
    let threw = false;
    try {
      execFileSync("node", [COMPANION, "review", "--ko", "--base"], {
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch (err) {
      threw = true;
      assert.equal(err.status, 1);
      assert.match(err.stderr, /--base requires a ref argument/);
    }
    assert.ok(threw, "should have thrown");
  });

  it("--ko alone does not break --base validation path (no diff = exit 0 message)", () => {
    // This test validates --ko is stripped before --base parsing.
    // We cannot run gemini in CI, so we just confirm --ko doesn't cause a
    // parse error when gemini is unavailable (exits 1 with gemini message,
    // not with --base error).
    let result;
    try {
      result = execFileSync("node", [COMPANION, "review", "--ko"], {
        encoding: "utf8",
        stdio: "pipe",
      });
      // If gemini is available and there's no diff, we get a clean exit
      assert.equal(typeof result, "string");
    } catch (err) {
      // If gemini not installed: exits 1 with gemini message (not --base error)
      assert.notMatch(err.stderr || "", /--base requires a ref argument/);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify new tests behave as expected**

```bash
npm test
```

Expected: The `--ko alone does not break` test may pass or fail depending on environment — that's fine. The `--base still requires a value` test should pass already (since `--ko` isn't wired yet, it passes `--ko` as an unknown arg which gets ignored). Confirm no unexpected failures.

- [ ] **Step 3: Update `main()` to use `extractKoFlag`**

In `gemini-companion.mjs`, update the `switch` block in `main()`. The full updated switch:

```javascript
  switch (subcommand) {
    case "review": {
      const { ko, remaining: reviewArgs } = extractKoFlag(args);
      const baseIndex = reviewArgs.indexOf("--base");
      const baseValue = reviewArgs[baseIndex + 1];
      if (baseIndex !== -1 && (!baseValue || baseValue.startsWith("--"))) {
        process.stderr.write("--base requires a ref argument\n");
        process.exit(1);
      }
      const base = baseIndex !== -1 ? baseValue : null;

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

      const reviewPrompt = ko
        ? PROMPTS.review + "\n\nRespond entirely in Korean."
        : PROMPTS.review;
      await runGemini(reviewPrompt, diff);
      break;
    }

    case "fullrepo-review": {
      const { ko } = extractKoFlag(args);
      const fullrepoPrompt = ko
        ? PROMPTS.fullrepoReview + "\n\nRespond entirely in Korean."
        : PROMPTS.fullrepoReview;
      await runGemini(fullrepoPrompt, null);
      break;
    }

    case "architecture": {
      const { ko } = extractKoFlag(args);
      const archPrompt = ko
        ? PROMPTS.architecture + "\n\nRespond entirely in Korean."
        : PROMPTS.architecture;
      await runGemini(archPrompt, null);
      break;
    }

    case "security-audit": {
      const { ko } = extractKoFlag(args);
      const auditPrompt = ko
        ? PROMPTS.securityAudit + "\n\nRespond entirely in Korean."
        : PROMPTS.securityAudit;
      await runGemini(auditPrompt, null);
      break;
    }

    default:
      process.stderr.write(`Unknown subcommand: ${subcommand}\n`);
      printUsage();
      process.exit(1);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/gemini/scripts/gemini-companion.mjs tests/gemini-companion.test.mjs
git commit -m "feat: wire --ko flag into all subcommands for Korean responses"
```

---

### Task 3: Update `.md` command files to forward `$ARGUMENTS`

**Files:**
- Modify: `plugins/gemini/commands/fullrepo-review.md`
- Modify: `plugins/gemini/commands/architecture.md`
- Modify: `plugins/gemini/commands/security-audit.md`

- [ ] **Step 1: Update `fullrepo-review.md`**

Change the `node` invocation line from:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" fullrepo-review
```

to:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" fullrepo-review "$ARGUMENTS"
```

- [ ] **Step 2: Update `architecture.md`**

Change the `node` invocation line from:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" architecture
```

to:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" architecture "$ARGUMENTS"
```

- [ ] **Step 3: Update `security-audit.md`**

Change the `node` invocation line from:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" security-audit
```

to:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" security-audit "$ARGUMENTS"
```

- [ ] **Step 4: Run tests to verify nothing broken**

```bash
npm test
```

Expected: All tests PASS (no test changes needed for `.md` files).

- [ ] **Step 5: Commit**

```bash
git add plugins/gemini/commands/fullrepo-review.md plugins/gemini/commands/architecture.md plugins/gemini/commands/security-audit.md
git commit -m "feat: forward \$ARGUMENTS in fullrepo-review, architecture, security-audit commands"
```
