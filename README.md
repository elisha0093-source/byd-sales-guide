# BYD Sales Guide - Cloudflare 공통 비밀번호 버전

## 포함 파일

- `index.html`: BYD Sales Guide V3.5
- `_worker.js`: 공통 비밀번호 로그인과 7일 세션 처리

## Cloudflare에 설정할 Secret

- `SHARED_PASSWORD`: 직원들에게 공유할 공통 비밀번호
- `SESSION_SECRET`: 로그인 쿠키 서명용 긴 임의 문자열

두 값은 HTML과 GitHub 파일에 직접 입력하지 않습니다. Cloudflare Pages 프로젝트의
`Settings > Variables and Secrets`에서 `Encrypt`를 선택해 저장합니다.

## 동작

1. 처음 접속하면 비밀번호 화면이 표시됩니다.
2. 비밀번호가 맞으면 7일 동안 로그인 상태가 유지됩니다.
3. 비밀번호가 없거나 틀리면 Sales Guide 파일을 내려받을 수 없습니다.

Cloudflare Pages 배포와 Secret 설정이 완료되기 전에는 정상 화면 대신 설정 안내가 표시됩니다.
