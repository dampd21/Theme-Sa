# Theme-Sa · Cloudflare 비밀 기록실

**운영 홈페이지: https://theme-sa.dampd21.workers.dev/**

**Cloudflare Workers가 홈페이지와 로그인·저장을 처리하고, 기존 비공개 GitHub 저장소에 팀 기록을 보관합니다.**

방문자는 공용 비밀번호 한 칸으로 로그인하고, 댓글·투표 등에 사용할 활동 프로필을 선택합니다. 선택 이름은 본인 인증이 아닙니다. GitHub 계정이나 토큰을 준비할 필요가 없습니다. GitHub 연결 토큰은 서버에만 있으며, 프론트엔드에 평문·암호문 형태로 전달하지 않습니다.

## Edition 04 확장 기능

[38개 기능과 조직도 사용 안내](확장기능-안내.md)를 참고하세요. 직함·조직도, 프로필 확장, 수정 전후 비교, 휴지통, 활동 내역, 공지, 임무, 달력, 투표, 도감·사건·세계관 기록을 추가했습니다. **직함은 표시용이며 권한 분리는 하지 않습니다.**

기록 저장은 **기록 저장하기 → 수정 전후 확인 → 확인하고 저장**입니다. 공감·투표·공지 확인·체크 항목은 해당 버튼으로 바로 저장합니다.

## 현재 구성

```text
방문자 브라우저
    │ 공용 비밀번호 (HTTPS)
    ▼
Cloudflare Worker · theme-sa
    ├─ 홈페이지 제공
    ├─ 비밀번호 확인 + 서명된 HttpOnly 쿠키
    ├─ 서버 입력 검증 + 요청 제한 + 충돌 처리
    └─ 서버에만 보관한 GitHub 토큰
              │
              ▼
dampd21/Theme-Sa-data (Private)
    └─ main / data/team.json
```

- 화면과 API를 같은 Cloudflare 주소에서 제공합니다. 교차 사이트 쿠키나 별도 CORS 설정이 필요하지 않습니다.
- 로그인은 기본 **12시간** 유지되고 새로고침해도 다시 입력하지 않습니다.
- 로그아웃하면 해당 브라우저의 로그인 쿠키가 삭제됩니다.
- 비밀번호 변경 또는 새 배포 시 기존 세션은 만료됩니다.
- 공용 비밀번호 방식이므로 로그인한 사람은 모두 같은 팀 기록 관리 권한을 갖습니다. 개인별 계정·역할 구분은 없습니다.

---

## 최초 배포: 관리자 설정

Cloudflare 계정은 이미 있다는 전제입니다. 새 도메인을 구입할 필요 없이 `workers.dev` 주소로 시작할 수 있습니다.

### 1. Cloudflare Account ID 확인

Cloudflare 대시보드에서 사용할 계정의 **Account ID**를 복사합니다. 32자리 값이며 API 토큰과는 다릅니다.

### 2. Cloudflare 배포용 API 토큰 생성

Cloudflare **My Profile → API Tokens → Create Token**으로 이동합니다.

- Workers 배포용 템플릿(**Edit Cloudflare Workers**)을 사용하거나, 필요한 계정 권한을 갖는 사용자 지정 토큰을 만듭니다.
- **사용할 계정 하나로 범위를 제한**합니다.
- 핵심 권한은 Workers Scripts 편집이며, 계정 설정 조회가 필요할 수 있습니다. 이 구성은 Workers KV나 사용자 지정 도메인을 사용하지 않습니다.
- Cloudflare 대시보드 정책·템플릿이 변경되거나 추가 권한 오류가 나면 Wrangler 오류에 표시된 권한을 확인하세요. 무조건 모든 계정·영역 권한을 주지 마세요.

이 토큰은 **배포용**이며 방문자에게 전달되지 않습니다. GitHub 토큰을 이 값 대신 넣지 마세요.

### 3. 기록 전용 GitHub Fine-grained 토큰 준비

관리자 본인의 GitHub 설정 → Developer settings → Personal access tokens → Fine-grained tokens에서 만듭니다.

- Resource owner: `dampd21`
- Repository access: **Only select repositories** → **Theme-Sa-data 하나만**
- Repository permissions: **Contents → Read and write**
- 적절한 짧은 만료 기간을 설정하고 갱신 날짜를 관리합니다.

현재 사용 가능한 전용 Fine-grained 토큰이 이미 있다면 재사용할 수 있습니다. 채팅에 노출된 예전 Classic 배포 토큰은 운영용으로 쓰지 마세요.

### 4. GitHub Actions 설정

화면 소스 저장소 **dampd21/Theme-Sa → Settings → Secrets and variables → Actions**입니다.

**Secrets 탭**에 다음 세 개를 등록합니다.

| 이름 | 값 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 2번의 Cloudflare 배포용 API 토큰 |
| `SITE_PASSWORD` | 팀 공용 비밀번호. 5~200자 허용, 보안상 12자 이상 권장 |
| `DATA_REPO_TOKEN` | 3번의 기록 저장소 전용 GitHub Fine-grained 토큰 |

**Variables 탭**에 다음 값을 등록합니다.

| 이름 | 값 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | 1번의 Cloudflare Account ID |

기존 기록 연결용 Variables는 유지합니다. 없어도 `wrangler.jsonc`의 기본값을 사용합니다.

| 변수 | 기본값 |
|---|---|
| `ARCHIVE_OWNER` | `dampd21` |
| `ARCHIVE_REPO` | `Theme-Sa-data` |
| `ARCHIVE_BRANCH` | `main` |
| `ARCHIVE_PATH` | `data/team.json` |

**실제 비밀번호·토큰은 채팅이나 코드에 붙여 넣지 말고 Secrets에 직접 입력하세요.** Account ID와 저장소 좌표는 비밀 값이 아니지만 API 토큰은 반드시 Secrets에 넣습니다.

### 5. 배포 실행

이 Cloudflare 수정본이 `main`에 반영된 후:

**Actions → Deploy Theme-Sa to Cloudflare → Run workflow**

워크플로는 다음을 수행합니다.

1. Node.js 22와 고정된 Wrangler 설치
2. 서버 보안·확장 스키마·마이그레이션 테스트, 공개 파일 검사, 가상 기록으로 전체 브라우저 통합 테스트
3. 입력한 GitHub 토큰의 비공개 저장소 접근·현재 기록 호환성 확인, 원본을 같은 비공개 저장소에 백업 (현재 JSON 수정 없음)
4. 세션 서명용 비밀 값 자동 생성
5. 비밀 값과 Worker·홈페이지를 함께 배포
6. 실제 홈페이지·로그인·쿠키·세션·비공개 기록 읽기를 점검 (운영 기록 수정 없음)
7. 러너 임시 비밀 파일 삭제

세션 서명 키는 자동 생성하므로 따로 등록할 필요가 없습니다. 새 배포에서는 기존 로그인 세션이 만료되어 다시 비밀번호를 입력합니다.

설정이 빠졌거나 검사에 실패하면 Cloudflare 배포를 진행하지 않습니다. **기존 GitHub Pages는 이 작업만으로 삭제하거나 덮어쓰지 않습니다.**

### 6. 새 홈페이지 주소 확인

성공한 배포 로그 또는 Cloudflare **Workers & Pages → theme-sa**에서 실제 주소를 확인합니다.

일반적인 형식은 다음과 같습니다. 아래 주소는 형식 예시이며 실제 주소가 아닙니다.

```text
https://theme-sa.<계정의-workers-하위도메인>.workers.dev
```

대시보드에서 최초 Workers 하위 도메인 설정이 필요할 수 있습니다. 실제 주소에서 비밀번호 로그인, 팀원 저장, 새로고침 후 로그인 유지와 기록 불러오기를 확인하세요.

---

## 기존 GitHub Pages에서 이전하기

- 기존 주소는 `https://dampd21.github.io/Theme-Sa/`입니다.
- 기록 저장소는 그대로 사용하므로 실제 팀 기록을 옮기거나 초기화할 필요가 없습니다.
- Cloudflare의 새 주소에서 정상 동작을 확인한 뒤 그 주소를 공유하세요.
- 이후 기존 Pages는 비활성화하거나 새 주소로 안내하도록 정리할 수 있습니다. 새 주소를 확인하기 전에는 기존 사이트를 삭제하지 마세요.
- **이전 `Deploy static content to Pages` 워크플로를 재실행하지 마세요.** 과거 코드에는 다른 로그인 방식이 있습니다. 이번 버전은 Cloudflare 배포 워크플로만 사용합니다.
- 브라우저에서 연결키를 복호화하던 `vault.json` 방식은 제거했습니다. Worker도 `/vault.json` 요청을 거절합니다.

---

## 사용자 기능

- 공용 비밀번호 로그인, 기본 12시간 로그인 유지
- 팀명 변경, 팀장 지정, 팀원 추가·수정·삭제
- 이름·학교·학년·반·나이·능력·역할·메모
- 검색·정렬, 카드형·목록형 보기
- 편집 중이 아닐 때 약 30초마다 최신 기록 확인
- GitHub 파일 SHA 기반 동시 수정 충돌 감지
- 미저장 초안 보관, JSON 백업·복원
- 세션이 만료된 상태에서 저장하면 초안을 유지한 채 비밀번호 재확인
- Galaxy S22 기준 360px 세로 화면, 한 칸 카드와 읽기 쉬운 입력창

**입력만 하면 저장되지 않습니다. `기록 저장하기`을 누르고 성공 알림을 확인하세요.**

## 로그인·보안 동작

- 세션 쿠키: `Secure`, `HttpOnly`, `SameSite=Strict`, 호스트 전용 `__Host-` 접두사
- 서버 HMAC 서명과 만료 시간 검증
- 변경 요청의 Origin 검사
- 서버에서 JSON 형식·크기·팀원 수·입력값 검증
- 고정된 비공개 저장소의 지정 JSON 파일만 읽기·쓰기
- 로그인 시도와 로그인 후 API 요청의 속도 제한
- API 응답은 `no-store`; 토큰이나 비밀번호를 반환하지 않음
- 서버 코드·비밀 파일·옛 암호화 vault를 정적 자산으로 제공하지 않음

로그인 제한은 기본적으로 연결 IP별로 Cloudflare 위치당 1분에 12회입니다. 같은 네트워크를 사용하는 여러 사람은 이 한도를 잠깐 공유할 수 있습니다. 이는 분산 공격을 완벽히 차단하는 전역 제한이 아니므로 비밀번호를 길고 고유하게 설정하세요.

우클릭·F12 제한은 이전 요청에 따라 남겨 둔 가벼운 UI 제한입니다. **소스를 숨기는 보안 기능은 아닙니다.** 실제 데이터 보호는 서버에서 수행합니다. 입력창에서는 붙여넣기를 허용합니다.

## 비밀번호·연결키 변경

- 공용 비밀번호 변경: GitHub Secret `SITE_PASSWORD` 수정 → Cloudflare 워크플로 재실행
- GitHub 토큰 만료·폐기: `DATA_REPO_TOKEN` 수정 → 재배포
- Cloudflare 배포 토큰 교체: `CLOUDFLARE_API_TOKEN` 수정
- 비밀번호가 유출됐다면 즉시 변경하세요. 변경된 서버 설정이 적용되면 이전 세션은 더 이상 유효하지 않습니다.
- 배포는 세션 서명 키도 새로 생성하므로 모든 사용자가 다시 로그인합니다.

공용 비밀번호를 쓰는 모든 사용자는 같은 기록 관리 권한을 갖습니다. 사용자 한 명만 선택적으로 차단하려면 계정별 인증 구조로 바꿔야 합니다.

## 기록과 개인정보

- 실제 상세 집주소는 기록하지 마세요. 이름·학교도 필요한 범위로 제한하고 관련자의 동의를 받으세요.
- 데이터는 GitHub와 Cloudflare 서버에서 처리됩니다. 별도 종단간 암호화 저장 서비스는 아닙니다.
- GitHub는 삭제·수정 이전 내용도 커밋 이력에 남깁니다. 앱에서 지워도 과거 이력이나 내려받은 사본까지 지워지는 것은 아닙니다.
- 백업 JSON을 공개 저장소에 올리지 마세요.
- 기록 저장소를 Public으로 변경하면 앱은 접근을 거절하지만, 이미 공개된 GitHub 이력 자체를 숨겨 주지는 못합니다.
- Worker와 배포 워크플로의 수정 권한은 신뢰하는 관리자에게만 주세요.

---

## 개발 파일

```text
worker/index.mjs                # 비밀번호·쿠키·보안·GitHub API 중계
worker/worker.test.mjs          # 서버 테스트, 가상 자격증명만 사용
site/index.html                # 로그인·기록실 기본 화면
site/app.mjs / site/app.css     # 38개 기능과 S22 반응형 UI
site/model.mjs                 # 브라우저·Worker 공통 v2 스키마
site/catalog.mjs               # 기록 종류별 입력 양식
tools/qa/                      # 가상 GitHub를 사용하는 브라우저 통합 테스트
site/.assetsignore             # 비밀 파일·옛 vault 배포 제외
wrangler.jsonc                 # Worker, 정적 자산, 요청 제한, 저장소 좌표
package.json / package-lock.json
.github/workflows/cloudflare.yml
tools/prepare-cloudflare.mjs    # 비밀 값은 러너 임시 경로에만 생성
tools/check-client.mjs          # 프론트에 연결키·vault가 없는지 검사
tools/smoke-cloudflare.mjs      # 운영 로그인·세션·읽기 점검, 운영 데이터 쓰기 없음
```

Node.js 22 이상이 필요합니다.

```sh
npm ci
npm test
npm run check:client
npx wrangler deploy --dry-run
```

직접 로컬 서버를 실행하려면 `.dev.vars`에 서버 비밀 값을 설정하고 `npm run dev`를 사용합니다. 이 파일은 Git에 커밋하지 마세요. 실제 데이터를 사용하면 로컬 테스트의 저장도 실제 비공개 저장소를 바꾸므로, 가상 기록용 별도 저장소를 권장합니다.

운영 쿠키는 HTTPS용입니다. 배포된 `workers.dev` 또는 사용자 지정 HTTPS 도메인에서 사용하세요.

화면 코드는 외부 ES 모듈이며 CSP의 `script-src self`로 같은 출처 모듈만 실행합니다. 인라인 스크립트와 이벤트 핸들러를 추가하지 마세요. 변경 후 `npm run check:client`를 실행하세요.

브라우저 통합 테스트: `npx playwright install --with-deps chromium` 후 `npm run test:browser`. 테스트 서버는 자동으로 시작·종료되며 가상 기록만 사용합니다. 스크린샷은 `.cache/qa`에 생성됩니다.

## 검증 상태

- 서버 테스트: 인증 전 접근 차단, 올바른/틀린 비밀번호, CSRF, 쿠키 변조·만료, 비밀번호 변경에 따른 세션 만료, 서버 입력 검증, 요청 제한, GitHub 권한 오류·충돌·손상 파일
- 브라우저 통합 테스트: 실제 Worker 핸들러와 가상 GitHub 응답을 연결해 로그인 유지·CRUD·동시 수정·초안 보존 재로그인·로그아웃·S22 배치 확인
- 브라우저 요청에 GitHub 토큰이 없고 같은 출처 API만 사용하는지 확인
- Wrangler의 Worker·정적 자산·요청 제한 바인딩 dry-run 확인

**2026-09-12 실제 Cloudflare 배포 및 읽기 전용 운영 점검 완료.**

- 배포: [성공한 Actions 실행](https://github.com/dampd21/Theme-Sa/actions/runs/34689672510)
- 실제 등록 비밀번호 로그인, HttpOnly/Secure 쿠키, 세션 복원, 비로그인 접근 차단, 비공개 기록 읽기 확인
- 실제 홈페이지의 320/360/384/412/780/1024/1440px 로그인 화면, 잘못된 비밀번호 거절, 같은 출처 요청과 CSP 확인
- GitHub 연결 요청은 Worker 런타임과 호환되는 manual 리다이렉트를 사용하고, 3xx 응답을 거절해 토큰이 다른 주소로 전달되지 않도록 함
- 운영 기록은 수정하지 않았습니다. CRUD·충돌·초안 보존은 가상 GitHub를 사용하는 통합 테스트에서 검증했습니다. 첫 운영 저장은 홈페이지에서 확인하세요.

## 자주 막히는 부분

- **업데이트 후 저장 거절(426):** 예전 화면의 덮어쓰기를 방지합니다. 입력을 복사해 두고 새로고침·재로그인하세요.
- **Actions 설정 오류:** Secrets 3개와 Account ID Variable 1개가 있는지 확인합니다.
- **Cloudflare 인증 오류:** Cloudflare 토큰의 대상 계정·만료·Workers 배포 권한을 확인합니다. GitHub 토큰과 혼동하지 마세요.
- **Cloudflare 서버 준비 안 됨:** Worker의 SITE_PASSWORD, DATA_REPO_TOKEN, SESSION_SECRET을 확인합니다. 정상 CI 배포에서는 함께 등록됩니다.
- **GitHub 권한·만료 오류:** 데이터 토큰의 선택 저장소와 Contents 쓰기 권한을 확인합니다.
- **브랜치 규칙 오류:** 기록 전용 브랜치가 직접 커밋을 허용하는지 확인합니다. 다른 중요 저장소의 보호 규칙을 무작정 해제하지 마세요.
- **새로고침할 때 로그인 해제:** HTTPS 주소인지, 쿠키 차단·시크릿 모드·새 배포·비밀번호 변경·12시간 만료 여부를 확인합니다.
- **요청 제한:** 같은 네트워크의 반복 로그인이나 잦은 요청이 원인일 수 있습니다. 안내 시간 이후 재시도합니다.
- **GitHub Pages에서 API 404:** 이번 버전은 Cloudflare의 새 홈페이지 주소에서 사용해야 합니다.

Cloudflare 및 GitHub 플랜의 사용량·제한은 별도로 확인하세요. 소규모 기록실을 위한 구성이지, 고빈도 대규모 동시 편집용 데이터베이스는 아닙니다.
