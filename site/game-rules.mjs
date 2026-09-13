// Shared, deterministic rules. Scores and XP are recalculated by the Worker.
export const RULES_VERSION = 1;
export const DIFFICULTY_VERSION = 2;
export const difficultyPhase = (t) => Math.min(6, 1 + Math.floor(t / 30000));
export const guardWindow = (round, difficulty = 2) =>
  difficulty === 2
    ? {
        perfect: Math.max(42, 90 - round * 2.5),
        hit: Math.max(95, 220 - round * 6),
      }
    : { perfect: 90, hit: 220 };
export const memoryBeat = (length, difficulty = 2) =>
  difficulty === 2 ? Math.max(270, 540 - (length - 3) * 38) : 500;
export const ABILITIES = [
  "집중력",
  "기동력",
  "방어력",
  "감지력",
  "정화력",
  "협동력",
];
export const GAMES = {
  focus: {
    name: "7.77초의 봉인",
    ability: 0,
    icon: "◷",
    tag: "TIMING",
    desc: "정확히 7.77초에 멈춰 봉인을 완성하세요.",
    modes: [
      ["visible", "시간 표시"],
      ["hidden", "3초 후 가리기"],
    ],
    limit: 20000,
  },
  agility: {
    name: "도깨비불 회피",
    ability: 1,
    icon: "✧",
    tag: "DODGE",
    desc: "예고되는 도깨비불을 피해 90초 동안 버텨 보세요.",
    modes: [["standard", "공정 훈련"]],
    limit: 90000,
  },
  defense: {
    name: "찰나의 결계",
    ability: 2,
    icon: "⬡",
    tag: "GUARD",
    desc: "공격이 닿는 순간에 결계를 펼치세요. 총 20회.",
    modes: [["standard", "20회 방어"]],
    limit: 40000,
  },
  sense: {
    name: "숨어 있는 원혼",
    ability: 3,
    icon: "◎",
    tag: "OBSERVE",
    desc: "다른 문양 하나를 찾아요. 45초 안에 20문제!",
    modes: [["standard", "관찰 훈련"]],
    limit: 45000,
  },
  purify: {
    name: "부적 순서 잇기",
    ability: 4,
    icon: "✦",
    tag: "MEMORY",
    desc: "빛나는 문양의 순서를 기억하고 정화를 완성하세요.",
    modes: [["standard", "순서 기억"]],
    limit: 120000,
  },
  coop: {
    name: "공동 봉인 릴레이",
    ability: 5,
    icon: "⌘",
    tag: "TOGETHER",
    desc: "서로 다른 세 프로필이 봉인을 이어 완성해요.",
    modes: [
      ["relay", "공동 봉인"],
      ["practice", "혼자 연습 · XP 없음"],
    ],
    limit: 45000,
  },
  survival: {
    name: "퇴마 생존전",
    ability: null,
    icon: "⚔",
    tag: "SURVIVAL",
    desc: "자동 공격하는 퇴마사로 최대 3분 동안 살아남으세요.",
    modes: [
      ["fair", "공정 도전 · 모두 0"],
      ["growth", "성장 도전 · 내 능력치"],
    ],
    limit: 180000,
  },
};
export const MAX_LEVEL = 30;
export const levelCost = (level) => 60 + level * 5;
export const MAX_XP = Array.from({ length: MAX_LEVEL }, (_, i) =>
  levelCost(i),
).reduce((a, b) => a + b, 0);
export function progress(xp = 0) {
  xp = Math.max(0, Math.min(MAX_XP, Number(xp) || 0));
  let level = 0,
    left = xp;
  while (level < MAX_LEVEL && left >= levelCost(level)) {
    left -= levelCost(level);
    level++;
  }
  return {
    xp,
    level,
    current: level === MAX_LEVEL ? 0 : left,
    needed: level === MAX_LEVEL ? 0 : levelCost(level),
    percent:
      level === MAX_LEVEL ? 100 : Math.floor((left / levelCost(level)) * 100),
  };
}
export const zeroXP = () => [0, 0, 0, 0, 0, 0];
export const levels = (p) => (p?.xp || zeroXP()).map((x) => progress(x).level);
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function attackTimes(seed, difficulty = 1) {
  const rng = random(seed);
  let t = 1500;
  return Array.from(
    { length: 20 },
    (_, i) =>
      (t +=
        (difficulty === 2 ? Math.max(590, 1450 - i * 43) : 1150) +
        Math.floor(rng() * (difficulty === 2 ? 330 : 450))),
  );
}
export function puzzle(seed, round, difficulty = 1) {
  const rng = random((seed + Math.imul(round + 1, 7919)) >>> 0),
    size =
      difficulty === 2
        ? Math.min(25, 6 + Math.floor(round / 2) * 3)
        : Math.min(16, 6 + Math.floor(round / 3) * 2);
  return {
    size,
    target: Math.floor(rng() * size),
    symbol: Math.floor(rng() * 4),
  };
}
export function sequence(seed) {
  const rng = random(seed);
  return Array.from({ length: 10 }, () => Math.floor(rng() * 4));
}
export function memoryInfo(run, actions) {
  const seq = sequence(run.seed),
    single = run.game === "coop",
    initial = single ? 3 + (run.stage || 0) : 3;
  let length = initial,
    roundStart = 0,
    index = 0,
    cleared = 0,
    failed = false,
    complete = false,
    last = 0;
  for (const e of actions) {
    if (failed || complete) throw new Error("종료 이후의 입력입니다.");
    if (
      e.t <
      roundStart + length * memoryBeat(length, run.difficulty || 1) + 650
    )
      throw new Error("문양을 보여주는 동안에는 입력할 수 없어요.");
    if (e.index !== seq[index]) {
      failed = true;
      last = e.t;
      continue;
    }
    index++;
    last = e.t;
    if (index === length) {
      cleared++;
      if (single || length === 10) {
        complete = true;
        continue;
      }
      length++;
      index = 0;
      roundStart = e.t + 550;
    }
  }
  return {
    length,
    index,
    cleared,
    failed,
    complete,
    last,
    roundStart,
    beat: memoryBeat(length, run.difficulty || 1),
    watchUntil:
      roundStart + length * memoryBeat(length, run.difficulty || 1) + 650,
    seq,
  };
}
export const STEP = 50,
  WORLD = 480;
export function createSim(run, visual = true) {
  const stat =
    run.game === "survival" && run.mode === "growth"
      ? run.levels
      : [0, 0, 0, 0, 0, 0];
  const hp = 3 + Math.floor(stat[2] / 10);
  return {
    visual,
    game: run.game,
    difficulty: run.difficulty || 1,
    t: 0,
    rng: random(run.seed),
    stats: stat,
    p: { x: 240, y: 240, hp, maxHp: hp, inv: 0 },
    enemies: [],
    sparks: [],
    pickups: [],
    kills: 0,
    nextSpawn: 1800,
    nextAttack: 600,
    nextSupport: 20000,
    ended: false,
    limit: GAMES[run.game].limit,
  };
}
export function stepSim(s, target = { x: 240, y: 240 }) {
  if (s.ended) return s;
  s.t += STEP;
  const dt = STEP / 1000,
    p = s.p,
    dx = target.x - p.x,
    dy = target.y - p.y,
    d = Math.hypot(dx, dy),
    speed = 116 + s.stats[1] * 0.85;
  if (d > 0) {
    const move = Math.min(speed * dt, d);
    p.x += (dx / d) * move;
    p.y += (dy / d) * move;
  }
  p.x = Math.max(14, Math.min(466, p.x));
  p.y = Math.max(14, Math.min(466, p.y));
  if (s.t >= s.nextSpawn) {
    const edge = Math.floor(s.rng() * 4),
      v = 20 + s.rng() * 440,
      x = edge === 0 ? -12 : edge === 1 ? 492 : v,
      y = edge === 2 ? -12 : edge === 3 ? 492 : v,
      angle = Math.atan2(p.y - y, p.x - x),
      velocity =
        s.difficulty === 2
          ? s.game === "agility"
            ? 100 + s.t / 650
            : 40 + s.t / 2600
          : s.game === "agility"
            ? 72 + s.t / 2500
            : 24 + s.t / 8000;
    s.enemies.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      speed: velocity,
      hp:
        s.game === "agility"
          ? 1
          : 1 + Math.floor(s.t / (s.difficulty === 2 ? 40000 : 75000)),
      born: s.t,
      warning:
        (s.difficulty === 2 ? Math.max(230, 650 - s.t / 260) : 600) +
        s.stats[3] * 6,
      r: 8 + (s.game === "survival" ? 4 : 0),
    });
    if (s.difficulty === 2 && s.t >= 30000) {
      const base = s.enemies.at(-1),
        count = s.t >= 90000 ? 2 : 1;
      for (let j = 0; j < count; j++) {
        const x = j ? base.y : WORLD - base.x,
          y = j ? WORLD - base.x : WORLD - base.y,
          ang = Math.atan2(p.y - y, p.x - x);
        s.enemies.push({
          ...base,
          x,
          y,
          vx: Math.cos(ang) * velocity,
          vy: Math.sin(ang) * velocity,
          r: base.r + (s.game === "survival" && s.t >= 60000 ? 3 : 0),
        });
      }
    }
    s.nextSpawn =
      s.t +
      Math.max(
        s.game === "agility" ? 260 : 370,
        (s.game === "agility" ? 1100 : 1300) -
          s.t / (s.difficulty === 2 ? 90 : 130),
      );
  }
  for (const e of s.enemies) {
    if (s.t < e.born + e.warning) continue;
    if (s.game === "survival") {
      const dx = p.x - e.x,
        dy = p.y - e.y,
        d = Math.sqrt(dx * dx + dy * dy) || 1;
      e.vx = (dx / d) * e.speed;
      e.vy = (dy / d) * e.speed;
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    if (
      e.hp > 0 &&
      (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < (e.r + 10) ** 2 &&
      s.t >= p.inv
    ) {
      p.hp--;
      p.inv = s.t + 1000;
      e.hp = 0;
      if (s.visual) s.sparks.push({ x: p.x, y: p.y, t: s.t, kind: "hurt" });
    }
  }
  if (s.game === "survival" && s.t >= s.nextAttack) {
    let hit = null,
      nearest = (82 + s.stats[4]) ** 2;
    for (const e of s.enemies) {
      const distance = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (e.hp > 0 && s.t >= e.born + e.warning && distance < nearest) {
        hit = e;
        nearest = distance;
      }
    }
    if (hit) {
      hit.hp -= 1 + Math.floor(s.stats[4] / 15);
      if (s.visual) s.sparks.push({ x: hit.x, y: hit.y, t: s.t, kind: "hit" });
      if (hit.hp <= 0) {
        s.kills++;
        if (s.kills % 5 === 0) s.pickups.push({ x: hit.x, y: hit.y });
      }
    }
    s.nextAttack = s.t + Math.max(400, 720 - s.stats[0] * 7);
  }
  if (s.game === "survival" && s.t >= s.nextSupport) {
    p.inv = Math.max(p.inv, s.t + 500 + s.stats[5] * 35);
    s.nextSupport = s.t + 20000;
    if (s.visual) s.sparks.push({ x: p.x, y: p.y, t: s.t, kind: "support" });
  }
  s.pickups = s.pickups.filter((i) => {
    if (Math.hypot(i.x - p.x, i.y - p.y) < 22 + s.stats[3]) {
      p.hp = Math.min(p.maxHp, p.hp + 1);
      return false;
    }
    return true;
  });
  s.enemies = s.enemies
    .filter((e) => e.hp > 0 && e.x > -50 && e.x < 530 && e.y > -50 && e.y < 530)
    .slice(-80);
  if (s.visual) s.sparks = s.sparks.filter((e) => s.t - e.t < 400);
  s.ended = p.hp <= 0 || s.t >= s.limit;
  return s;
}
function checkActions(actions, max, duration) {
  if (!Array.isArray(actions) || actions.length > max)
    throw new Error("입력 기록 개수가 올바르지 않아요.");
  let last = -1;
  for (const e of actions) {
    if (!e || !Number.isInteger(e.t) || e.t < 0 || e.t > duration || e.t < last)
      throw new Error("입력 시간이 올바르지 않아요.");
    last = e.t;
  }
  return actions;
}
export function evaluate(run, body) {
  const { duration, actions } = body;
  if (
    !GAMES[run.game] ||
    !Number.isInteger(duration) ||
    duration < 1 ||
    duration > GAMES[run.game].limit + 500
  )
    throw new Error("플레이 시간이 올바르지 않아요.");
  let score = 0,
    detail = "",
    eligible = false,
    metric = 0,
    cleared = 0;
  if (run.game === "focus") {
    checkActions(actions, 1, duration);
    if (actions.length !== 1 || actions[0].t !== duration || duration > 20000)
      throw new Error("정지 기록이 올바르지 않아요.");
    metric = Math.abs(duration - 7770);
    score = Math.max(0, 100000 - metric * 10);
    detail = `${(duration / 1000).toFixed(3)}초 · 오차 ${(metric / 1000).toFixed(3)}초`;
    eligible = duration >= 4000 && duration <= 12000;
  } else if (run.game === "defense") {
    checkActions(actions, 80, duration);
    const attacks = attackTimes(run.seed, run.difficulty || 1);
    if (duration !== attacks.at(-1) + 400)
      throw new Error("20회 방어를 완료해 주세요.");
    const used = new Set();
    let perfect = 0,
      hit = 0;
    for (const [round, t] of attacks.entries()) {
      const window = guardWindow(round, run.difficulty || 1);
      let best = -1,
        error = window.hit + 1;
      actions.forEach((e, i) => {
        if (!used.has(i) && Math.abs(e.t - t) < error) {
          error = Math.abs(e.t - t);
          best = i;
        }
      });
      if (best >= 0) {
        used.add(best);
        hit++;
        if (error <= window.perfect) perfect++;
        score +=
          error <= window.perfect
            ? 5000
            : Math.round(3500 - (error - window.perfect) * 15);
      }
    }
    score = Math.max(0, score - (actions.length - hit) * 500);
    detail = `완벽 ${perfect} / 방어 ${hit} / 20회`;
    metric = perfect;
    eligible = hit >= 3;
  } else if (run.game === "sense") {
    checkActions(actions, 180, duration);
    let round = 0,
      wrong = 0,
      last = -200;
    for (const e of actions) {
      if (
        e.t - last < 160 ||
        e.t > 45000 ||
        round >= 20 ||
        !Number.isInteger(e.index) ||
        e.index < 0 ||
        e.index >= puzzle(run.seed, round, run.difficulty || 1).size
      )
        throw new Error("관찰 입력이 올바르지 않아요.");
      last = e.t;
      if (e.index === puzzle(run.seed, round, run.difficulty || 1).target)
        round++;
      else wrong++;
    }
    if (round < 20 && duration !== 45000)
      throw new Error("관찰 훈련을 끝까지 완료해 주세요.");
    if (round === 20 && duration !== actions.at(-1).t)
      throw new Error("종료 시각이 일치하지 않아요.");
    score = Math.max(
      0,
      round * 4500 -
        wrong * 1000 +
        (round === 20 ? Math.round((45000 - duration) / 4.5) : 0),
    );
    detail = `정답 ${round}/20 · 오답 ${wrong} · ${(duration / 1000).toFixed(1)}초`;
    metric = round;
    eligible = round >= 3;
  } else if (run.game === "purify" || run.game === "coop") {
    checkActions(actions, 90, duration);
    for (const e of actions)
      if (!Number.isInteger(e.index) || e.index < 0 || e.index > 3)
        throw new Error("문양 선택이 올바르지 않아요.");
    const info = memoryInfo(run, actions);
    if (!info.failed && !info.complete && duration !== GAMES[run.game].limit)
      throw new Error("순서 훈련이 아직 끝나지 않았어요.");
    if ((info.failed || info.complete) && duration !== info.last)
      throw new Error("종료 시각이 일치하지 않아요.");
    cleared = info.cleared;
    score =
      run.game === "coop" ? (info.complete ? 100000 : 0) : cleared * 12500;
    detail =
      run.game === "coop"
        ? info.complete
          ? "봉인 단계 성공"
          : "봉인 단계 실패"
        : `완료 ${cleared}/8단계 · 최고 ${cleared ? Math.min(10, cleared + 2) : 0}문양`;
    metric = cleared;
    eligible = cleared > 0 && run.mode !== "practice";
  } else {
    checkActions(actions, 1900, duration);
    if (duration % STEP !== 0) throw new Error("게임 시각을 확인해 주세요.");
    for (const e of actions)
      if (
        !Number.isInteger(e.x) ||
        !Number.isInteger(e.y) ||
        e.x < 0 ||
        e.x > 480 ||
        e.y < 0 ||
        e.y > 480 ||
        e.t % 100 !== 0
      )
        throw new Error("이동 입력이 올바르지 않아요.");
    const sim = createSim(run, false);
    let i = 0,
      target = { x: 240, y: 240 };
    while (!sim.ended && sim.t < duration) {
      while (i < actions.length && actions[i].t <= sim.t) target = actions[i++];
      stepSim(sim, target);
    }
    if (!sim.ended || sim.t !== duration)
      throw new Error("생존 기록이 재현되지 않아요.");
    score = duration;
    metric = sim.kills;
    detail = `${(duration / 1000).toFixed(2)}초${run.game === "survival" ? " · 퇴치 " + sim.kills + "마리" : ""}`;
    eligible = duration >= 12000 && run.game === "agility";
  }
  return {
    score: Math.round(score),
    detail,
    metric,
    eligible,
    cleared,
    duration,
  };
}
export function baseReward(run, result) {
  if (!result.eligible || run.game === "survival" || run.game === "coop")
    return 0;
  const ratio =
    run.game === "agility" ? result.duration / 90000 : result.score / 100000;
  return ratio >= 0.85 ? 15 : ratio >= 0.5 ? 10 : 5;
}
export function periodKeys(now = Date.now()) {
  const d = new Date(now + 9 * 3600000),
    day = d.toISOString().slice(0, 10);
  const week = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
  return { day, week: week.toISOString().slice(0, 10) };
}
export const boardKey = (run) =>
  [
    run.game,
    run.mode,
    run.control,
    ...(run.difficulty === 2 ? ["v2"] : []),
  ].join(":");
export function rankRows(
  data,
  members,
  game,
  mode,
  control,
  period = "all",
  week = periodKeys().week,
  difficulty = 1,
) {
  const key = boardKey({ game, mode, control, difficulty });
  const secondary = (r) =>
    game === "sense" ? r.duration : game === "survival" ? -(r.metric || 0) : 0;
  const rows = members
    .map((m) => {
      const p = data?.profiles?.find((p) => p.memberId === m.id),
        b = p?.bests?.find(
          (b) =>
            b.key === key && b.period === (period === "week" ? week : "all"),
        );
      return b
        ? { memberId: m.id, name: m.name, avatar: m.avatar, ...b }
        : null;
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.score - a.score ||
        secondary(a) - secondary(b) ||
        a.at.localeCompare(b.at),
    );
  let rank = 0;
  return rows.map((r, i) => {
    if (
      !i ||
      rows[i - 1].score !== r.score ||
      secondary(rows[i - 1]) !== secondary(r)
    )
      rank = i + 1;
    return { ...r, rank };
  });
}
