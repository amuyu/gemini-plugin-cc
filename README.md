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
/plugin marketplace add amuyu/gemini-plugin-cc
```

Install the plugin:

```bash
/plugin install gemini@amuyu-gemini
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
