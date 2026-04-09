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
