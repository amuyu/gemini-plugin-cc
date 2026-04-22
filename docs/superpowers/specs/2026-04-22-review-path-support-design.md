# Review Path Support Design

**Date:** 2026-04-22  
**Status:** Approved

## Overview

`/gemini:review` 명령어에 파일/폴더 경로를 직접 지정해 리뷰하는 기능을 추가한다. 기존 git diff 리뷰는 변경 없이 유지된다.

## User Interface

```
/gemini:review [paths...] [--base <ref>] [--model <model>] [--ko]
```

- **경로 지정 시** → 해당 파일/폴더를 Gemini가 직접 읽어 리뷰
- **경로 없음** → 기존 git diff 리뷰 (동작 변경 없음)
- **경로 + `--base` 동시 사용** → 에러

### 예시

```bash
/gemini:review src/utils/helper.js          # 단일 파일
/gemini:review src/components/              # 폴더
/gemini:review src/utils/ src/api.js        # 여러 경로
/gemini:review src/utils/ --ko              # 한국어 출력
/gemini:review --base main                  # 기존 git diff (변경 없음)
```

## Architecture

### 플래그 파싱 흐름

기존 파싱 체인을 그대로 활용한다:

```
args
  → extractKoFlag()       → { ko, remaining }
  → extractModelFlag()    → { model, remaining }
  → extract --base        → { base, pathArgs }
```

`--base` 추출 후 남은 positional args가 경로 목록(`pathArgs`)이 된다.

### review case 분기 로직

```
if pathArgs.length > 0 AND base is set:
  → error: "--base와 경로는 함께 사용할 수 없습니다"

if pathArgs.length > 0:
  → PROMPTS.pathReview with paths list
  → runGemini(prompt, null, { model })   ← stdin 없음, Gemini가 직접 파일 읽음

else:
  → 기존 git diff 로직 (변경 없음)
```

### 프롬프트 설계

`PROMPTS.pathReview`는 `fullrepo-review`와 동일한 방식으로 Gemini의 file reading tools를 활용한다. 경로 목록은 프롬프트에 직접 삽입된다:

```
You are a senior code reviewer. Review the following paths:
<paths>

Use your file reading tools to read and analyze these files/directories.
Focus on: bugs, security issues, performance problems, and code quality.
Be specific and actionable. Format your output clearly with sections.
```

## Changed Files

| 파일 | 변경 내용 |
|---|---|
| `plugins/gemini/scripts/gemini-companion.mjs` | `PROMPTS.pathReview` 추가, `review` case에 경로 분기 추가 |
| `plugins/gemini/commands/review.md` | `argument-hint` 업데이트 |
| `tests/gemini-companion.test.mjs` | `PROMPTS.pathReview` 테스트, 충돌 에러 테스트 추가 |

## Error Handling

- `paths`와 `--base` 동시 사용: stderr에 에러 메시지 출력 후 exit 1
- Gemini CLI 미설치: 기존 에러 처리 그대로

## Testing

단위 테스트로 검증:
- `PROMPTS.pathReview`가 경로를 포함하는지
- paths + `--base` 충돌 시 exit 1 + 적절한 에러 메시지
- 기존 `--base` 단독 사용 테스트는 영향 없음 (회귀 방지)
