import { APPRAISALS, CUSTOMERS, LIAR, GAME_INFO } from "./world-content.mjs";
const border = (n) =>
  Array.from({ length: n * n }, (_, i) => i).filter(
    (i) => i < n || i >= n * (n - 1) || i % n === 0 || i % n === n - 1,
  );
export const TACTICS = [
  { width: 5, player: 6, ghosts: [7, 12], goals: [8, 13], walls: border(5) },
  { width: 6, player: 7, ghosts: [8, 15], goals: [10, 22], walls: border(6) },
  {
    width: 7,
    player: 8,
    ghosts: [16, 24],
    goals: [12, 36],
    walls: [...border(7), 18, 25, 32],
  },
];
const DIR = { up: -5, down: 5, left: -1, right: 1 };
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shadowCells(piece, rot, shift) {
  const patterns = [
    [
      [0, 0],
      [0, 1],
      [1, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    [
      [0, 0],
      [1, 1],
    ],
  ];
  return patterns[piece].map(([x, y]) => {
    for (let i = 0; i < rot; i++) [x, y] = [3 - y, x];
    return y * 4 + ((x + shift) % 4);
  });
}
export function shadowMask(rots, shifts) {
  return [
    ...new Set(rots.flatMap((r, i) => shadowCells(i, r, shifts[i]))),
  ].sort((a, b) => a - b);
}
export function shadowTarget(level) {
  return shadowMask(
    [1, 2, 3].map((v) => (v + level) % 4),
    [1, 0, 2].map((v) => (v + level) % 4),
  );
}
export function initialGame(type, level = 0, seed = 1) {
  if (
    !Object.hasOwn(GAME_INFO, type) ||
    !Number.isInteger(level) ||
    level < 0 ||
    level > 2 ||
    !Number.isInteger(seed)
  )
    throw Error("게임 형식 오류");
  const common = { type, level, seed, status: "active", steps: 0, note: "" };
  if (type === "tactics")
    return { ...common, ...structuredClone(TACTICS[level]) };
  if (type === "appraisal")
    return { ...common, index: 0, inspected: [], lives: 3 };
  if (type === "shop") return { ...common, index: 0, lives: 3 };
  if (type === "shadow")
    return { ...common, rots: [0, 0, 0], shifts: [0, 0, 0] };
  if (type === "liar") return { ...common, index: 0, lives: 3 };
  if (type === "stars") return { ...common, path: [0] };
  const rand = rng(seed),
    cards = [
      "purify",
      "purify",
      "ward",
      "ward",
      "observe",
      "talk",
      "talk",
      "heal",
    ];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return {
    ...common,
    hp: 16,
    shield: 0,
    enemy: 7 + level,
    resolve: 5,
    battle: 0,
    cursor: 0,
    cards,
    reward: false,
  };
}
export const CARDS = {
  purify: ["✨", "정화", "상대 기운 −3"],
  ward: ["🛡️", "결계", "이번 공격 4 방어"],
  observe: ["👁️", "관찰", "상대 기운 −1 · 마음 −1 · 공격 1 방어"],
  talk: ["💬", "대화", "상대 마음 −3"],
  heal: ["🌿", "회복", "생명 +3"],
  sun: ["☀️", "새벽", "상대 기운 −5"],
  peace: ["🕊️", "평온", "상대 마음 −4"],
};
export function gameStep(previous, action) {
  const s = structuredClone(previous);
  if (s.status !== "active") throw Error("끝난 게임입니다.");
  if (!action || typeof action !== "object" || s.steps >= 240)
    throw Error("진행 한도를 넘었어요. 새 게임으로 다시 시작하세요.");
  s.steps++;
  s.note = "";
  const { type } = s;
  if (type === "tactics") {
    if (!Object.hasOwn(DIR, action.move)) throw Error("방향을 선택하세요.");
    const d =
        action.move === "up"
          ? -s.width
          : action.move === "down"
            ? s.width
            : DIR[action.move],
      to = s.player + d;
    if (s.walls.includes(to)) throw Error("벽으로 갈 수 없어요.");
    const box = s.ghosts.indexOf(to);
    if (box >= 0) {
      const next = to + d;
      if (s.walls.includes(next) || s.ghosts.includes(next))
        throw Error("그쪽으로 밀 수 없어요.");
      s.ghosts[box] = next;
    }
    s.player = to;
    if (s.ghosts.every((x) => s.goals.includes(x))) s.status = "won";
  } else if (type === "appraisal") {
    const item = APPRAISALS[(s.index + s.level) % APPRAISALS.length];
    if (
      Number.isInteger(action.inspect) &&
      action.inspect >= 0 &&
      action.inspect < 3
    ) {
      if (s.inspected.includes(action.inspect)) throw Error("이미 관찰했어요.");
      s.inspected.push(action.inspect);
      s.note = item.tests[action.inspect];
    } else if (["safe", "return", "seal"].includes(action.judge)) {
      if (s.inspected.length !== 3)
        throw Error("세 가지 관찰을 먼저 마쳐 주세요.");
      if (action.judge === item.answer) {
        s.note = item.story;
        s.index++;
        s.inspected = [];
        if (s.index === 5) s.status = "won";
      } else {
        s.lives--;
        s.note = "관찰 결과와 맞지 않아요. 다시 비교해 보세요.";
        if (!s.lives) s.status = "lost";
      }
    } else throw Error("관찰 또는 감정 결과를 선택하세요.");
  } else if (type === "shop") {
    if (typeof action.tea !== "string") throw Error("차를 골라 주세요.");
    const c = CUSTOMERS[(s.index + s.level) % 5];
    if (action.tea === c[3]) {
      s.note = c[4];
      s.index++;
      if (s.index === 5) s.status = "won";
    } else {
      s.lives--;
      s.note = "손님의 주문과 향이 달라요. 말을 다시 읽어 보세요.";
      if (!s.lives) s.status = "lost";
    }
  } else if (type === "shadow") {
    if (action.check) {
      if (
        JSON.stringify(shadowMask(s.rots, s.shifts)) ===
        JSON.stringify(shadowTarget(s.level))
      )
        s.status = "won";
      else s.note = "빛이 닿는 칸과 목표 그림자를 비교해 보세요.";
    } else {
      if (
        !Number.isInteger(action.piece) ||
        action.piece < 0 ||
        action.piece > 2 ||
        !["rotate", "shift"].includes(action.kind)
      )
        throw Error("그림자 조각을 선택하세요.");
      const a = action.kind === "rotate" ? s.rots : s.shifts;
      a[action.piece] = (a[action.piece] + 1) % 4;
    }
  } else if (type === "liar") {
    if (!Number.isInteger(action.door) || action.door < 0 || action.door > 2)
      throw Error("문을 고르세요.");
    const q = LIAR[(s.index + s.level) % 3];
    if (action.door === q.answer) {
      s.note = q.proof;
      s.index++;
      if (s.index === 3) s.status = "won";
    } else {
      s.lives--;
      s.note = "참인 문장의 개수를 다시 세어 보세요.";
      if (!s.lives) s.status = "lost";
    }
  } else if (type === "stars") {
    const a = s.path.at(-1),
      b = action.star;
    if (
      !Number.isInteger(b) ||
      b < 0 ||
      b >= 12 ||
      s.path.includes(b) ||
      Math.abs((a % 4) - (b % 4)) +
        Math.abs(Math.floor(a / 4) - Math.floor(b / 4)) !==
        1
    )
      throw Error("가로·세로로 이웃한, 아직 지나지 않은 별을 골라 주세요.");
    s.path.push(b);
    if (b === 11) {
      const required = [
        [3, 6, 8],
        [2, 4, 9],
        [1, 7, 8],
      ][s.level];
      s.status = required.every((x) => s.path.includes(x)) ? "won" : "lost";
      s.note =
        s.status === "won"
          ? "길 잃은 영혼이 마지막 별에 도착했어요."
          : "필수 별빛을 모두 지나야 해요. 새 경로로 다시 도전하세요.";
    }
  } else if (type === "deck") {
    if (s.reward) {
      if (!["rest", "sun", "peace"].includes(action.reward))
        throw Error("보상을 골라 주세요.");
      if (action.reward === "rest") s.hp = Math.min(16, s.hp + 5);
      else s.cards.push(action.reward);
      s.reward = false;
      s.enemy = 7 + s.battle * 2 + s.level;
      s.resolve = 5 + s.battle;
      s.note = "새 길로 출발합니다.";
      return s;
    }
    if (!Number.isInteger(action.card) || action.card < 0 || action.card > 2)
      throw Error("손패에서 카드를 골라 주세요.");
    const at = (s.cursor + action.card) % s.cards.length,
      card = s.cards[at];
    s.cursor = (at + 1) % s.cards.length;
    if (card === "purify") s.enemy -= 3;
    if (card === "sun") s.enemy -= 5;
    if (card === "ward") s.shield += 4;
    if (card === "observe") {
      s.enemy--;
      s.resolve--;
      s.shield++;
    }
    if (card === "talk") s.resolve -= 3;
    if (card === "peace") s.resolve -= 4;
    if (card === "heal") s.hp = Math.min(16, s.hp + 3);
    if (s.enemy <= 0 || s.resolve <= 0) {
      s.note =
        s.resolve <= 0
          ? "협상으로 길을 열었습니다."
          : "흩어진 기운을 정화했습니다.";
      s.battle++;
      s.shield = 0;
      if (s.battle === 5) s.status = "won";
      else s.reward = true;
    } else {
      const attack = 2 + (s.battle % 2);
      s.hp -= Math.max(0, attack - s.shield);
      s.shield = 0;
      s.note = `예고된 공격 ${attack}을 받았습니다.`;
      if (s.hp <= 0) s.status = "lost";
    }
  }
  return s;
}
export function replayGame(run, actions = run.actions) {
  if (!Array.isArray(actions) || actions.length > 240)
    throw Error("게임 기록 오류");
  let s = initialGame(run.type, run.level, run.seed);
  for (const a of actions) s = gameStep(s, a);
  return s;
}
export function hints(s) {
  const type = s.type;
  if (type === "tactics")
    return [
      "요괴는 앞에서 밀 수 있지만 당길 수는 없어요.",
      "벽 모서리에 갇히지 않도록 목표 결계 쪽에서부터 역으로 생각하세요.",
      "막히면 새 게임으로 초기화하세요. 1단계: 오른쪽 → 왼쪽 → 아래 → 오른쪽. 2단계: 오른쪽 → 오른쪽 → 아래 → 왼쪽 → 아래 → 오른쪽. 3단계: 오른쪽 → 아래 → 아래 → 아래 → 오른쪽 → 아래 → 왼쪽 → 위 → 오른쪽 → 위 → 위 → 왼쪽 → 위 → 오른쪽 → 오른쪽.",
    ];
  if (type === "appraisal")
    return [
      "세 관찰을 비교하세요.",
      "보호하는 약속이면 돌려주기, 균열과 공격 반응이면 봉인, 평온한 생활 도구면 안전합니다.",
      APPRAISALS[(s.index + s.level) % 5].story,
    ];
  if (type === "shop")
    return [
      "손님의 말에서 원하는 향과 느낌을 찾으세요.",
      "기억을 위한 무향은 맑은 물, 따뜻한 매운 향은 생강, 부드러운 단맛은 꿀입니다.",
      `이번 주문: ${CUSTOMERS[(s.index + s.level) % 5][3]}`,
    ];
  if (type === "shadow")
    return [
      "현재 그림자와 목표의 채워진 칸을 비교하세요.",
      "각 조각은 회전 후 가로로 이동합니다. 오른쪽 끝에서는 왼쪽으로 이어집니다.",
      `조각 회전: ${[1, 2, 3].map((v) => (v + s.level) % 4).join(", ")} / 가로 이동: ${[1, 0, 2].map((v) => (v + s.level) % 4).join(", ")}`,
    ];
  if (type === "liar")
    return [
      "각 문이 안전하다고 가정해 보세요.",
      "가정마다 참인 문장 수를 세어 조건과 비교하세요.",
      LIAR[(s.index + s.level) % 3].proof,
    ];
  if (type === "stars")
    return [
      "금색 별 세 개를 모두 지나 마지막 별로 가야 해요.",
      "막다른 길로 먼저 들어가면 돌아올 수 없어요. 바깥쪽을 크게 돌아보세요.",
      "모든 단계에서 가능한 경로: 1 → 2 → 3 → 4 → 8 → 7 → 6 → 5 → 9 → 10 → 11 → 12.",
    ];
  return [
    "상대의 기운이나 마음 중 하나를 0으로 만들면 통과해요.",
    "공격 예고를 보고 방어·회복을 섞고, 만남 뒤 보상을 고르세요.",
    "초반에는 대화 두 번이 강력해요. 보상에서 평온을 고르면 후반의 높은 기운을 피해 협상할 수 있습니다.",
  ];
}
