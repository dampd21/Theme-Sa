// 이 파일은 공개됩니다. 비밀번호, 개인 접근 토큰, 개인정보를 절대 넣지 마세요.
// 로컬 테스트 때만 아래 저장소 주소를 직접 설정하세요.
// GitHub Actions 배포 시에는 Actions Variables의 ARCHIVE_OWNER/REPO/BRANCH/PATH로 재생성됩니다.
// 권장: GitHub 조직(Organization) 소유의 비공개 기록 저장소.
window.ARCHIVE_CONFIG = Object.freeze({
  owner: "",                  // 예: "our-spirit-team" (조직명 또는 본인 사용자명)
  repo: "",                   // 예: "spirit-team-data" (반드시 비공개)
  branch: "main",             // 기록 저장 브랜치. 기존 브랜치여야 합니다.
  path: "data/team.json"       // 공동 기록 파일. 없으면 최초 연결 때 생성합니다.
});
