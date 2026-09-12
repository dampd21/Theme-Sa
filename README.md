# Theme-Sa · 관리자 비밀 기록실

**홈페이지:** https://dampd21.github.io/Theme-Sa/

Galaxy S22를 포함한 모바일 화면에서 팀명, 팀장, 팀원과 능력을 관리하는 페이지입니다. 외부 서버 없이 GitHub Pages와 GitHub API만 사용합니다.

## 확정된 로그인 방식

**관리자 본인의 GitHub 개인 접근 토큰으로 로그인합니다. 공용 비밀번호 방식이 아닙니다.**

- 로그인 화면의 연결 저장소는 고정되어 있으며, 토큰 한 칸만 입력하면 됩니다.
- **Fine-grained token 권장**, 관리자용 **Classic token도 지원**합니다.
- 토큰은 공개 HTML, Actions Variables, 로컬·세션 저장소에 넣지 않습니다. 열린 페이지 메모리에만 유지합니다.
- 새로고침하거나 로그아웃하면 다시 입력해야 합니다.
- 토큰이 만료·폐기되면 다음 로그인에는 새 토큰이 필요합니다. 배포 때 사용한 토큰을 사이트에 내장하는 방식이 아닙니다.
- GitHub Pages만으로 안전한 공용 비밀번호 확인과 GitHub 쓰기 권한 중계를 제공할 수 없기 때문에, 이 구성을 선택했습니다.

## 저장소 구조

| 용도 | 저장소 |
|---|---|
| 공개 화면·배포 코드 | `dampd21/Theme-Sa` |
| 비공개 팀 기록 | `dampd21/Theme-Sa-data` |
| 기록 파일 | `main` 브랜치의 `data/team.json` |

화면은 공개되지만 팀 기록은 비공개 저장소에 있습니다. GitHub의 실제 접근 권한으로 보호하며, Public 저장소 연결은 앱에서 거절합니다. 초기 공개 HTML에는 실제 팀원 정보가 없습니다.

기록 파일이 없다면 첫 로그인에서 빈 기록실을 생성할 수 있습니다. 기본 팀명은 `퇴마사`이며 첫 팀원이 팀장이 됩니다.

## 관리자 토큰 준비

### 권장: Fine-grained token

관리자 GitHub 계정의 다음 메뉴로 이동합니다.

**Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**

1. Resource owner: **dampd21**.
2. Repository access: **Only select repositories** → **Theme-Sa-data 하나만**.
3. Repository permissions: **Contents → Read and write**.
4. 만료 기간은 7일 등 짧게 설정합니다.
5. 발급받은 본인 토큰을 위 홈페이지에서 입력합니다.

읽기 전용 토큰도 조회는 가능하지만 저장은 GitHub가 거절합니다. 토큰은 비밀번호와 같은 자격증명이므로 채팅이나 공개 파일에 붙여 넣지 마세요.

### Classic token

`ghp_`로 시작하는 Classic 토큰도 입력할 수 있습니다. 비공개 저장소를 읽고 쓰려면 해당 계정의 저장소 접근 권한과 토큰의 **repo** 권한이 필요합니다.

Classic 토큰은 접근 범위가 넓습니다. 배포·점검용 토큰은 사용 후 GitHub에서 폐기하고, 평소에는 기록 저장소 하나로 제한한 Fine-grained 토큰을 권장합니다. 코드 수정·워크플로 배포 권한을 일상 기록용 토큰에 줄 필요는 없습니다.

## 사용법

1. 로그인 화면에 토큰을 입력합니다.
2. 팀명을 바꾸거나 팀원을 추가·수정합니다.
3. **GitHub에 저장**을 누르고 성공 알림을 확인합니다.
4. **최신 기록** 버튼으로 저장소의 최신 내용을 다시 불러옵니다.
5. 사용 후 우측 상단 자물쇠로 로그아웃합니다.

### 포함 기능

- 팀명 변경, 팀장 지정, 팀원 추가·수정·삭제
- 성별·나이·출생 연도·학교·학년·반·역할·능력·메모
- 검색, 정렬, 카드형·목록형 보기
- 편집하지 않을 때 약 30초마다 최신 변경 확인
- SHA 기반 충돌 감지: 다른 기기에서 먼저 저장했다면 조용히 덮어쓰지 않음
- 미저장 변경의 JSON 보관, 백업·복원
- Galaxy S22 기준 360px 세로 화면에서 한 칸 카드, 읽기 쉬운 입력 글씨, 하단 저장 버튼

입력만 한 내용은 저장되지 않습니다. 저장 성공 알림을 확인해야 합니다.

## 저장 충돌·네트워크 오류

저장 실패 시 초안은 열린 페이지의 메모리에 남습니다. 창을 닫기 전에 **내 변경 파일로 보관**을 사용하세요.

다른 기기의 변경과 충돌했다면 최신 기록을 다시 불러오고 필요한 변경만 재적용합니다. 오래된 초안을 통째로 복원하면 최신 기록을 의도적으로 교체할 수 있으므로 주의하세요.

네트워크 오류는 응답만 유실된 경우도 있습니다. 초안을 보관한 뒤 최신 기록을 확인하세요. 앱은 자동 병합이나 실시간 공동 타이핑을 제공하지 않습니다.

## 개인정보 주의

- 상세 집주소는 적지 마세요. 이름·학교도 필요한 범위로 제한하고 관련자의 동의를 받으세요.
- GitHub는 수정·삭제 전 내용도 **커밋 이력에 남깁니다**. 앱에서 지워도 과거 이력까지 영구 삭제되지는 않습니다.
- JSON 백업에도 개인정보가 들어갈 수 있습니다. 공개 저장소에 올리지 마세요.
- 기록 저장소 `Theme-Sa-data`를 Public으로 바꾸지 마세요.
- 로그인 페이지는 GitHub 토큰을 다루므로 화면 코드를 수정할 권한은 신뢰하는 관리자에게만 주세요.

## 배포 설정

화면 저장소의 **Settings → Pages → Source**는 **GitHub Actions**입니다.

`.github/workflows/static.yml`이 **`site` 폴더만** 배포합니다. 저장소 루트 전체를 배포하면 `/Theme-Sa/`에서 홈페이지를 찾지 못할 수 있습니다.

화면 저장소의 **Settings → Secrets and variables → Actions → Variables**:

| 변수 | 현재 연결값 |
|---|---|
| `ARCHIVE_OWNER` | `dampd21` |
| `ARCHIVE_REPO` | `Theme-Sa-data` |
| `ARCHIVE_BRANCH` | `main` |
| `ARCHIVE_PATH` | `data/team.json` |

이 값들은 공개 저장소 좌표일 뿐이며 비밀 값이 아닙니다. Actions가 이를 `site/config.js`로 생성합니다. 비밀번호나 토큰을 넣지 마세요. 좌표를 바꾸면 워크플로를 다시 실행해야 합니다.

기록 저장은 GitHub API를 통하므로 팀원을 수정할 때마다 Pages를 다시 배포할 필요는 없습니다.

워크플로는 공개 산출물에 자격증명처럼 보이는 문자열이 들어 있지 않은지, 인라인 JavaScript CSP 해시가 맞는지도 확인합니다.

## 소스 파일

```text
.github/workflows/static.yml   # Pages 배포 및 공개 설정 생성
site/index.html               # 화면·스타일·앱 코드
site/config.js                # 공개 연결 설정, 비밀 값 금지
site/.nojekyll
```

`tests` 폴더는 기존 개발용 테스트 자료이며 Pages 산출물에는 포함하지 않습니다. 실제 운영 자격증명이나 개인정보를 테스트 파일에 넣지 마세요.

JavaScript를 수정하면 `index.html`의 CSP 해시도 갱신해야 합니다. HTML·CSS만 바꾸는 경우는 필요 없습니다.

```python
from pathlib import Path
import re, hashlib, base64
p = Path('site/index.html')
s = p.read_text(encoding='utf-8')
script = re.search(r'<script>(.*?)</script>', s, re.S).group(1)
digest = base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
s = re.sub(r'sha256-[A-Za-z0-9+/=]+', 'sha256-' + digest, s, count=1)
p.write_text(s, encoding='utf-8')
```

## 문제 해결

- **401:** 토큰 만료·폐기·오입력 여부를 확인합니다.
- **403:** 사용자 권한, Contents 쓰기 권한, API 제한 또는 브랜치 보호 규칙을 확인합니다.
- **404:** 기록 저장소가 `Theme-Sa-data`인지, 브랜치·경로와 토큰의 선택 저장소가 맞는지 확인합니다.
- **409:** 저장 충돌입니다. 초안을 보관하고 최신 기록을 불러옵니다.
- **Pages 배포 실패:** Actions에서 `Deploy static content to Pages` 실행 결과와 Variables를 확인합니다.
- **파일 미리보기에서 연결 실패:** 네트워크 제한이 없는 실제 HTTPS 홈페이지 주소에서 사용합니다.

최대 팀원 수는 300명, 기록 JSON은 900KB입니다. 첨부 이미지·파일은 지원하지 않습니다.
