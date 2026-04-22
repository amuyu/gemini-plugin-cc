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

export function runGemini(prompt, input, { model = null, maxRetries = 3, retryDelayMs = 10000 } = {}) {
  const attempt = (attemptsLeft) =>
    new Promise((resolve, reject) => {
      const args = ["-p", prompt, "--approval-mode", "plan"];
      if (model) args.push("--model", model);

      const child = spawn("gemini", args, {
        stdio: ["pipe", "inherit", "pipe"],
      });

      let stderrData = "";
      child.stderr.on("data", (chunk) => {
        stderrData += chunk.toString();
        process.stderr.write(chunk);
      });

      if (input) {
        child.stdin.write(input);
      }
      child.stdin.end();

      child.on("exit", (code) => {
        if (code !== 0) {
          const is429 =
            stderrData.includes("429") ||
            stderrData.includes("RESOURCE_EXHAUSTED");
          if (is429 && attemptsLeft > 1) {
            const delay = retryDelayMs * Math.pow(2, maxRetries - attemptsLeft);
            process.stderr.write(
              `\n429 RESOURCE_EXHAUSTED — ${delay / 1000}초 후 재시도합니다... (남은 시도: ${attemptsLeft - 1})\n`
            );
            setTimeout(() => {
              attempt(attemptsLeft - 1).then(resolve).catch(reject);
            }, delay);
          } else {
            reject(new Error(`gemini exited with code ${code}`));
          }
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

  return attempt(maxRetries);
}

// ─── 프롬프트 ─────────────────────────────────────────────────────────────

export const PROMPTS = {
  review: `You are a senior code reviewer. Review the following git diff carefully.
Focus on: bugs, security issues, performance problems, and code quality.
Be specific and actionable. Format your output clearly with sections.

Here is the diff to review:`,

  pathReview: (paths) =>
    `You are a senior code reviewer. Review the following paths:\n${paths.join("\n")}\n\nUse your file reading tools to read and analyze these files and directories.\nFocus on: bugs, security issues, performance problems, and code quality.\nBe specific and actionable. Format your output clearly with sections.`,

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

export function extractModelFlag(args) {
  const idx = args.indexOf("--model");
  if (idx === -1) return { model: null, remaining: args };
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("--model requires a model name argument");
  }
  const remaining = [...args.slice(0, idx), ...args.slice(idx + 2)];
  return { model: value, remaining };
}

// ─── 메인 ─────────────────────────────────────────────────────────────────

function printUsage() {
  process.stderr.write(
    [
      "Usage:",
      "  node gemini-companion.mjs review [--base <ref>] [--model <model>]",
      "  node gemini-companion.mjs fullrepo-review [--model <model>]",
      "  node gemini-companion.mjs architecture [--model <model>]",
      "  node gemini-companion.mjs security-audit [--model <model>]",
      "",
      "Options:",
      "  --model <model>  Gemini 모델 지정 (예: gemini-2.0-flash)",
    ].join("\n") + "\n"
  );
}

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

let isMain = false;
try {
  isMain = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
} catch {
  // If we can't determine isMain, assume we're not the entry point
  isMain = false;
}

if (isMain) {
  main().catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}
