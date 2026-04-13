#!/usr/bin/env node

import { spawn, execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

// ─── Gemini CLI 가용성 체크 ───────────────────────────────────────────────

export function checkGeminiAvailable() {
  try {
    execFileSync("gemini", ["--version"], { stdio: "ignore" });
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

// ─── 플래그 파싱 ──────────────────────────────────────────────────────────

export function extractKoFlag(args) {
  const ko = args.includes("--ko");
  const remaining = args.filter((a) => a !== "--ko");
  return { ko, remaining };
}

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
      const baseValue = args[baseIndex + 1];
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

const isMain = realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}
