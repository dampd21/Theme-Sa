import {
  ROOM_VERSION,
  WEATHER,
  CASES,
  SOURCES,
  ARTIFACTS,
  INK,
  WORDS,
  dayKey,
  daySeed,
  nextWords,
  zoneCells,
  fixedCell,
  mazePath,
  validWalk,
} from "../site/room-rules.mjs";
const LORE = [
  {
    answer: "welcome",
    clues: {
      window:
        "유리의 김 위에 적혀 있다. “열쇠도 종도 필요 없어요. 돌아왔다고 말해 주세요.”",
      frame: "작은 액자 뒤에는 손님을 위해 비워 둔 이름표가 있다.",
      spirit:
        "“여긴 처음 오는 곳인데, 꼭 돌아온 것 같아.” 원혼이 찻잔을 바라본다.",
    },
    ending:
      "“어서 와.” 그 한마디에 찻잔의 김이 작은 새가 되었습니다. 기록실에 첫 손님이 생겼어요.",
  },
  {
    answer: "frame",
    clues: {
      window:
        "바깥쪽 유리에는 먼지가 그대로다. 페이지는 창밖으로 나가지 않았다.",
      frame: "액자가 벽에서 조금 떠 있고, 아래쪽에 종이 모서리가 보인다.",
      spirit: "“책장에는 안 넣었어. 그림이 잊어버리지 않게 맡겼지.”",
    },
    ending:
      "액자 뒷면에서 페이지를 찾았습니다. 마지막 줄에는 “이 기록은 혼자 쓰는 것이 아니다”라고 적혀 있어요.",
  },
  {
    answer: "team",
    clues: {
      window:
        "창문에 비친 마지막 액자에는 이곳을 찾은 사람들의 인장이 겹쳐 보인다.",
      frame: "빈자리의 이름표는 한 사람의 이름을 넣기에는 너무 길다.",
      spirit:
        "“누가 들어오는 게 아니야. 우리가 남긴 이야기가 자리를 만든 거야.”",
    },
    ending:
      "열세 번째 액자는 침입자의 것이 아니었습니다. 함께 기록한 우리 모두의 자리였어요. 어두운 테두리에 조용히 불이 켜집니다.",
  },
];
const TYPOS = [
  ["문을 닫고 봉언을 확인하라.", "봉인", "언 → 인"],
  ["달빛 아래 결게를 그려라.", "결계", "게 → 계"],
  ["작은 원흔을 놀라게 하지 마라.", "원혼", "흔 → 혼"],
  ["서고의 기룍을 제자리에 두어라.", "기록", "룍 → 록"],
  ["찻잔 옆에 부젹을 놓아라.", "부적", "젹 → 적"],
  ["창문에 남은 단셔를 살펴라.", "단서", "셔 → 서"],
  ["돌아온 손님을 환영하라. 등뷸을 켜라.", "등불", "뷸 → 불"],
  ["열세 번째 액쟈의 이름을 찾아라.", "액자", "쟈 → 자"],
  ["한 획에 하나의 마움을 담아라.", "마음", "움 → 음"],
  ["미로 끝에서 동료에게 인샤하라.", "인사", "샤 → 사"],
];
const id = (x) => typeof x === "string" && x.length > 0 && x.length <= 100;
const entityId = (x) => id(x) && /^[A-Za-z0-9_-]+$/.test(x);
const num = (x, max = 1e9) => Number.isSafeInteger(x) && x >= 0 && x <= max;
const obj = (x) => x && typeof x === "object" && !Array.isArray(x);
const date = (x) =>
  typeof x === "string" && x.length < 40 && Number.isFinite(Date.parse(x));
const arr = (x, max) => Array.isArray(x) && x.length <= max;
function points(x) {
  return (
    arr(x, 90) &&
    x.length >= 2 &&
    x.every(
      (p) => Array.isArray(p) && p.length === 2 && p.every((v) => num(v, 1000)),
    )
  );
}
function strokes(x, max = 12) {
  return (
    arr(x, max) &&
    x.every((s) => obj(s) && INK.includes(s.color) && points(s.points))
  );
}
const blankMaze = () => ({
  id: "maze-origin",
  rev: 0,
  cells: Array(225).fill(0),
  owners: Array(9).fill(null),
  zoneRev: Array(9).fill(0),
  published: false,
  solvers: [],
});
export const emptyRoom = () => ({
  version: ROOM_VERSION,
  updatedAt: null,
  activity: 0,
  votes: [],
  clues: [],
  solved: [],
  clean: [],
  repairs: [],
  repairSerial: 0,
  chains: {
    chain: { id: "chain-origin", turns: [] },
    sentence: { id: "sentence-origin", turns: [] },
  },
  wordHistory: [],
  talisman: { id: "ink-origin", strokes: [] },
  talismans: [],
  items: [],
  sketches: [],
  maze: blankMaze(),
  mazes: [],
  feed: [],
  receipts: [],
});
export function validateRoom(s) {
  if (
    !obj(s) ||
    s.version !== ROOM_VERSION ||
    !num(s.activity) ||
    !(s.updatedAt === null || date(s.updatedAt))
  )
    throw Error("room");
  for (const [k, max] of Object.entries({
    votes: 300,
    clues: 9,
    solved: 3,
    clean: 900,
    repairs: 120,
    wordHistory: 8,
    talismans: 8,
    items: 20,
    sketches: 12,
    mazes: 5,
    feed: 80,
    receipts: 400,
  }))
    if (!arr(s[k], max)) throw Error(k);
  if (
    !num(s.repairSerial) ||
    !obj(s.chains) ||
    !obj(s.talisman) ||
    !entityId(s.talisman.id) ||
    !strokes(s.talisman.strokes, 40)
  )
    throw Error("board");
  for (const m of ["chain", "sentence"]) {
    const b = s.chains[m];
    if (
      !obj(b) ||
      !entityId(b.id) ||
      !arr(b.turns, 40) ||
      b.turns.some(
        (t) =>
          !id(t.memberId) || typeof t.word !== "string" || t.word.length > 24,
      )
    )
      throw Error("words");
  }
  for (const h of s.wordHistory)
    if (
      !entityId(h.id) ||
      !["chain", "sentence"].includes(h.mode) ||
      !date(h.at) ||
      !arr(h.turns, 40) ||
      h.turns.some(
        (t) =>
          !id(t.memberId) || typeof t.word !== "string" || t.word.length > 24,
      )
    )
      throw Error("history");
  for (const c of s.clues)
    if (
      !num(c.caseId, 2) ||
      !SOURCES.some((v) => v[0] === c.source) ||
      !id(c.memberId) ||
      !date(c.at)
    )
      throw Error("clue");
  if (
    new Set(s.clues.map((c) => c.caseId + ":" + c.source)).size !==
    s.clues.length
  )
    throw Error("clue duplicate");
  s.solved.forEach((v, i) => {
    if (v.caseId !== i || !id(v.memberId) || !date(v.at)) throw Error("case");
  });
  for (const v of s.votes)
    if (
      !id(v.memberId) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(v.day) ||
      !WEATHER.some((w) => w[0] === v.weather)
    )
      throw Error("weather");
  for (const v of s.clean)
    if (!id(v.memberId) || !date(v.at) || !num(v.artifact, 7))
      throw Error("clean");
  for (const v of s.repairs)
    if (!id(v.memberId) || !date(v.at) || !num(v.serial)) throw Error("repair");
  for (const i of s.items)
    if (
      !entityId(i.id) ||
      !id(i.ownerId) ||
      typeof i.label !== "string" ||
      i.label.length > 60 ||
      typeof i.clue !== "string" ||
      i.clue.length > 200 ||
      !arr(i.guesses, 100) ||
      i.guesses.some((g) => !id(g.memberId) || !id(g.answerId)) ||
      !(i.solvedBy === null || id(i.solvedBy))
    )
      throw Error("item");
  for (const d of s.sketches)
    if (
      !entityId(d.id) ||
      !id(d.ownerId) ||
      typeof d.description !== "string" ||
      d.description.length > 280 ||
      !strokes(d.reference) ||
      !d.reference.length ||
      !(
        d.response === null ||
        (obj(d.response) &&
          id(d.response.memberId) &&
          strokes(d.response.strokes) &&
          d.response.strokes.length)
      )
    )
      throw Error("sketch");
  for (const t of s.talismans)
    if (
      !entityId(t.id) ||
      !strokes(t.strokes, 40) ||
      typeof t.title !== "string" ||
      t.title.length > 50
    )
      throw Error("talisman");
  for (const t of [s.talisman, ...s.talismans])
    if (t.strokes.some((v) => !id(v.memberId))) throw Error("artist");
  for (const m of [s.maze, ...s.mazes])
    if (
      !obj(m) ||
      !entityId(m.id) ||
      !num(m.rev) ||
      !arr(m.cells, 225) ||
      m.cells.length !== 225 ||
      m.cells.some(
        (v, i) => ![0, 1].includes(v) || (fixedCell(i) && v !== 0),
      ) ||
      !arr(m.owners, 9) ||
      m.owners.length !== 9 ||
      m.owners.some((v) => v !== null && !id(v)) ||
      !arr(m.zoneRev, 9) ||
      m.zoneRev.length !== 9 ||
      m.zoneRev.some((v) => !num(v)) ||
      typeof m.published !== "boolean" ||
      !arr(m.solvers, 300) ||
      m.solvers.some((v) => !id(v.memberId) || !date(v.at)) ||
      !mazePath(m.cells)
    )
      throw Error("maze");
  for (const f of s.feed)
    if (
      !entityId(f.id) ||
      !(f.memberId === null || id(f.memberId)) ||
      typeof f.text !== "string" ||
      f.text.length > 180 ||
      !date(f.at)
    )
      throw Error("feed");
  for (const r of s.receipts)
    if (
      !entityId(r.id) ||
      !num(r.expires, 1e15) ||
      !id(r.memberId) ||
      typeof r.notice !== "string" ||
      r.notice.length > 300
    )
      throw Error("receipt");
  if (new Set(s.receipts.map((r) => r.id)).size !== s.receipts.length)
    throw Error("receipt duplicate");
  return s;
}
function view(s, actor, now) {
  const day = dayKey(now),
    votes = s.votes.filter((v) => v.day === day),
    tally = WEATHER.map(([key]) => ({
      key,
      n: votes.filter((v) => v.weather === key).length,
    })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
  const weather = tally[0].n
      ? tally[0].key
      : WEATHER[daySeed(day) % WEATHER.length][0],
    puzzle = TYPOS[s.repairSerial % TYPOS.length];
  return {
    version: ROOM_VERSION,
    clock: now,
    day,
    weather,
    votes,
    activity: s.activity,
    updatedAt: s.updatedAt,
    caseId: s.solved.length,
    clues: s.clues.map((c) => ({ ...c, text: LORE[c.caseId].clues[c.source] })),
    solved: s.solved.map((c) => ({ ...c, ending: LORE[c.caseId].ending })),
    clean: s.clean,
    repairs: s.repairs,
    typo: { serial: s.repairSerial, text: puzzle[0] },
    chains: s.chains,
    wordHistory: s.wordHistory,
    talisman: s.talisman,
    talismans: s.talismans,
    items: s.items.map((i) => ({
      id: i.id,
      label: i.label,
      clue: i.clue,
      mine: i.ownerId === actor,
      guesses: i.guesses,
      solvedBy: i.solvedBy,
      ...(i.solvedBy ? { ownerId: i.ownerId } : {}),
    })),
    sketches: s.sketches.map((d) => ({
      id: d.id,
      ownerId: d.ownerId,
      description: d.description,
      response: d.response,
      ...(d.response || d.ownerId === actor ? { reference: d.reference } : {}),
    })),
    maze: s.maze,
    mazes: s.mazes,
    feed: s.feed,
  };
}
export async function roomRoute(request, env, session, D) {
  const { fail, json, github, privateRepo, filePath, getArchive, readJson } = D;
  const now = Date.now(),
    url = new URL(request.url);
  let config;
  const repo = () => (config ||= privateRepo(env));
  async function load() {
    const c = await repo(),
      route = filePath({ ...c, path: c.path + ".room.json" }),
      file = await github(
        route + "?ref=" + encodeURIComponent(c.branch) + "&_=" + Date.now(),
        env,
      );
    if (file.missing) return { s: emptyRoom(), sha: null, c, route };
    try {
      if (
        file.type !== "file" ||
        file.encoding !== "base64" ||
        file.size > 800000 ||
        !/^[a-f0-9]{40,64}$/.test(file.sha || "")
      )
        throw Error();
      const bytes = Uint8Array.from(
        atob(file.content.replace(/\s/g, "")),
        (v) => v.charCodeAt(0),
      );
      if (bytes.length > 800000) throw Error();
      return {
        s: validateRoom(
          JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
        ),
        sha: file.sha,
        c,
        route,
      };
    } catch {
      fail(
        502,
        "ROOM_CORRUPT",
        "아지트 기록 형식을 확인해야 해요. 기존 파일은 초기화하거나 덮어쓰지 않았습니다.",
      );
    }
  }
  if (url.pathname !== "/api/room")
    fail(404, "NOT_FOUND", "없는 아지트 기능이에요.");
  if (request.method === "GET") {
    const { s } = await load();
    return json(view(s, url.searchParams.get("actor") || "", now));
  }
  if (request.method !== "POST")
    fail(405, "METHOD", "지원하지 않는 아지트 요청이에요.");
  const b = await readJson(request, 80000),
    actor = b.memberId;
  if (b.version !== ROOM_VERSION)
    fail(426, "ROOM_UPDATE", "아지트를 새로고침해 주세요.");
  if (
    !id(actor) ||
    !entityId(b.opId) ||
    !num(b.issuedAt, 1e15) ||
    b.issuedAt > now + 30000 ||
    b.issuedAt + 900000 <= now
  )
    fail(
      400,
      "ROOM_EXPIRED",
      "저장 요청의 시간이 지났어요. 새로 확인하고 다시 시도하세요.",
    );
  const a = await getArchive(env, false, await repo()),
    members = new Set(a.state.members.map((m) => m.id));
  if (!members.has(actor))
    fail(400, "MEMBER_REQUIRED", "현재 팀원의 활동 프로필을 선택해 주세요.");
  const text = (v, max, label) => {
    if (typeof v !== "string" || !v.trim() || v.trim().length > max)
      fail(400, "ROOM_INPUT", label + " 내용을 확인해 주세요.");
    return v.trim();
  };
  const conflict = () =>
    fail(
      409,
      "ROOM_CHANGED",
      "다른 팀원이 먼저 진행했어요. 입력은 남겨 두었으니 최신 상태를 확인해 주세요.",
    );
  const drawing = (v) => {
    if (
      !strokes(v) ||
      !v.length ||
      v.reduce((n, s) => n + s.points.length, 0) > 700
    )
      fail(
        400,
        "ROOM_DRAWING",
        "그림은 1~12획, 전체 700개 점 이내로 그려 주세요.",
      );
    return v.map((x) => ({ color: x.color, points: x.points }));
  };
  for (let retry = 0; retry < 5; retry++) {
    const d = await load(),
      s = d.s;
    if (b.issuedAt + 900000 <= Date.now())
      fail(400, "ROOM_EXPIRED", "저장 시간이 만료됐어요.");
    const duplicate = s.receipts.find((r) => r.id === b.opId);
    if (duplicate) {
      if (duplicate.memberId !== actor)
        fail(409, "ROOM_REQUEST", "다른 프로필의 요청이에요.");
      return json({
        notice: duplicate.notice,
        replayed: true,
        data: view(s, actor, Date.now()),
      });
    }
    s.receipts = s.receipts.filter((r) => r.expires > Date.now());
    if (s.receipts.length >= 400)
      fail(
        429,
        "ROOM_BUSY",
        "아지트의 최근 저장 요청이 많아요. 잠시 후 같은 요청으로 다시 저장하세요.",
      );
    const day = dayKey(now),
      at = new Date(now).toISOString();
    let notice = "",
      feed = "",
      feedActor = actor;
    switch (b.action) {
      case "weather":
        if (!WEATHER.some((w) => w[0] === b.weather))
          fail(400, "ROOM_INPUT", "날씨를 골라 주세요.");
        s.votes = s.votes.filter((v) => v.day === day && v.memberId !== actor);
        s.votes.push({ memberId: actor, day, weather: b.weather });
        notice =
          "오늘의 날씨 의견을 남겼어요. 동률은 날씨 코드 순으로 정해집니다.";
        break;
      case "discover": {
        const n = s.solved.length;
        if (n >= 3) {
          notice =
            "세 사건을 모두 해결했어요. 사건 수첩에서 결말을 다시 읽어 보세요.";
          break;
        }
        if (b.caseId !== n) conflict();
        if (!SOURCES.some((v) => v[0] === b.source))
          fail(400, "ROOM_INPUT", "조사할 곳을 골라 주세요.");
        if (s.clues.some((c) => c.caseId === n && c.source === b.source)) {
          notice = "이미 수첩에 모은 단서예요. 사건 수첩을 확인하세요.";
          break;
        }
        s.clues.push({ caseId: n, source: b.source, memberId: actor, at });
        notice = LORE[n].clues[b.source];
        feed =
          SOURCES.find((x) => x[0] === b.source)[1] +
          "에서 사건의 단서를 찾았어요.";
        break;
      }
      case "solve": {
        const n = s.solved.length;
        if (n >= 3 || b.caseId !== n) conflict();
        if (s.clues.filter((c) => c.caseId === n).length < 3)
          fail(
            400,
            "ROOM_CLUES",
            "창문·액자·꼬마 원혼의 단서 3개를 먼저 모아 주세요.",
          );
        if (b.answer !== LORE[n].answer) {
          notice =
            "단서가 아직 그 결론을 가리키지 않아요. 잃는 보상은 없으니 다시 추리해 보세요.";
          break;
        }
        s.solved.push({ caseId: n, memberId: actor, at });
        notice = LORE[n].ending;
        feed = "비밀 서랍을 열고 「" + CASES[n].title + "」를 해결했어요.";
        break;
      }
      case "clean": {
        s.clean = s.clean.filter((c) => Date.parse(c.at) > now - 30 * 86400000);
        if (
          s.clean.filter(
            (c) => c.memberId === actor && dayKey(Date.parse(c.at)) === day,
          ).length >= 3
        )
          fail(
            400,
            "ROOM_CLEAN_LIMIT",
            "오늘의 작은 발견 3개를 모두 찾았어요. 청소하지 않아도 불이익은 없습니다.",
          );
        const artifact =
          (daySeed(day) + s.clean.filter((c) => c.memberId === actor).length) %
          ARTIFACTS.length;
        s.clean.push({ memberId: actor, artifact, at });
        s.clean = s.clean.slice(-900);
        notice = "먼지 속에서 「" + ARTIFACTS[artifact] + "」를 찾았어요!";
        feed = "기록실을 정리하고 작은 물건을 발견했어요.";
        break;
      }
      case "repair": {
        if (b.serial !== s.repairSerial) conflict();
        const p = TYPOS[s.repairSerial % TYPOS.length];
        if (text(b.answer, 30, "복구할 낱말") !== p[1]) {
          notice =
            "아직 부적의 뜻이 돌아오지 않았어요. 틀린 낱말 하나를 고쳐 적어 보세요.";
          break;
        }
        s.repairs.push({ serial: s.repairSerial, memberId: actor, at });
        s.repairs = s.repairs.slice(-120);
        s.repairSerial++;
        notice = "복구 성공 · " + p[2];
        feed = "부적 오타를 복구했어요.";
        break;
      }
      case "word": {
        if (!["chain", "sentence"].includes(b.mode))
          fail(400, "ROOM_INPUT", "이어쓰기 모드를 선택하세요.");
        const board = s.chains[b.mode];
        if (b.boardId !== board.id || b.turn !== board.turns.length) conflict();
        if (members.size > 1 && board.turns.at(-1)?.memberId === actor)
          fail(400, "ROOM_TURN", "다음 단어는 다른 프로필이 이어 주세요.");
        const word = text(b.word, 24, "단어");
        if (b.mode === "chain") {
          if (!WORDS.includes(word))
            fail(
              400,
              "ROOM_WORD",
              "이 모드는 화면의 작은 낱말집을 사용해요. 추천 낱말이나 낱말집에서 골라 주세요.",
            );
          if (!nextWords(board.turns).includes(word))
            fail(
              400,
              "ROOM_WORD",
              "앞말의 끝 글자로 시작하고 이번 판에 쓰지 않은 낱말을 골라 주세요. 두음법칙은 적용하지 않습니다.",
            );
        } else if (/\s/u.test(word))
          fail(400, "ROOM_WORD", "한 번에는 한 단어만 남겨 주세요.");
        board.turns.push({ memberId: actor, word });
        notice = "단어를 이었어요.";
        feed =
          b.mode === "chain"
            ? "끝말잇기에 한 단어를 이었어요."
            : "공동 문장에 한 단어를 더했어요.";
        if (
          board.turns.length >= 24 ||
          (b.mode === "chain" && !nextWords(board.turns).length)
        ) {
          s.wordHistory.push({
            id: board.id,
            mode: b.mode,
            turns: board.turns,
            at,
          });
          s.wordHistory = s.wordHistory.slice(-8);
          s.chains[b.mode] = { id: crypto.randomUUID(), turns: [] };
          notice += " 이번 판이 완성되어 새 종이를 펼쳤어요.";
        }
        break;
      }
      case "word.close": {
        if (!["chain", "sentence"].includes(b.mode))
          fail(400, "ROOM_INPUT", "모드를 확인하세요.");
        const board = s.chains[b.mode];
        if (board.id !== b.boardId) conflict();
        if (board.turns.length < 6)
          fail(400, "ROOM_INPUT", "6개 이상 이어 쓴 다음 마무리할 수 있어요.");
        s.wordHistory.push({
          id: board.id,
          mode: b.mode,
          turns: board.turns,
          at,
        });
        s.wordHistory = s.wordHistory.slice(-8);
        s.chains[b.mode] = { id: crypto.randomUUID(), turns: [] };
        notice = "이어 쓴 기록을 보관했어요.";
        break;
      }
      case "ink": {
        if (b.boardId !== s.talisman.id || b.turn !== s.talisman.strokes.length)
          conflict();
        if (s.talisman.strokes.length >= 40)
          fail(
            400,
            "ROOM_INPUT",
            "40획을 모았어요. 이름을 붙여 전시해 주세요.",
          );
        if (members.size > 1 && s.talisman.strokes.at(-1)?.memberId === actor)
          fail(400, "ROOM_TURN", "다음 한 획은 다른 프로필의 차례예요.");
        const stroke = drawing([b.stroke])[0];
        s.talisman.strokes.push({ ...stroke, memberId: actor });
        notice = "나의 한 획을 저장했어요.";
        feed = "공동 부적에 한 획을 더했어요.";
        break;
      }
      case "ink.finish":
        if (b.boardId !== s.talisman.id) conflict();
        if (s.talisman.strokes.length < 3)
          fail(400, "ROOM_INPUT", "3획 이상 모은 뒤 전시해 주세요.");
        s.talismans.push({
          ...s.talisman,
          title: text(b.title, 50, "부적 이름"),
        });
        s.talismans = s.talismans.slice(-8);
        s.talisman = { id: crypto.randomUUID(), strokes: [] };
        notice = "공동 부적을 전시했어요.";
        feed = "공동 부적 한 장을 완성했어요.";
        break;
      case "item.create":
        if (s.items.length >= 20)
          fail(
            400,
            "ROOM_FULL",
            "물건은 20개까지 보관해요. 이전 물건을 정리한 후 등록해 주세요.",
          );
        s.items.push({
          id: crypto.randomUUID(),
          ownerId: actor,
          label: text(b.label, 60, "가상 물건"),
          clue: text(b.clue, 200, "주인 단서"),
          guesses: [],
          solvedBy: null,
        });
        notice = "주인 이름을 가린 가상 물건을 맡겼어요.";
        feed = "분실물 선반에 수상한 물건이 도착했어요.";
        feedActor = null;
        break;
      case "item.guess": {
        const item = s.items.find((i) => i.id === b.itemId);
        if (!item || item.solvedBy) conflict();
        if (item.ownerId === actor)
          fail(
            400,
            "ROOM_INPUT",
            "내가 맡긴 물건은 다른 프로필이 맞혀 주세요.",
          );
        if (!members.has(b.answerId))
          fail(400, "ROOM_INPUT", "현재 팀원을 골라 주세요.");
        if (
          item.guesses.filter((g) => g.memberId === actor).length >= 3 ||
          item.guesses.length >= 100
        )
          fail(400, "ROOM_INPUT", "이 물건의 추리 기회를 모두 사용했어요.");
        item.guesses.push({ memberId: actor, answerId: b.answerId });
        if (item.ownerId === b.answerId) {
          item.solvedBy = actor;
          notice = "맞혔어요! 물건의 주인이 공개되었습니다.";
          feed = "수상한 물건의 주인을 찾아냈어요.";
        } else notice = "그 프로필의 물건은 아니에요. 단서를 다시 살펴보세요.";
        break;
      }
      case "item.archive":
        s.items = s.items.filter((i) => i.id !== b.itemId);
        notice = "공유 선반에서 물건을 정리했어요.";
        break;
      case "sketch.create":
        if (s.sketches.length >= 12)
          fail(
            400,
            "ROOM_FULL",
            "그림은 12개까지 보관해요. 이전 그림을 정리해 주세요.",
          );
        s.sketches.push({
          id: crypto.randomUUID(),
          ownerId: actor,
          description: text(b.description, 280, "그림 설명"),
          reference: drawing(b.strokes),
          response: null,
        });
        notice =
          "원본을 가리고 설명을 공개했어요. 다른 프로필이 설명만 보고 그립니다.";
        feed = "설명만 듣고 그리는 새 도전이 도착했어요.";
        break;
      case "sketch.reply": {
        const sketch = s.sketches.find((d) => d.id === b.sketchId);
        if (!sketch || sketch.response) conflict();
        if (sketch.ownerId === actor)
          fail(400, "ROOM_INPUT", "다른 프로필이 내 설명을 보고 그려 주세요.");
        sketch.response = { memberId: actor, strokes: drawing(b.strokes) };
        notice =
          "두 그림을 함께 공개했어요. 닮은 점과 엉뚱한 차이를 살펴보세요!";
        feed = "설명 그림 도전의 두 그림을 공개했어요.";
        break;
      }
      case "sketch.archive":
        s.sketches = s.sketches.filter((v) => v.id !== b.sketchId);
        notice = "공유 그림을 정리했어요.";
        break;
      case "maze.claim": {
        const m = s.maze;
        if (m.id !== b.mazeId || m.published) conflict();
        if (!num(b.zone, 8)) fail(400, "ROOM_INPUT", "구역을 골라 주세요.");
        if (
          m.owners[b.zone] &&
          m.owners[b.zone] !== actor &&
          members.has(m.owners[b.zone])
        )
          conflict();
        if (m.owners.includes(actor) && m.owners[b.zone] !== actor)
          fail(400, "ROOM_INPUT", "한 프로필은 한 구역을 맡습니다.");
        m.owners[b.zone] = actor;
        notice = "내 설계 구역을 맡았어요. 금빛 연결 통로는 막을 수 없습니다.";
        break;
      }
      case "maze.edit": {
        const m = s.maze;
        if (
          m.id !== b.mazeId ||
          m.published ||
          !num(b.zone, 8) ||
          m.owners[b.zone] !== actor ||
          m.zoneRev[b.zone] !== b.zoneRev
        )
          conflict();
        if (
          !Array.isArray(b.cells) ||
          b.cells.length !== 25 ||
          b.cells.some((v) => ![0, 1].includes(v))
        )
          fail(400, "ROOM_INPUT", "구역의 25칸을 확인해 주세요.");
        zoneCells(b.zone).forEach((i, n) => {
          if (fixedCell(i) && b.cells[n])
            fail(400, "ROOM_INPUT", "출입구와 연결 통로는 막을 수 없어요.");
          m.cells[i] = b.cells[n];
        });
        if (!mazePath(m.cells))
          fail(
            400,
            "ROOM_MAZE_BLOCKED",
            "입구에서 출구로 갈 수 없어요. 길을 하나 이상 남겨 주세요.",
          );
        m.zoneRev[b.zone]++;
        m.rev++;
        notice = "내 구역을 저장했어요. 다른 구역은 그대로 유지됩니다.";
        feed = "공동 미로의 한 구역을 설계했어요.";
        break;
      }
      case "maze.publish": {
        const m = s.maze;
        if (m.id !== b.mazeId || m.published) conflict();
        if (
          m.zoneRev.filter((v) => v > 0).length < Math.min(2, members.size) ||
          m.cells.reduce((a, b) => a + b, 0) < 8
        )
          fail(
            400,
            "ROOM_INPUT",
            "두 구역 이상을 설계하고 벽을 8칸 이상 놓아 주세요. 혼자 있는 팀은 한 구역도 가능합니다.",
          );
        m.published = true;
        notice = "미로를 공개했어요. 설계는 잠그고 모두 함께 길을 찾습니다.";
        feed = "공동 미로를 공개했어요.";
        break;
      }
      case "maze.solve": {
        const m = s.maze;
        if (m.id !== b.mazeId || !m.published) conflict();
        if (!validWalk(m.cells, b.path))
          fail(
            400,
            "ROOM_PATH",
            "입구부터 출구까지 벽을 통과하지 않는 이동 기록이 필요해요.",
          );
        if (!m.solvers.some((v) => v.memberId === actor))
          m.solvers.push({ memberId: actor, at });
        notice = "미로 탈출 성공! 함께 만든 길에 내 인장을 남겼어요.";
        feed = "공동 미로의 출구를 찾았어요.";
        break;
      }
      case "maze.new":
        if (b.mazeId !== s.maze.id) conflict();
        if (!s.maze.published || !s.maze.solvers.length)
          fail(
            400,
            "ROOM_INPUT",
            "공개한 미로를 한 프로필 이상 탈출한 뒤 새 미로를 만드세요.",
          );
        s.mazes.push(s.maze);
        s.mazes = s.mazes.slice(-5);
        s.maze = { ...blankMaze(), id: crypto.randomUUID() };
        notice = "지난 미로를 보관하고 새 설계를 시작했어요.";
        break;
      default:
        fail(400, "ROOM_ACTION", "지원하지 않는 아지트 동작이에요.");
    }
    if (feed) {
      s.feed.push({ id: b.opId, memberId: feedActor, text: feed, at });
      s.feed = s.feed.slice(-80);
      s.activity++;
    }
    s.updatedAt = at;
    s.receipts.push({
      id: b.opId,
      memberId: actor,
      expires: b.issuedAt + 900000,
      notice,
    });
    validateRoom(s);
    const bytes = new TextEncoder().encode(JSON.stringify(s));
    if (bytes.length > 780000)
      fail(
        413,
        "ROOM_FULL",
        "아지트 보관 한도에 도달했어요. 관리자가 기록을 확인해야 합니다.",
      );
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    try {
      const saved = await github(d.route, env, "PUT", {
        message: "Save shared room activity",
        content: btoa(binary),
        branch: d.c.branch,
        ...(d.sha ? { sha: d.sha } : {}),
      });
      if (!/^[a-f0-9]{40,64}$/.test(saved.content?.sha || ""))
        fail(
          502,
          "ROOM_UNCONFIRMED",
          "저장 응답을 확인하지 못했어요. 같은 요청으로 다시 저장해 주세요.",
        );
      return json({
        notice,
        replayed: false,
        data: view(s, actor, Date.now()),
      });
    } catch (e) {
      if (e.code !== "CONFLICT") throw e;
    }
  }
  fail(
    409,
    "ROOM_BUSY",
    "다른 팀원의 작업을 저장 중이에요. 같은 요청으로 다시 저장해 주세요.",
  );
}
