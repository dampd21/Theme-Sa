import {
  GAMES,
  RULES_VERSION,
  DIFFICULTY_VERSION,
  evaluate,
  baseReward,
  progress,
  levels,
  zeroXP,
  MAX_XP,
  periodKeys,
  boardKey,
} from "../site/game-rules.mjs";
const empty = () => ({
  version: 1,
  rules: RULES_VERSION,
  profiles: [],
  receipts: [],
  relays: [],
  recent: [],
  updatedAt: null,
});
const safeId = (v) => typeof v === "string" && v.length > 0 && v.length <= 100;
const object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const integer = (v, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(v) && v >= 0 && v <= max;
const timestamp = (v) =>
  typeof v === "string" && v.length <= 40 && Number.isFinite(Date.parse(v));
const period = (v) =>
  v === "" ||
  (typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v + "T00:00:00Z")));
const six = (v, max) =>
  Array.isArray(v) && v.length === 6 && v.every((n) => integer(n, max));
const validGame = (game, mode, control) =>
  Object.hasOwn(GAMES, game) &&
  GAMES[game].modes.some((m) => m[0] === mode) &&
  ["pc", "touch"].includes(control);
const resultValid = (r) =>
  object(r) &&
  integer(r.score) &&
  integer(r.metric) &&
  integer(r.duration, 180500) &&
  integer(r.cleared, 8) &&
  typeof r.eligible === "boolean" &&
  typeof r.detail === "string" &&
  r.detail.length <= 180;
export function validateTrainingStore(s) {
  if (
    !object(s) ||
    s.version !== 1 ||
    s.rules !== RULES_VERSION ||
    !Array.isArray(s.profiles) ||
    s.profiles.length > 300 ||
    !Array.isArray(s.receipts) ||
    s.receipts.length > 2000 ||
    !Array.isArray(s.relays) ||
    s.relays.length > 12 ||
    !Array.isArray(s.recent) ||
    s.recent.length > 120 ||
    (s.updatedAt !== null && !timestamp(s.updatedAt))
  )
    throw new Error("format");
  const ids = new Set();
  for (const p of s.profiles) {
    if (
      !object(p) ||
      !safeId(p.memberId) ||
      ids.has(p.memberId) ||
      !six(p.xp, MAX_XP) ||
      !Array.isArray(p.bests) ||
      p.bests.length > 160 ||
      !Array.isArray(p.focus) ||
      p.focus.length > 20 ||
      !six(p.counts) ||
      !integer(p.coop) ||
      !integer(p.coopWeekly) ||
      p.coopWeekly > p.coop ||
      !period(p.day) ||
      !period(p.coopWeek)
    )
      throw new Error("profile");
    ids.add(p.memberId);
    const boards = new Set();
    for (const b of p.bests) {
      if (!object(b) || typeof b.key !== "string") throw new Error("best");
      const parts = b.key.split(":");
      if (
        !(parts.length === 3 || (parts.length === 4 && parts[3] === "v2")) ||
        !validGame(...parts.slice(0, 3)) ||
        parts[1] === "practice" ||
        !(b.period === "all" || (b.period && period(b.period))) ||
        boards.has(b.key + ":" + b.period) ||
        !integer(b.score) ||
        !integer(b.duration, GAMES[parts[0]].limit + 500) ||
        !integer(b.metric) ||
        typeof b.detail !== "string" ||
        b.detail.length > 180 ||
        !timestamp(b.at)
      )
        throw new Error("best");
      boards.add(b.key + ":" + b.period);
    }
    for (const f of p.focus)
      if (
        !object(f) ||
        !["pc", "touch"].includes(f.control) ||
        !["visible", "hidden"].includes(f.mode) ||
        !integer(f.error, 20000) ||
        !timestamp(f.at)
      )
        throw new Error("focus");
  }
  const receipts = new Set();
  for (const r of s.receipts) {
    if (
      !object(r) ||
      !safeId(r.id) ||
      receipts.has(r.id) ||
      !integer(r.expires) ||
      !object(r.response) ||
      !resultValid(r.response.result) ||
      !six(r.response.xp, MAX_XP) ||
      !six(r.response.levels, 30) ||
      !Array.isArray(r.response.awards) ||
      r.response.awards.length > 3 ||
      typeof r.response.note !== "string" ||
      r.response.note.length > 250 ||
      typeof r.response.replayed !== "boolean"
    )
      throw new Error("receipt");
    receipts.add(r.id);
    for (const a of r.response.awards)
      if (
        !object(a) ||
        !safeId(a.memberId) ||
        !integer(a.ability, 5) ||
        !integer(a.xp, 15) ||
        !integer(a.before, 30) ||
        !integer(a.after, 30) ||
        !integer(a.playsToday)
      )
        throw new Error("award");
  }
  const relays = new Set();
  for (const r of s.relays) {
    if (
      !object(r) ||
      !safeId(r.id) ||
      relays.has(r.id) ||
      !integer(r.expires) ||
      !timestamp(r.createdAt) ||
      r.expires <= Date.parse(r.createdAt) ||
      !Array.isArray(r.steps) ||
      r.steps.length > 3 ||
      !(
        (r.completedAt === null && r.steps.length < 3) ||
        (timestamp(r.completedAt) && r.steps.length === 3)
      )
    )
      throw new Error("relay");
    relays.add(r.id);
    const participants = new Set();
    for (const step of r.steps) {
      if (
        !object(step) ||
        !safeId(step.memberId) ||
        participants.has(step.memberId) ||
        !["pc", "touch"].includes(step.control) ||
        !timestamp(step.at)
      )
        throw new Error("step");
      participants.add(step.memberId);
    }
  }
  const recent = new Set();
  for (const r of s.recent) {
    if (
      !object(r) ||
      !safeId(r.id) ||
      recent.has(r.id) ||
      !safeId(r.memberId) ||
      !validGame(r.game, r.mode, r.control) ||
      !integer(r.score) ||
      typeof r.detail !== "string" ||
      r.detail.length > 180 ||
      !timestamp(r.at) ||
      (r.improvement !== undefined && !integer(r.improvement))
    )
      throw new Error("recent");
    recent.add(r.id);
  }
  return s;
}
function profile(s, id) {
  let p = s.profiles.find((p) => p.memberId === id);
  if (!p) {
    if (s.profiles.length >= 300)
      throw new Error("훈련 프로필 한도에 도달했어요.");
    p = {
      memberId: id,
      xp: zeroXP(),
      day: "",
      counts: zeroXP(),
      bests: [],
      focus: [],
      coop: 0,
      coopWeek: "",
      coopWeekly: 0,
    };
    s.profiles.push(p);
  }
  return p;
}
function grant(p, ability, base, now) {
  const { day } = periodKeys(now);
  if (p.day !== day) {
    p.day = day;
    p.counts = zeroXP();
  }
  const count = p.counts[ability],
    reward = count < 5 ? base : count < 10 ? Math.floor(base / 2) : 0;
  const before = progress(p.xp[ability]).level;
  const xp = Math.min(reward, MAX_XP - p.xp[ability]);
  p.xp[ability] += xp;
  p.counts[ability]++;
  return {
    ability,
    xp,
    before,
    after: progress(p.xp[ability]).level,
    playsToday: p.counts[ability],
  };
}
function updateBest(p, run, result, now, periodOverride) {
  const { week } = periodKeys(now),
    key = boardKey(run),
    at = new Date(now).toISOString();
  p.bests = p.bests.filter((b) => b.period === "all" || b.period === week);
  for (const period of ["all", week]) {
    const candidate = {
      key,
      period,
      score: periodOverride?.[period] ?? result.score,
      duration: result.duration,
      metric: result.metric,
      detail:
        run.game === "coop"
          ? "공동 봉인 " +
            (periodOverride?.[period] ?? result.score) +
            "회 완성"
          : result.detail,
      at,
    };
    const old = p.bests.find((b) => b.key === key && b.period === period);
    if (!old) p.bests.push(candidate);
    else if (
      candidate.score > old.score ||
      (candidate.score === old.score &&
        run.game === "sense" &&
        candidate.duration < old.duration) ||
      (candidate.score === old.score &&
        run.game === "survival" &&
        candidate.metric > old.metric)
    )
      Object.assign(old, candidate);
  }
}
export async function trainingRoute(request, env, session, D) {
  const {
    fail,
    json,
    github,
    privateRepo,
    filePath,
    getArchive,
    readJson,
    signingKey,
    base64url,
    unbase64url,
  } = D;
  const path = new URL(request.url).pathname,
    method = request.method,
    now = Date.now();
  let repoPromise;
  const repo = () => (repoPromise ||= privateRepo(env));
  const archive = async () => getArchive(env, false, await repo());
  const overview = (s) => ({
    rules: RULES_VERSION,
    profiles: s.profiles,
    relays: s.relays.filter((r) => r.expires > now || r.completedAt).slice(-10),
    recent: s.recent.slice(-30),
    updatedAt: s.updatedAt,
    period: periodKeys(now),
  });
  async function load() {
    const c = await repo(),
      route = filePath({ ...c, path: c.path + ".training.json" }),
      file = await github(
        route + "?ref=" + encodeURIComponent(c.branch) + "&_=" + Date.now(),
        env,
      );
    if (file.missing) return { s: empty(), sha: null, c, route };
    if (
      file.type !== "file" ||
      file.encoding !== "base64" ||
      typeof file.content !== "string" ||
      !/^[a-f0-9]{40,64}$/.test(file.sha || "") ||
      !Number.isInteger(file.size) ||
      file.size > 900000
    )
      fail(
        502,
        "TRAINING_FORMAT",
        "훈련 기록 파일을 확인해야 해요. 기존 파일은 초기화하지 않았습니다.",
      );
    try {
      const bytes = Uint8Array.from(
        atob(file.content.replace(/\s/g, "")),
        (c) => c.charCodeAt(0),
      );
      if (bytes.length > 900000) throw new Error("size");
      const s = validateTrainingStore(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      );
      return { s, sha: file.sha, c, route };
    } catch {
      fail(
        502,
        "TRAINING_CORRUPT",
        "훈련 기록을 읽지 못했어요. 기존 기록은 덮어쓰지 않았습니다.",
      );
    }
  }
  async function mutate(fn, withOverview = false) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const data = await load();
      const response = fn(data.s);
      if (response.noWrite)
        return withOverview
          ? { ...response.value, overview: overview(data.s) }
          : response.value;
      data.s.updatedAt = new Date(now).toISOString();
      data.s.receipts = data.s.receipts.filter((r) => r.expires > now);
      data.s.relays = data.s.relays
        .filter((r) => r.expires > now || r.completedAt)
        .slice(-12);
      data.s.recent = data.s.recent.slice(-120);
      const bytes = new TextEncoder().encode(JSON.stringify(data.s));
      if (bytes.length > 880000)
        fail(
          413,
          "TRAINING_FULL",
          "훈련 기록 용량 한도에 도달했어요. 관리자에게 알려 주세요.",
        );
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      try {
        const result = await github(data.route, env, "PUT", {
          message: "Save verified training result",
          content: btoa(binary),
          branch: data.c.branch,
          ...(data.sha ? { sha: data.sha } : {}),
        });
        if (!result.content?.sha)
          fail(
            502,
            "TRAINING_UNCONFIRMED",
            "저장 결과를 확인하지 못했어요. 같은 결과로 다시 저장해 주세요.",
          );
        return withOverview
          ? { ...response, overview: overview(data.s) }
          : response;
      } catch (error) {
        if (error.code !== "CONFLICT") throw error;
      }
    }
    fail(
      409,
      "TRAINING_BUSY",
      "다른 팀원의 기록을 저장 중이에요. 같은 결과로 다시 저장해 주세요.",
    );
  }
  async function sign(run) {
    const data = base64url(new TextEncoder().encode(JSON.stringify(run))),
      signature = base64url(
        await crypto.subtle.sign(
          "HMAC",
          await signingKey(env),
          new TextEncoder().encode("training-v1:" + data),
        ),
      );
    return data + "." + signature;
  }
  async function verify(token) {
    try {
      if (typeof token !== "string" || token.length > 2500) throw new Error();
      const [data, sig, ...rest] = token.split(".");
      if (
        rest.length ||
        !(await crypto.subtle.verify(
          "HMAC",
          await signingKey(env),
          unbase64url(sig),
          new TextEncoder().encode("training-v1:" + data),
        ))
      )
        throw new Error();
      const run = JSON.parse(new TextDecoder().decode(unbase64url(data)));
      if (
        run.rules !== RULES_VERSION ||
        run.difficulty !== DIFFICULTY_VERSION ||
        run.session !== session.jti ||
        run.origin !== new URL(request.url).origin ||
        run.expires <= now ||
        run.iat > now ||
        !safeId(run.id) ||
        !safeId(run.memberId) ||
        !GAMES[run.game] ||
        !GAMES[run.game].modes.some((m) => m[0] === run.mode) ||
        !["touch", "pc"].includes(run.control) ||
        !Array.isArray(run.levels) ||
        run.levels.length !== 6
      )
        throw new Error();
      return run;
    } catch {
      fail(
        401,
        "RUN_INVALID",
        "게임 인증이 만료되었거나 변경됐어요. 새 게임을 시작해 주세요.",
      );
    }
  }
  if (path === "/api/training" && method === "GET") {
    const { s } = await load();
    return json(overview(s));
  }
  if (method !== "POST") fail(405, "METHOD", "지원하지 않는 훈련 요청이에요.");
  const body = await readJson(request, 160000);
  if (path === "/api/training/relay") {
    const currentArchive = await archive();
    if (currentArchive.state.members.length < 3)
      fail(
        400,
        "RELAY_MEMBERS",
        "공동 봉인에는 현재 팀원 프로필 3개 이상이 필요해요. 혼자 연습은 사용할 수 있어요.",
      );
    return json(
      await mutate((s) => {
        const active = s.relays.find((r) => !r.completedAt && r.expires > now);
        if (active) return { noWrite: true, value: { relay: active } };
        const relay = {
          id: crypto.randomUUID(),
          createdAt: new Date(now).toISOString(),
          expires: now + 86400000,
          steps: [],
          completedAt: null,
        };
        s.relays.push(relay);
        return { relay };
      }),
    );
  }
  if (path === "/api/training/start") {
    if (body.rules !== RULES_VERSION || body.difficulty !== DIFFICULTY_VERSION)
      fail(426, "GAME_UPDATE", "훈련소가 업데이트됐어요. 새로고침해 주세요.");
    const { game, mode, control, memberId } = body;
    if (
      !Object.hasOwn(GAMES, game) ||
      !GAMES[game].modes.some((m) => m[0] === mode) ||
      !["pc", "touch"].includes(control) ||
      !safeId(memberId)
    )
      fail(400, "GAME_CONFIG", "게임·모드·활동 프로필을 선택하세요.");
    const currentArchive = await archive();
    if (!currentArchive.state.members.some((m) => m.id === memberId))
      fail(400, "MEMBER_REQUIRED", "현재 팀원의 활동 프로필을 선택해 주세요.");
    const s =
      (game === "survival" && mode === "growth") ||
      (game === "coop" && mode === "relay")
        ? (await load()).s
        : empty();
    let relay = null;
    if (game === "coop" && mode === "relay") {
      relay = s.relays.find(
        (r) => r.id === body.relayId && !r.completedAt && r.expires > now,
      );
      if (!relay)
        fail(409, "RELAY_MISSING", "진행 중인 공동 봉인을 먼저 시작해 주세요.");
      if (relay.steps.some((step) => step.memberId === memberId))
        fail(
          409,
          "RELAY_TURN",
          "이미 참여한 프로필이에요. 다음 단계는 다른 프로필이 이어야 해요.",
        );
    }
    const iat = Date.now();
    if (session.exp * 1000 - iat < GAMES[game].limit + 60000)
      fail(
        401,
        "SESSION_RENEW",
        "게임을 시작하기 전에 로그인을 다시 확인해 주세요.",
      );
    const run = {
      id: crypto.randomUUID(),
      difficulty: DIFFICULTY_VERSION,
      rules: RULES_VERSION,
      session: session.jti,
      origin: new URL(request.url).origin,
      memberId,
      game,
      mode,
      control,
      seed: crypto.getRandomValues(new Uint32Array(1))[0],
      iat,
      expires: iat + 15 * 60000,
      levels:
        game === "survival" && mode === "growth"
          ? levels(s.profiles.find((p) => p.memberId === memberId))
          : zeroXP(),
      relayId: relay?.id || null,
      stage: relay?.steps.length || 0,
    };
    return json({ token: await sign(run), run });
  }
  if (path === "/api/training/finish") {
    const run = await verify(body.token);
    if (
      !Number.isInteger(body.duration) ||
      now - run.iat < body.duration - 1500
    )
      fail(
        400,
        "RUN_TOO_FAST",
        "서버 시작 시각보다 플레이 기록이 짧아요. 보상은 지급하지 않았습니다.",
      );
    let result;
    try {
      result = evaluate(run, body);
    } catch (error) {
      fail(400, "RUN_RESULT", error.message);
    }
    const currentArchive = await archive();
    if (!currentArchive.state.members.some((m) => m.id === run.memberId))
      fail(
        409,
        "MEMBER_REMOVED",
        "플레이 중 팀원 프로필이 삭제되어 기록을 저장하지 않았어요.",
      );
    return json(
      await mutate((s) => {
        if (run.expires <= Date.now())
          fail(
            401,
            "RUN_INVALID",
            "게임 인증이 만료됐어요. 새 게임을 시작해 주세요.",
          );
        const duplicate = s.receipts.find((r) => r.id === run.id);
        if (duplicate)
          return {
            noWrite: true,
            value: { ...duplicate.response, replayed: true },
          };
        s.receipts = s.receipts.filter((r) => r.expires > now);
        if (s.receipts.length >= 2000)
          fail(
            429,
            "TRAINING_BUSY",
            "훈련 결과가 많아요. 잠시 후 다시 저장하세요.",
          );
        const p = profile(s, run.memberId),
          awards = [];
        const previousBest = p.bests.find(
          (b) => b.key === boardKey(run) && b.period === "all",
        );
        const personalBest =
          run.game !== "coop" &&
          (!previousBest ||
            result.score > previousBest.score ||
            (result.score === previousBest.score &&
              ((run.game === "sense" &&
                result.duration < previousBest.duration) ||
                (run.game === "survival" &&
                  result.metric > previousBest.metric))))
            ? {
                first: !previousBest,
                previous: previousBest?.detail || null,
                improvement: previousBest
                  ? result.score - previousBest.score
                  : 0,
              }
            : null;
        let note = "",
          relay = null;
        if (run.game === "coop") {
          if (run.mode === "practice")
            note = "혼자 연습은 경험치와 공식 순위에 반영되지 않습니다.";
          else if (result.cleared) {
            relay = s.relays.find(
              (r) => r.id === run.relayId && !r.completedAt && r.expires > now,
            );
            if (
              !relay ||
              relay.steps.length !== run.stage ||
              relay.steps.some((x) => x.memberId === run.memberId)
            )
              fail(
                409,
                "RELAY_CHANGED",
                "다른 프로필이 이 단계를 먼저 완료했어요. 봉인 진행 상황을 새로 확인하세요.",
              );
            relay.steps.push({
              memberId: run.memberId,
              control: run.control,
              at: new Date(now).toISOString(),
            });
            if (relay.steps.length === 3) {
              relay.completedAt = new Date(now).toISOString();
              const { week } = periodKeys(now);
              for (const step of relay.steps) {
                if (
                  !currentArchive.state.members.some(
                    (m) => m.id === step.memberId,
                  )
                )
                  continue;
                const teammate = profile(s, step.memberId);
                if (teammate.coopWeek !== week) {
                  teammate.coopWeek = week;
                  teammate.coopWeekly = 0;
                }
                teammate.coop++;
                teammate.coopWeekly++;
                const award = grant(teammate, 5, 15, now);
                awards.push({ memberId: step.memberId, ...award });
                const key = boardKey({
                    difficulty: run.difficulty,
                    game: "coop",
                    mode: "relay",
                    control: step.control,
                  }),
                  controlAll =
                    (teammate.bests.find(
                      (b) => b.key === key && b.period === "all",
                    )?.score || 0) + 1,
                  controlWeek =
                    (teammate.bests.find(
                      (b) => b.key === key && b.period === week,
                    )?.score || 0) + 1;
                updateBest(
                  teammate,
                  {
                    game: "coop",
                    mode: "relay",
                    control: step.control,
                    difficulty: run.difficulty,
                  },
                  {
                    score: controlAll,
                    duration: 0,
                    metric: 0,
                    detail: "공동 봉인 " + controlAll + "회 완성",
                  },
                  now,
                  { all: controlAll, [week]: controlWeek },
                );
              }
              note =
                "공동 봉인 완성! 참여한 세 프로필에 협동 경험치를 지급했어요.";
            } else
              note = `${relay.steps.length}/3단계 완료. 세 프로필이 완성하면 협동 경험치를 함께 받아요.`;
          } else note = "봉인을 완성하지 못했어요. 다시 도전할 수 있어요.";
        } else {
          updateBest(p, run, result, now);
          if (run.game === "focus") {
            p.focus.push({
              control: run.control,
              mode: run.mode,
              error: result.metric,
              at: new Date(now).toISOString(),
            });
            p.focus = p.focus.slice(-20);
          }
          const base = baseReward(run, result);
          if (base)
            awards.push({
              memberId: run.memberId,
              ...grant(p, GAMES[run.game].ability, base, now),
            });
          else
            note =
              run.game === "survival"
                ? "생존전은 기록 도전용입니다. 능력치는 여섯 훈련에서 성장해요."
                : "기본 수행 조건에 도달하지 않아 이번 경험치는 0입니다.";
        }
        const response = {
          result,
          awards,
          note,
          personalBest,
          levels: levels(p),
          xp: p.xp,
          relay,
          replayed: false,
        };
        s.receipts.push({ id: run.id, expires: run.expires, response });
        s.recent.push({
          id: run.id,
          memberId: run.memberId,
          game: run.game,
          mode: run.mode,
          control: run.control,
          score: result.score,
          detail: result.detail,
          improvement: personalBest?.improvement || 0,
          at: new Date(now).toISOString(),
        });
        return response;
      }, true),
    );
  }
  fail(404, "NOT_FOUND", "없는 훈련 기능이에요.");
}
