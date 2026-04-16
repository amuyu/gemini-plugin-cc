import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectGitDiff, PROMPTS, checkGeminiAvailable, extractKoFlag, extractModelFlag } from "../plugins/gemini/scripts/gemini-companion.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Use absolute path for COMPANION since it's called as a separate process
const COMPANION = path.join(__dirname, "..", "plugins", "gemini", "scripts", "gemini-companion.mjs");

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

describe("collectGitDiff", () => {
  it("returns combined staged and unstaged diff when no base given", () => {
    // 현재 디렉토리가 git repo이므로 에러 없이 실행됨 (빈 문자열이어도 ok)
    const result = collectGitDiff(null);
    assert.equal(typeof result, "string");
  });

  it("throws when invalid base ref given", () => {
    let threw = false;
    try {
      // Suppress stderr to avoid test output pollution
      const originalWrite = process.stderr.write;
      process.stderr.write = () => true;
      try {
        collectGitDiff("nonexistent-branch-xyz-123");
      } finally {
        process.stderr.write = originalWrite;
      }
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

  it("fullrepoReview prompt mentions codebase", () => {
    assert.match(PROMPTS.fullrepoReview, /codebase/i);
  });
});

describe("checkGeminiAvailable", () => {
  it("returns a boolean", () => {
    const result = checkGeminiAvailable();
    assert.equal(typeof result, "boolean");
  });
});

describe("review --base validation", () => {
  it("exits with code 1 when --base has no value", () => {
    let threw = false;
    try {
      execFileSync("node", [COMPANION, "review", "--base"], { encoding: "utf8", stdio: "pipe" });
    } catch (err) {
      threw = true;
      assert.equal(err.status, 1);
      assert.match(err.stderr, /--base requires a ref argument/);
    }
    assert.ok(threw, "should have thrown");
  });
});

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

describe("extractModelFlag", () => {
  it("returns model=null and unchanged args when --model absent", () => {
    const { model, remaining } = extractModelFlag(["--base", "main"]);
    assert.equal(model, null);
    assert.deepEqual(remaining, ["--base", "main"]);
  });

  it("extracts model value and removes --model <value> from args", () => {
    const { model, remaining } = extractModelFlag(["--model", "gemini-2.0-flash"]);
    assert.equal(model, "gemini-2.0-flash");
    assert.deepEqual(remaining, []);
  });

  it("removes --model and its value regardless of position", () => {
    const { model, remaining } = extractModelFlag(["--base", "main", "--model", "gemini-2.0-flash"]);
    assert.equal(model, "gemini-2.0-flash");
    assert.deepEqual(remaining, ["--base", "main"]);
  });

  it("throws when --model has no value", () => {
    assert.throws(
      () => extractModelFlag(["--model"]),
      /--model requires a model name argument/
    );
  });

  it("throws when --model is followed by another flag", () => {
    assert.throws(
      () => extractModelFlag(["--model", "--base"]),
      /--model requires a model name argument/
    );
  });

  it("handles empty args", () => {
    const { model, remaining } = extractModelFlag([]);
    assert.equal(model, null);
    assert.deepEqual(remaining, []);
  });
});

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
