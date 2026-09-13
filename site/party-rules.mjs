// Shared validation and deterministic bracket/ladder mechanics. No remote dependencies.
export const PARTY_VERSION = 1;
export const SIZES = [64, 32, 16, 8, 4, 2];
export const GAMES = {
  ladder: ["🪜", "운명의 사다리", "이름과 결과를 연결하는 진짜 사다리"],
  wheel: ["🎡", "달빛 룰렛", "모든 칸이 같은 확률인 회전판"],
  draw: ["🎴", "봉인 제비뽑기", "뒤집힌 봉투를 골라 하나씩 공개"],
  teams: ["🤝", "랜덤 팀 나누기", "인원 차이가 1명 이내인 무작위 팀"],
  order: ["🔢", "순서 뽑기", "빠짐없이 한 번씩, 오늘의 순서"],
  bomb: ["💣", "두근두근 폭탄 돌리기", "한 기기를 돌려 가며 즐기는 긴장감"],
  dice: ["🎲", "주사위", "1~6의 눈을 한꺼번에 굴리기"],
  coin: ["🌗", "양면 동전", "앞과 뒤의 문구도 내 마음대로"],
};
export function randomInt(n) {
  if (!Number.isSafeInteger(n) || n < 1 || n > 0x100000000)
    throw Error("무작위 범위 오류");
  const x = new Uint32Array(1),
    limit = Math.floor(0x100000000 / n) * n;
  do {
    crypto.getRandomValues(x);
  } while (x[0] >= limit);
  return x[0] % n;
}
export function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
export function lines(s, max = 64) {
  const a = String(s)
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (a.length < 2 || a.length > max || a.some((x) => x.length > 60))
    throw Error(
      `한 줄에 하나씩, 2~${max}개를 입력하세요. 각 문구는 60자까지입니다.`,
    );
  return a;
}
export const idOK = (x) =>
  typeof x === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(x);
export const hashOK = (x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const text = (v, n, blank = false) =>
  typeof v === "string" && v.length <= n && (blank || v.trim().length > 0);
export function checkJPEG(src) {
  if (src === "") return true;
  if (
    typeof src !== "string" ||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(src) ||
    src.length > 10947
  )
    return false;
  try {
    const s = atob(src.slice(23));
    if (
      s.length > 8192 ||
      s.charCodeAt(0) !== 255 ||
      s.charCodeAt(1) !== 216 ||
      s.charCodeAt(s.length - 2) !== 255 ||
      s.charCodeAt(s.length - 1) !== 217
    )
      return false;
    let i = 2,
      found = false;
    while (i < s.length - 2) {
      if (s.charCodeAt(i++) !== 255) return false;
      const marker = s.charCodeAt(i++);
      if (marker === 0xda) return found;
      const len = s.charCodeAt(i) * 256 + s.charCodeAt(i + 1);
      if (len < 2 || i + len > s.length || marker === 0xe1) return false; // Reject EXIF, canvas output has none.
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        const h = s.charCodeAt(i + 3) * 256 + s.charCodeAt(i + 4),
          w = s.charCodeAt(i + 5) * 256 + s.charCodeAt(i + 6);
        if (len < 8 || !w || !h || w > 320 || h > 320) return false;
        found = true;
      }
      i += len;
    }
  } catch {
    return false;
  }
  return false;
}
export function validateCup(c) {
  if (
    !c ||
    c.version !== 1 ||
    !text(c.title, 80) ||
    !text(c.description, 500, true) ||
    !Array.isArray(c.candidates) ||
    c.candidates.length < 2 ||
    c.candidates.length > 64
  )
    throw Error("제목과 후보 2~64개를 확인해 주세요.");
  if (new Set(c.candidates.map((x) => x?.id)).size !== c.candidates.length)
    throw Error("후보 ID가 중복됩니다.");
  for (const x of c.candidates)
    if (!x || !idOK(x.id) || !text(x.name, 60) || !checkJPEG(x.image))
      throw Error(
        "후보 이름 또는 사진 형식이 올바르지 않습니다. 사진은 자동 압축된 JPEG 8KB 이하만 저장합니다.",
      );
  return {
    version: 1,
    title: c.title.trim(),
    description: c.description.trim(),
    candidates: c.candidates.map((x) => ({
      id: x.id,
      name: x.name.trim(),
      image: x.image,
    })),
  };
}
export function bracket(order, picks = []) {
  if (
    !SIZES.includes(order?.length) ||
    new Set(order).size !== order.length ||
    !order.every(idOK) ||
    !Array.isArray(picks) ||
    picks.length >= order.length
  )
    throw Error("대진표 형식이 올바르지 않습니다.");
  let pool = [...order],
    winners = [],
    match = 0;
  const history = [];
  for (const pick of picks) {
    const pair = pool.slice(match * 2, match * 2 + 2);
    if (pool.length < 2 || !pair.includes(pick))
      throw Error("대진표에 없는 선택입니다.");
    history.push({ size: pool.length, pair, winner: pick });
    winners.push(pick);
    match++;
    if (winners.length === pool.length / 2) {
      pool = winners;
      winners = [];
      match = 0;
    }
  }
  return {
    size: pool.length,
    match,
    pair: pool.length > 1 ? pool.slice(match * 2, match * 2 + 2) : [],
    champion: pool.length === 1 ? pool[0] : null,
    history,
  };
}
export function validatePreset(c) {
  if (
    !c ||
    !Object.hasOwn(GAMES, c.game) ||
    !text(c.title, 80) ||
    !Array.isArray(c.entries) ||
    !Array.isArray(c.outcomes) ||
    c.entries.length < 2 ||
    c.entries.length > 64 ||
    c.outcomes.length > 64 ||
    ![...c.entries, ...c.outcomes].every((x) => text(x, 60)) ||
    !Number.isInteger(c.teams) ||
    c.teams < 2 ||
    c.teams > 16 ||
    !Number.isInteger(c.dice) ||
    c.dice < 1 ||
    c.dice > 6 ||
    !Number.isInteger(c.min) ||
    !Number.isInteger(c.max) ||
    c.min < 5 ||
    c.max > 60 ||
    c.min > c.max
  )
    throw Error("복불복 설정 범위가 올바르지 않습니다.");
  if (
    c.game === "ladder" &&
    (c.entries.length > 12 || c.entries.length !== c.outcomes.length)
  )
    throw Error("사다리는 2~12명이며 이름과 결과의 개수가 같아야 합니다.");
  if (c.game === "coin" && c.entries.length !== 2)
    throw Error("동전은 앞과 뒤 두 문구를 입력하세요.");
  if (c.game === "teams" && c.teams > c.entries.length)
    throw Error("팀 수는 참가자 수 이하여야 합니다.");
  return {
    title: c.title.trim(),
    game: c.game,
    entries: c.entries.map((x) => x.trim()),
    outcomes: c.outcomes.map((x) => x.trim()),
    teams: c.teams,
    dice: c.dice,
    min: c.min,
    max: c.max,
  };
}
// Build a real adjacent-swap ladder for a uniformly chosen terminal permutation.
export function ladder(
  n,
  target = shuffle(Array.from({ length: n }, (_, i) => i)),
) {
  if (
    !Number.isInteger(n) ||
    n < 2 ||
    n > 12 ||
    target.length !== n ||
    [...target].sort((a, b) => a - b).some((x, i) => x !== i)
  )
    throw Error("사다리 인원 오류");
  const at = Array.from({ length: n }, (_, i) => i),
    rungs = [];
  for (let end = 0; end < n; end++) {
    let pos = at.indexOf(target[end]);
    while (pos > end) {
      rungs.push(pos - 1);
      [at[pos - 1], at[pos]] = [at[pos], at[pos - 1]];
      pos--;
    }
  }
  // Two identical swaps add visual interest without changing the mapping.
  for (let i = 0; i < 4; i++) {
    const k = randomInt(n - 1),
      p = randomInt(rungs.length + 1);
    rungs.splice(p, 0, k, k);
  }
  const results = Array.from({ length: n }, (_, i) => at.indexOf(i));
  return { rungs, results };
}
export function traceLadder(n, rungs, start) {
  let col = start;
  const points = [[start, 0]];
  rungs.forEach((left, row) => {
    points.push([col, row + 1]);
    if (col === left) col++;
    else if (col === left + 1) col--;
    points.push([col, row + 1]);
  });
  points.push([col, rungs.length + 1]);
  return points;
}
export function teams(entries, count) {
  if (count < 2 || count > entries.length) throw Error("팀 수를 확인하세요.");
  const out = Array.from({ length: count }, () => []);
  shuffle(entries.map((name, index) => ({ name, index }))).forEach((x, i) =>
    out[i % count].push(x),
  );
  return out;
}
