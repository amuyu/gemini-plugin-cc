# Gemini Plugin for Claude Code — Design Spec

**Date:** 2026-04-10  
**Status:** Approved

---

## 목표

Claude Code 사용자가 Google Gemini CLI를 Claude Code 워크플로우 안에서 바로 활용할 수 있게 해주는 플러그인. Gemini의 긴 컨텍스트 윈도우(1M 토큰)를 활용해 전체 저장소 분석이 가능한 것이 핵심 차별점.

---

## 범위 (v1)

포함:
- `/gemini:review` — 현재 변경사항(diff) 코드 리뷰
- `/gemini:fullrepo-review` — 전체 저장소 코드 리뷰
- `/gemini:architecture` — 전체 코드베이스 아키텍처 분석
- `/gemini:security-audit` — 전체 코드 보안 감사

제외 (추후 추가):
- `/gemini:rescue` — 작업 위임
- `/gemini:ui-review` — 스크린샷 + 코드 멀티모달 리뷰
- `/gemini:diagram` — 코드 기반 Mermaid 다이어그램 생성
- 백그라운드 실행 (`--background`, `/gemini:status`, `/gemini:result`)

---

## 아키텍처

### 파일 구조

```
gemini-plugin-cc/
├── .claude-plugin/
│   └── marketplace.json
├── plugins/
│   └── gemini/
│       ├── commands/
│       │   ├── review.md
│       │   ├── fullrepo-review.md
│       │   ├── architecture.md
│       │   └── security-audit.md
│       └── scripts/
│           └── gemini-companion.mjs
├── package.json
├── README.md
└── .gitignore
```

### 의존성

- `gemini` CLI 바이너리 (Google Gemini CLI)
- Node.js 18.18 이상
- 별도 npm 패키지 없음

---

## 각 명령어 동작

### `/gemini:review`

1. `git status --short`와 `git diff --shortstat` / `git diff --shortstat --cached`로 변경사항 크기 파악
2. `gemini-companion.mjs review [ARGUMENTS]` 호출
3. companion이 `git diff HEAD` (또는 `--base <ref>` 지정 시 `git diff <ref>...HEAD`) 수집
4. Gemini CLI에 diff를 stdin 또는 파일로 전달하여 코드 리뷰 요청
5. Gemini 출력을 그대로 사용자에게 반환

지원 플래그: `--base <ref>`

### `/gemini:fullrepo-review`

1. `gemini-companion.mjs fullrepo-review` 호출
2. Gemini CLI에 현재 디렉토리를 전달하여 전체 저장소 리뷰 요청
3. 출력 그대로 반환

### `/gemini:architecture`

- fullrepo-review와 동일한 방식
- 프롬프트: 아키텍처 구조, 모듈 간 의존성, 계층 구조, 개선점 분석 요청

### `/gemini:security-audit`

- fullrepo-review와 동일한 방식
- 프롬프트: OWASP Top 10 기준 보안 취약점, 위험한 패턴, 하드코딩된 시크릿 탐지 요청

---

## companion 스크립트 (`gemini-companion.mjs`)

모든 Gemini CLI 호출을 담당하는 Node.js ESM 스크립트.

```
subcommands:
  review [--base <ref>]   → git diff 수집 후 Gemini CLI에 전달
  fullrepo-review         → 현재 디렉토리 전체를 Gemini CLI에 전달
  architecture            → fullrepo와 동일, 아키텍처 분석 프롬프트
  security-audit          → fullrepo와 동일, 보안 감사 프롬프트
```

내부 흐름:
1. `gemini` 바이너리 존재 확인 (which gemini) → 없으면 에러 메시지 출력 후 exit 1
2. subcommand에 따라 입력 데이터 수집 (diff 또는 디렉토리)
3. `gemini` CLI 실행, stdout/stderr 그대로 출력
4. exit code 전달

### 에러 처리

| 상황 | 메시지 |
|------|--------|
| gemini CLI 미설치 | "gemini CLI가 설치되지 않았습니다. 설치: npm install -g @google/gemini-cli" |
| 인증 미완료 | CLI 에러 그대로 출력 + "gemini auth login을 실행하세요." 안내 |
| 리뷰할 변경사항 없음 | "리뷰할 변경사항이 없습니다." |

---

## 패키지 메타데이터

```json
// package.json
{
  "name": "@google/gemini-plugin-cc",
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=18.18.0" }
}

// .claude-plugin/marketplace.json
{
  "name": "google-gemini",
  "owner": { "name": "Google" },
  "metadata": {
    "description": "Gemini plugin for Claude Code — code review and analysis.",
    "version": "0.1.0"
  },
  "plugins": [{
    "name": "gemini",
    "description": "Use Gemini from Claude Code for code review and codebase analysis.",
    "version": "0.1.0",
    "author": { "name": "Google" },
    "source": "./plugins/gemini"
  }]
}
```

### 설치 방법

```bash
/plugin marketplace add google/gemini-plugin-cc
/plugin install gemini@google-gemini
/reload-plugins
```

---

## 향후 확장 계획

- **v2:** `/gemini:rescue` — 작업 위임 (버그 조사, 수정 시도)
- **v2:** 백그라운드 실행 (`--background`, `/gemini:status`, `/gemini:result`)
- **v3:** `/gemini:ui-review` — 스크린샷 + 코드 멀티모달 리뷰 (Gemini CLI 이미지 지원 확인 후)
- **v3:** `/gemini:diagram` — Mermaid 다이어그램 생성
