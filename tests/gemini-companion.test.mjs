import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectGitDiff, PROMPTS, checkGeminiAvailable } from "../plugins/gemini/scripts/gemini-companion.mjs";

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
