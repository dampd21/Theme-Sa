// Shared presentation and small deterministic workshop rules. No private answers here.
export const ROOM_VERSION = 1;
export const WEATHER = [
  ["moon", "달빛", "☽"],
  ["rain", "고요한 비", "☂"],
  ["mist", "옅은 안개", "≋"],
  ["fireflies", "반딧불이", "✧"],
  ["snow", "첫눈", "❄"],
  ["sunset", "노을", "◒"],
];
export const ANOMALIES = [
  ["늦게 도착하는 그림자", "오늘의 그림자는 주인보다 한 박자 늦게 움직입니다."],
  ["거꾸로 놓인 책", "서가의 책 한 권이 자기 자리를 찾는 중입니다."],
  [
    "열세 번째 종소리",
    "소리는 들리지 않지만, 시계에는 작은 종 그림자가 남았습니다.",
  ],
  ["창문에 남은 발자국", "유리 안쪽에 아주 작은 발자국이 보입니다."],
  ["식지 않는 찻잔", "아무도 마시지 않은 차에서 따뜻한 김이 올라옵니다."],
  ["방향을 잃은 별", "창밖의 별 하나가 오늘만 동쪽에 걸렸습니다."],
  ["보이지 않는 손님", "빈 의자에 누군가를 기다리는 방석이 놓여 있습니다."],
];
export const CASES = [
  {
    id: 0,
    tone: "아늑한 신비",
    title: "돌아오는 손님의 찻잔",
    intro:
      "매일 식지 않는 찻잔. 기록실을 찾는 작은 손님은 무엇을 기다리고 있을까요?",
    choices: [
      ["welcome", "환영한다는 인사"],
      ["bell", "더 큰 종소리"],
      ["key", "금빛 열쇠"],
    ],
  },
  {
    id: 1,
    tone: "함께 푸는 추리",
    title: "사라진 페이지의 행방",
    intro:
      "일지의 마지막 페이지가 없어졌습니다. 창문·액자·원혼의 증언을 비교해 보세요.",
    choices: [
      ["shelf", "책장 맨 위"],
      ["frame", "액자 뒷면"],
      ["garden", "정원의 우물"],
    ],
  },
  {
    id: 2,
    tone: "은근한 미스터리",
    title: "열세 번째 액자의 빈자리",
    intro:
      "분명 열두 개였던 액자. 마지막 빈자리는 누구를 위한 것일까요? 갑작스러운 소리나 놀람 연출은 없습니다.",
    choices: [
      ["stranger", "이름 모를 침입자"],
      ["team", "함께 기록하는 우리"],
      ["ghost", "길 잃은 원혼 하나"],
    ],
  },
];
export const SOURCES = [
  ["window", "창문", "▥"],
  ["frame", "액자", "▣"],
  ["spirit", "꼬마 원혼", "◉"],
];
export const ARTIFACTS = [
  "달빛 책갈피",
  "작은 은방울",
  "단풍 봉인 조각",
  "흰 깃털 펜",
  "유리 별 조각",
  "미소 짓는 부적",
  "청록색 실타래",
  "먼지 요정의 단추",
];
export const INK = ["#b7d5a1", "#e4c78b", "#91bfca", "#d4b3d4"];
export const dayKey = (now = Date.now()) =>
  new Date(now + 9 * 3600000).toISOString().slice(0, 10);
export function daySeed(day) {
  let h = 2166136261;
  for (const c of day) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function sceneFor(day) {
  const n = daySeed(day);
  return {
    anomaly: ANOMALIES[n % ANOMALIES.length],
    landscape: ["달빛 연못", "비밀 정원", "안개 낀 다리", "별이 흐르는 숲"][
      n % 4
    ],
    ghost: ["책장 사이", "창문 곁", "액자 아래"][n % 3],
  };
}
// A deliberately small, visible vocabulary; not a claim of dictionary/API validation.
export const WORDS = [
  ...new Set(
    "나무 무지개 개나리 리본 본부 부적 적막 막대 대나무 무늬 그림 림프 프랑스 스승 승리 리듬 금빛 빛깔 달빛 깔개 개미 미로 로봇 봇짐 짐승 승부 부채 채소 소나무 무대 대문 문장 장미 미소 소리 리어카 카메라 라디오 오리 리조트 트리 리더 더위 위로 로마 마루 루비 비밀 밀가루 루머 머리 리본 본능 능력 역사 사과 과자 자리 리본 본문 문어 어부 부엉이 이슬 슬기 기차 차례 예절 절구 구름 음악 악기 기린 린넨 넨네 네모 모자 자전거 거미 미역 역전 전등 등대 대장 장갑 갑옷 옷감 감자 자두 두부 부엌 커피 피리 리듬 마음 음표 표정 정원 원혼 혼자 자랑 랑데부 부자 자동 동굴 굴뚝 뚝배기 기도 도서 서리 리본 본보기 기운 운동 동물 물결 결계 계단 단서 서가 가방 방울 울림 임무 무술 술래 래퍼 퍼즐 즐거움 이야기 기념 념원 원석 석류 유리 리본 본성 성문 문구 구슬 슬픔 품격 격려 여름 음악 악몽 몽상 상자 자물쇠 새벽 벽화 화분 분필 필통 통로 로고 고양이 이불 불꽃 꽃밭 밭일 일기 기억 억새 새싹 산책 책상 상상 상처 처마 마법 법당 당근 근육 육지 지도 도깨비 비늘 늘보 보물 물감 감각 각도 도장 장식 식물 물방울 우산 산길 길잡이 이름 목걸이 시계 계곡 곡식 식탁 탁자".split(
      " ",
    ),
  ),
];
export function nextWords(turns) {
  const used = new Set(turns.map((t) => t.word));
  const tail = turns.at(-1)?.word.at(-1);
  return WORDS.filter((w) => !used.has(w) && (!tail || w[0] === tail));
}
export const MAZE_SIZE = 15;
export const fixedCell = (i) =>
  i === 0 ||
  i === 224 ||
  [4, 9].includes(Math.floor(i / 15)) ||
  [4, 9].includes(i % 15);
export function zoneCells(zone) {
  const r = Math.floor(zone / 3) * 5,
    c = (zone % 3) * 5;
  return Array.from(
    { length: 25 },
    (_, i) => (r + Math.floor(i / 5)) * 15 + c + (i % 5),
  );
}
export function mazePath(cells) {
  const q = [0],
    seen = new Map([[0, -1]]);
  for (let n = 0; n < q.length; n++) {
    const i = q[n];
    if (i === 224) {
      const p = [];
      for (let j = i; j !== -1; j = seen.get(j)) p.push(j);
      return p.reverse();
    }
    for (const j of [
      i - 15,
      i + 15,
      ...(i % 15 ? [i - 1] : []),
      ...(i % 15 < 14 ? [i + 1] : []),
    ])
      if (j >= 0 && j < 225 && !cells[j] && !seen.has(j)) {
        seen.set(j, i);
        q.push(j);
      }
  }
  return null;
}
export function validWalk(cells, path) {
  return (
    Array.isArray(path) &&
    path.length >= 29 &&
    path.length <= 1200 &&
    path[0] === 0 &&
    path.at(-1) === 224 &&
    path.every(
      (n, i) =>
        Number.isInteger(n) &&
        n >= 0 &&
        n < 225 &&
        !cells[n] &&
        (!i ||
          Math.abs(Math.floor(n / 15) - Math.floor(path[i - 1] / 15)) +
            Math.abs((n % 15) - (path[i - 1] % 15)) ===
            1),
    )
  );
}
export function strokePath(points) {
  return points.map(([x, y], i) => (i ? "L" : "M") + x + " " + y).join(" ");
}
