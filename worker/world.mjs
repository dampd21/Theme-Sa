import {
  PLACES,
  TIMES,
  MAIL,
  CLUES,
  PETS,
  COLORS,
  SYMBOLS,
  ARTIFACTS,
  GAME_INFO,
  unlocked,
  CORRIDORS,
  PLOT,
} from "../site/world-content.mjs";
import { initialGame, replayGame } from "../site/world-games.mjs";
import { idOK } from "../site/party-rules.mjs";
const int = (v, max = 1e15) => Number.isSafeInteger(v) && v >= 0 && v <= max;
const text = (s, n = 500, blank = false) =>
  typeof s === "string" && s.length <= n && (blank || s.trim().length > 0);
const arr = (a, n) => Array.isArray(a) && a.length <= n;
export const emptyWorld = () => ({
  version: 1,
  profiles: [],
  events: [],
  quests: [],
  gifts: [],
  traces: [],
  artifactNotes: [],
  caseFound: [],
  caseSolved: false,
  relay: { floor: 1, rev: 0, tool: "lantern", history: [] },
  receipts: [],
  updatedAt: null,
});
export const newProfile = (id) => ({
  id,
  rev: 0,
  place: "hall",
  time: "day",
  clues: [],
  mail: [],
  pet: null,
  plant: 0,
  radio: false,
  lost: false,
  seal: { name: "돌아오는 길", symbol: "star", color: COLORS[0], pattern: 0 },
  display: [],
  artifacts: [],
  wins: [],
  active: null,
  plot: [],
  caseFound: [],
  caseSolved: false,
  quests: [],
  prefs: { motion: false, eerie: false, ghost: false },
  contributions: [],
});
// Visible decoration never depends on Hanja.
export function profileFor(s, id) {
  const p = s.profiles.find((x) => x.id === id) || newProfile(id);
  return structuredClone(p);
}
export function validateQuest(q) {
  if (
    !q ||
    !text(q.title, 80) ||
    !PLACES.some((x) => x.id === q.place) ||
    !text(q.intro, 800) ||
    !arr(q.clues, 3) ||
    q.clues.length !== 3 ||
    !q.clues.every((x) => text(x, 300)) ||
    !arr(q.options, 3) ||
    q.options.length !== 3 ||
    new Set(q.options).size !== 3 ||
    !q.options.every((x) => text(x, 100)) ||
    !int(q.answer, 2) ||
    !text(q.success, 600) ||
    !text(q.failure, 300) ||
    !arr(q.hints, 3) ||
    q.hints.length !== 3 ||
    !q.hints.every((x) => text(x, 300))
  )
    throw Error(
      "제목·배경·단서 3개·서로 다른 선택지 3개·정답·힌트 3개를 확인하세요.",
    );
  return {
    title: q.title.trim(),
    place: q.place,
    intro: q.intro.trim(),
    clues: q.clues.map((x) => x.trim()),
    options: q.options.map((x) => x.trim()),
    answer: q.answer,
    success: q.success.trim(),
    failure: q.failure.trim(),
    hints: q.hints.map((x) => x.trim()),
  };
}
export function validateWorld(s) {
  if (
    !s ||
    s.version !== 1 ||
    !arr(s.profiles, 80) ||
    !arr(s.events, 200) ||
    !arr(s.quests, 30) ||
    !arr(s.gifts, 80) ||
    !arr(s.traces, 80) ||
    !arr(s.artifactNotes, 80) ||
    !arr(s.receipts, 400) ||
    !arr(s.caseFound, 4) ||
    !s.caseFound.every((x) => int(x, 3)) ||
    typeof s.caseSolved !== "boolean" ||
    !s.relay ||
    !int(s.relay.floor, 10000) ||
    !s.relay.floor ||
    !int(s.relay.rev) ||
    !arr(s.relay.history, 30) ||
    !text(s.relay.tool, 30) ||
    !(s.updatedAt === null || text(s.updatedAt, 40))
  )
    throw Error("world schema");
  for (const a of [s.profiles, s.quests, s.gifts, s.receipts, s.artifactNotes])
    if (new Set(a.map((x) => x?.id)).size !== a.length)
      throw Error("duplicate record");
  for (const p of s.profiles) {
    if (
      !idOK(p.id) ||
      !int(p.rev) ||
      !PLACES.some((x) => x.id === p.place) ||
      !Object.hasOwn(TIMES, p.time) ||
      !arr(p.clues, 24) ||
      new Set(p.clues).size !== p.clues.length ||
      !p.clues.every((x) => Object.hasOwn(CLUES, x)) ||
      !arr(p.mail, 4) ||
      new Set(p.mail.map((x) => x.id)).size !== p.mail.length ||
      !p.mail.every(
        (x) => MAIL.some((m) => m.id === x.id) && int(x.choice, 1),
      ) ||
      !int(p.plant, 4) ||
      typeof p.radio !== "boolean" ||
      typeof p.lost !== "boolean" ||
      !p.seal ||
      !text(p.seal.name, 40) ||
      !text(p.seal.description || "", 300, true) ||
      !SYMBOLS.includes(p.seal.symbol) ||
      !COLORS.includes(p.seal.color) ||
      !int(p.seal.pattern, 3) ||
      !arr(p.display, 3) ||
      !arr(p.artifacts, 20) ||
      !p.artifacts.every((x) => ARTIFACTS.some((a) => a[0] === x)) ||
      !p.display.every((x) => p.artifacts.includes(x)) ||
      !arr(p.wins, 21) ||
      new Set(p.wins).size !== p.wins.length ||
      !p.wins.every((x) =>
        /^(tactics|appraisal|shop|shadow|liar|stars|deck):[012]$/.test(x),
      ) ||
      !arr(p.plot, 4) ||
      !p.plot.every((x) => int(x, 2)) ||
      !arr(p.caseFound, 4) ||
      !p.caseFound.every((x) => int(x, 3)) ||
      typeof p.caseSolved !== "boolean" ||
      !arr(p.quests, 90) ||
      !p.quests.every((x) => text(x, 120)) ||
      !p.prefs ||
      !["motion", "eerie", "ghost"].every(
        (x) => typeof p.prefs[x] === "boolean",
      ) ||
      !arr(p.contributions, 50) ||
      new Set(p.contributions).size !== p.contributions.length ||
      !p.contributions.every((x) => text(x, 120))
    )
      throw Error("world profile");
    if (
      p.pet &&
      (!Object.hasOwn(PETS, p.pet.kind) ||
        !text(p.pet.name, 30) ||
        !COLORS.includes(p.pet.color) ||
        !["창가", "책상", "다락"].includes(p.pet.home) ||
        !int(p.pet.bond, 30) ||
        !int(p.pet.lastCare) ||
        !(
          p.pet.mission === null ||
          (int(p.pet.mission.ready) && int(p.pet.mission.route, 2))
        ))
    )
      throw Error("pet");
    if (
      p.active &&
      (!idOK(p.active.id) ||
        !Object.hasOwn(GAME_INFO, p.active.type) ||
        !int(p.active.level, 2) ||
        !int(p.active.seed, 4294967295) ||
        !arr(p.active.actions, 240) ||
        !p.active.actions.every(
          (a) => a && typeof a === "object" && JSON.stringify(a).length < 150,
        ))
    )
      throw Error("world game");
  }
  for (const q of s.quests) {
    if (!idOK(q.id) || !idOK(q.owner) || !int(q.rev) || !int(q.plays))
      throw Error("quest metadata");
    validateQuest(q.data);
  }
  for (const e of s.events)
    if (!idOK(e.owner) || !text(e.text, 350) || !int(e.at))
      throw Error("event");
  for (const g of s.gifts)
    if (
      !idOK(g.id) ||
      !idOK(g.from) ||
      !idOK(g.to) ||
      !text(g.seal?.name, 40) ||
      !text(g.seal.description || "", 300, true) ||
      !SYMBOLS.includes(g.seal.symbol) ||
      !COLORS.includes(g.seal.color) ||
      !int(g.seal.pattern, 3)
    )
      throw Error("gift");
  for (const n of s.artifactNotes)
    if (
      !idOK(n.id) ||
      !idOK(n.owner) ||
      !ARTIFACTS.some((a) => a[0] === n.artifact) ||
      !text(n.text, 300) ||
      !int(n.at)
    )
      throw Error("artifact note");
  for (const t of s.traces)
    if (
      !idOK(t.owner) ||
      !PLACES.some((p) => p.id === t.place) ||
      !Object.hasOwn(TIMES, t.time) ||
      !int(t.at)
    )
      throw Error("trace");
  for (const r of s.relay.history)
    if (
      !idOK(r.owner) ||
      !int(r.floor, 10000) ||
      !text(r.note, 300, true) ||
      !text(r.tool, 30)
    )
      throw Error("relay");
  for (const r of s.receipts)
    if (
      !idOK(r.id) ||
      !idOK(r.owner) ||
      !int(r.expires) ||
      !/^[a-f0-9]{64}$/.test(r.digest)
    )
      throw Error("receipt");
  return s;
}
export function worldView(s, actor) {
  return {
    version: 1,
    now: Date.now(),
    profile: profileFor(s, actor),
    events: s.events,
    quests: s.quests,
    gifts: s.gifts.filter((x) => x.to === actor || x.from === actor),
    artifactNotes: s.artifactNotes,
    traces: s.traces.filter((t) => t.owner !== actor),
    caseFound: s.caseFound,
    caseSolved: s.caseSolved,
    relay: s.relay,
    barrier: s.profiles.reduce((a, p) => a + p.contributions.length, 0),
    neighbors: s.profiles.map((p) => ({
      id: p.id,
      pet: p.pet
        ? { kind: p.pet.kind, name: p.pet.name, color: p.pet.color }
        : null,
      display: p.display,
      seal: p.seal,
    })),
    updatedAt: s.updatedAt,
  };
}
export function applyWorld(s, b, members, now = Date.now()) {
  let p = s.profiles.find((x) => x.id === b.memberId);
  if (!p) {
    if (s.profiles.length >= 80)
      throw Error("새 마을 프로필은 80개까지 보관합니다.");
    p = newProfile(b.memberId);
    p.seal.name = "돌아오는 길";
    s.profiles.push(p);
  }
  if (p.rev !== b.rev) {
    const e = Error(
      "다른 기기에서 먼저 저장했어요. 초안을 유지하고 최신 상태를 확인하세요.",
    );
    e.status = 409;
    throw e;
  }
  const event = (t) => {
    s.events.push({ owner: p.id, text: t, at: now });
    s.events = s.events.slice(-200);
  };
  const earn = (tag, artifact) => {
    if (!p.contributions.includes(tag) && p.contributions.length < 50)
      p.contributions.push(tag);
    if (artifact && !p.artifacts.includes(artifact)) p.artifacts.push(artifact);
  };
  const requireRoom = (id) => {
    if (!unlocked(p, id)) throw Error("마을을 더 조사하면 이 방이 열립니다.");
  };
  switch (b.action) {
    case "explore": {
      const place = PLACES.find((x) => x.id === b.place);
      if (!place || !Object.hasOwn(TIMES, b.time))
        throw Error("장소와 시간대를 확인하세요.");
      p.place = place.id;
      p.time = b.time;
      const clue = place.clues[Object.keys(TIMES).indexOf(b.time)];
      if (!p.clues.includes(clue)) {
        p.clues.push(clue);
        earn("clue:" + clue);
        event(`${place.name}의 ${TIMES[b.time]} 풍경에서 새 단서를 발견했다.`);
      }
      if (p.prefs.ghost) {
        s.traces = s.traces.filter(
          (t) =>
            !(t.owner === p.id && t.place === p.place && t.time === p.time),
        );
        s.traces.push({ owner: p.id, place: p.place, time: p.time, at: now });
        s.traces = s.traces.slice(-80);
      }
      break;
    }
    case "mail": {
      const m = MAIL.find((x) => x.id === b.mail);
      if (
        !m ||
        p.mail.some((x) => x.id === m.id) ||
        p.mail.length < m.need ||
        !int(b.choice, 1)
      )
        throw Error("아직 도착하지 않았거나 이미 답장한 편지입니다.");
      p.mail.push({ id: m.id, choice: b.choice });
      earn("mail:" + m.id, m.id === "spring" ? "spring" : null);
      event(`${m.from}에게 “${m.choices[b.choice]}”라는 답장을 보냈다.`);
      break;
    }
    case "pet":
      if (
        !Object.hasOwn(PETS, b.kind) ||
        !text(b.name, 30) ||
        !COLORS.includes(b.color) ||
        !["창가", "책상", "다락"].includes(b.home)
      )
        throw Error("수호령의 이름·종류·색·잠자리를 확인하세요.");
      p.pet = {
        kind: b.kind,
        name: b.name.trim(),
        color: b.color,
        home: b.home,
        bond: p.pet?.bond || 0,
        lastCare: p.pet?.lastCare || 0,
        mission: p.pet?.mission || null,
      };
      event(
        `${PETS[b.kind][1]} ${p.pet.name}와 ${b.home}에 작은 자리를 마련했다.`,
      );
      break;
    case "care":
      if (!p.pet) throw Error("먼저 수호령을 만나 주세요.");
      if (now - p.pet.lastCare < 10000)
        throw Error(
          "수호령이 방금 받은 인사를 즐기고 있어요. 잠깐 기다려 주세요.",
        );
      p.pet.bond = Math.min(30, p.pet.bond + 1);
      p.pet.lastCare = now;
      break;
    case "errand":
      if (!p.pet || p.pet.mission || !int(b.route, 2))
        throw Error("수호령 또는 심부름 상태를 확인하세요.");
      p.pet.mission = { route: b.route, ready: now + 60000 };
      break;
    case "claim":
      if (!p.pet?.mission || p.pet.mission.ready > now)
        throw Error(
          "수호령이 아직 돌아오는 중입니다. 1분 뒤 또는 다음 방문에 확인하세요.",
        );
      event(
        `${p.pet.name}가 ${["강변에서 잃어버린 바람 소리", "시장 지붕에서 따뜻한 별 조각", "역 벤치에서 주인 없는 작은 종"][p.pet.mission.route]}를 가져왔다.`,
      );
      p.pet.mission = null;
      earn("errand", "errand");
      break;
    case "plant":
      requireRoom("greenhouse");
      if (p.plant >= 4)
        throw Error("영초가 잘 자랐어요. 시들지 않으니 편히 감상하세요.");
      p.plant++;
      if (p.plant === 4) {
        earn("garden", "garden");
        event("달빛 온실에서 시들지 않는 영초가 피었다.");
      }
      break;
    case "radio":
      requireRoom("radio");
      if (JSON.stringify(b.dials) !== "[3,1,4]")
        throw Error(
          "잡음만 들립니다. 창문의 별 셋, 등불 하나, 네 방향의 길을 떠올려 보세요.",
        );
      p.radio = true;
      earn("radio", "radio");
      event(
        "새벽 방송실에서 “돌아올 자리는 언제나 남아 있어요”라는 목소리를 들었다.",
      );
      break;
    case "lost":
      requireRoom("lost");
      if (!p.artifacts.includes("appraisal"))
        throw Error(
          "유물 감정소를 한 번 완주하면 소유자의 흔적을 알아볼 수 있어요.",
        );
      if (b.owner !== "윤")
        throw Error("승차권을 소중히 보관하는 사람을 떠올려 보세요.");
      p.lost = true;
      earn("lost", "lost");
      event("승무원 윤에게 오래된 여행 가방을 돌려주었다.");
      break;
    case "seal":
      if (
        !text(b.name, 40) ||
        !text(b.description || "", 300, true) ||
        !SYMBOLS.includes(b.symbol) ||
        !COLORS.includes(b.color) ||
        !int(b.pattern, 3)
      )
        throw Error("부적의 이름·문양·색을 확인하세요.");
      p.seal = {
        name: b.name.trim(),
        description: (b.description || "").trim(),
        symbol: b.symbol,
        color: b.color,
        pattern: b.pattern,
      };
      break;
    case "gift":
      if (!members.has(b.to) || b.to === p.id || !idOK(b.id))
        throw Error("선물할 동료를 선택하세요.");
      if (s.gifts.some((g) => g.id === b.id))
        throw Error("이미 보낸 선물 번호입니다.");
      if (s.gifts.length >= 80)
        throw Error(
          "선물함이 가득 찼어요. 받은 선물을 정리한 뒤 다시 보내세요.",
        );
      s.gifts.push({
        id: b.id,
        from: p.id,
        to: b.to,
        seal: structuredClone(p.seal),
      });
      event("직접 만든 부적의 사본을 동료에게 선물했다.");
      break;
    case "giftDelete":
      s.gifts = s.gifts.filter(
        (g) => !(g.id === b.id && (g.to === p.id || g.from === p.id)),
      );
      break;
    case "display":
      if (
        !arr(b.items, 3) ||
        new Set(b.items).size !== b.items.length ||
        !b.items.every((x) => p.artifacts.includes(x))
      )
        throw Error("얻은 유물 중 최대 세 개를 진열하세요.");
      p.display = b.items;
      break;
    case "artifactNote":
      if (
        !idOK(b.id) ||
        !text(b.text, 300) ||
        !ARTIFACTS.some((a) => a[0] === b.artifact)
      )
        throw Error("유물과 300자 이하의 쪽지를 확인하세요.");
      if (s.artifactNotes.some((n) => n.id === b.id))
        throw Error("이미 저장한 쪽지 번호입니다.");
      if (s.artifactNotes.length >= 80)
        throw Error(
          "유물 쪽지함이 가득 찼어요. 내 쪽지를 정리한 뒤 다시 써 주세요.",
        );
      s.artifactNotes.push({
        id: b.id,
        owner: p.id,
        artifact: b.artifact,
        text: b.text.trim(),
        at: now,
      });
      break;
    case "artifactNoteDelete":
      s.artifactNotes = s.artifactNotes.filter(
        (n) => !(n.id === b.id && n.owner === p.id),
      );
      break;
    case "gameStart":
      if (p.active)
        throw Error("저장한 게임을 이어 하거나 먼저 종료해 주세요.");
      initialGame(b.type, b.level, b.seed);
      if (!idOK(b.id) || !int(b.seed, 4294967295))
        throw Error("게임 번호를 확인하세요.");
      p.active = {
        id: b.id,
        type: b.type,
        level: b.level,
        seed: b.seed,
        actions: [],
      };
      break;
    case "gameSave": {
      if (
        !p.active ||
        p.active.id !== b.id ||
        !arr(b.actions, 240) ||
        p.active.actions.some(
          (a, i) => JSON.stringify(a) !== JSON.stringify(b.actions[i]),
        )
      )
        throw Error("저장된 게임과 선택 기록이 맞지 않아요.");
      const result = replayGame(p.active, b.actions);
      p.active.actions = structuredClone(b.actions);
      if (result.status !== "active") {
        if (result.status === "won") {
          const win = p.active.type + ":" + p.active.level;
          if (!p.wins.includes(win)) {
            p.wins.push(win);
            earn("win:" + win, p.active.type);
            event(
              `${GAME_INFO[p.active.type][1]} ${p.active.level + 1}단계를 완주했다.`,
            );
          }
        }
        p.active = null;
      }
      break;
    }
    case "gameAbandon":
      p.active = null;
      break;
    case "caseInspect":
      if (!int(b.index, 3)) throw Error("자료 번호 오류");
      if (!p.caseFound.includes(b.index)) p.caseFound.push(b.index);
      break;
    case "caseShare":
      if (!int(b.index, 3) || !p.caseFound.includes(b.index))
        throw Error("먼저 내 자료를 조사해 주세요.");
      if (!s.caseFound.includes(b.index)) s.caseFound.push(b.index);
      break;
    case "caseSolve":
      if (new Set([...p.caseFound, ...s.caseFound]).size < 4)
        throw Error("네 자료를 모으면 모순을 확인할 수 있어요.");
      if (b.answer !== 1) throw Error("시간·섬유·장소를 함께 비교해 보세요.");
      p.caseSolved = true;
      s.caseSolved = true;
      earn("case", "case");
      event("네 장의 증언을 연결해 황혼의 찻집에서 편지의 행방을 알아냈다.");
      break;
    case "relay": {
      if (s.relay.rev !== b.relayRev) {
        const e = Error(
          "동료가 먼저 다음 방으로 갔어요. 최신 복도를 확인하세요.",
        );
        e.status = 409;
        throw e;
      }
      if (s.relay.floor >= 10000)
        throw Error(
          "복도 시즌의 마지막 방입니다. 관리자가 다음 시즌을 준비해야 합니다.",
        );
      const room = CORRIDORS[(s.relay.floor - 1) % CORRIDORS.length];
      if (b.door !== room[2]) throw Error("문 앞의 조건을 다시 읽어 보세요.");
      if (
        !text(b.note, 300, true) ||
        !["bell", "mirror", "compass", "letter", "lantern", "thread"].includes(
          b.tool,
        )
      )
        throw Error("인계 메모와 준비물을 확인하세요.");
      s.relay.history.push({
        owner: p.id,
        floor: s.relay.floor,
        note: b.note,
        tool: b.tool,
      });
      s.relay.history = s.relay.history.slice(-30);
      s.relay.tool = b.tool;
      s.relay.floor++;
      s.relay.rev++;
      earn("relay:" + Math.min(s.relay.floor, 6));
      event(
        `${s.relay.floor - 1}번째 복도를 지나 다음 사람을 위한 메모를 남겼다.`,
      );
      break;
    }
    case "questSave": {
      const q = validateQuest(b.quest);
      if (
        !idOK(b.id) ||
        !arr(b.proof?.seen, 3) ||
        new Set(b.proof.seen).size !== 3 ||
        !b.proof.seen.every((x) => int(x, 2)) ||
        b.proof.answer !== q.answer
      )
        throw Error(
          "세 단서를 읽고 정답을 골라 미리 풀어보기를 완료한 뒤 공개하세요.",
        );
      const old = s.quests.find((x) => x.id === b.id);
      if ((old?.rev ?? null) !== b.questRev) {
        const e = Error("다른 수정이 먼저 저장되었습니다.");
        e.status = 409;
        throw e;
      }
      if (!old && s.quests.length >= 30)
        throw Error("사용자 의뢰는 30개까지 보관합니다.");
      const row = {
        id: b.id,
        owner: old?.owner || p.id,
        rev: (old?.rev ?? 0) + 1,
        plays: old?.plays || 0,
        data: q,
      };
      if (old) s.quests[s.quests.indexOf(old)] = row;
      else s.quests.push(row);
      event(`새 의뢰 “${q.title}”을 게시했다.`);
      break;
    }
    case "questDelete": {
      const q = s.quests.find((q) => q.id === b.id);
      if (!q) throw Error("이미 삭제된 의뢰입니다.");
      if (q.rev !== b.questRev) {
        const e = Error("수정된 의뢰를 다시 확인하세요.");
        e.status = 409;
        throw e;
      }
      s.quests = s.quests.filter((x) => x !== q);
      break;
    }
    case "questSolve": {
      const q = s.quests.find((q) => q.id === b.id);
      if (!q || q.rev !== b.questRev)
        throw Error("의뢰가 바뀌었어요. 최신 의뢰를 다시 조사하세요.");
      if (
        !arr(b.seen, 3) ||
        new Set(b.seen).size !== 3 ||
        !b.seen.every((x) => int(x, 2))
      )
        throw Error("단서를 모두 조사하세요.");
      if (q.data.answer !== b.answer) throw Error(q.data.failure);
      const key = q.id + ":" + q.rev;
      if (!p.quests.includes(key)) {
        p.quests.push(key);
        p.quests = p.quests.slice(-90);
        q.plays++;
        earn("quest:" + q.id);
        event(`동료의 의뢰 “${q.data.title}”을 해결했다.`);
      }
      break;
    }
    case "plot": {
      const chapter = PLOT[p.plot.length];
      if (!chapter || !chapter.need.every((x) => p.clues.includes(x)))
        throw Error("수첩의 필요한 단서를 먼저 모아 주세요.");
      if (
        !int(b.answer, 2) ||
        (chapter.answer !== null && chapter.answer !== b.answer)
      )
        throw Error("단서들이 공통으로 가리키는 사실을 다시 생각해 보세요.");
      p.plot.push(b.answer);
      earn("plot:" + p.plot.length, p.plot.length === 4 ? "plot" : null);
      event(`${chapter.title}을 기록했다. ${chapter.text}`);
      break;
    }
    case "prefs":
      if (
        !b.prefs ||
        !["motion", "eerie", "ghost"].every(
          (x) => typeof b.prefs[x] === "boolean",
        )
      )
        throw Error("환경 설정을 확인하세요.");
      p.prefs = {
        motion: b.prefs.motion,
        eerie: b.prefs.eerie,
        ghost: b.prefs.ghost,
      };
      if (!p.prefs.ghost) s.traces = s.traces.filter((t) => t.owner !== p.id);
      break;
    default:
      throw Error("지원하지 않는 마을 작업입니다.");
  }
  p.rev++;
  s.updatedAt = new Date(now).toISOString();
  return p;
}
export async function worldRoute(request, env, session, D) {
  const { fail, json, github, privateRepo, filePath, getArchive, readJson } = D;
  const c = await privateRepo(env),
    route = filePath({ ...c, path: c.path + ".world.json" });
  const decode = (f) => {
    const raw = atob(f.content.replace(/\s/g, ""));
    if (raw.length > 800000) throw Error();
    const a = new Uint8Array(raw.length);
    for (let i = 0; i < a.length; i++) a[i] = raw.charCodeAt(i);
    return validateWorld(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(a)),
    );
  };
  async function read() {
    const f = await github(
      route + "?ref=" + encodeURIComponent(c.branch) + "&_=" + Date.now(),
      env,
    );
    if (f.missing) return { s: emptyWorld(), sha: null };
    try {
      if (
        f.type !== "file" ||
        f.encoding !== "base64" ||
        f.size > 800000 ||
        !/^[a-f0-9]{40,64}$/.test(f.sha || "")
      )
        throw Error();
      return { s: decode(f), sha: f.sha };
    } catch {
      fail(
        502,
        "WORLD_CORRUPT",
        "마을 기록 형식 또는 용량을 확인해야 합니다. 기존 파일은 덮어쓰지 않았어요.",
      );
    }
  }
  if (request.method === "GET")
    return json(
      worldView(
        (await read()).s,
        new URL(request.url).searchParams.get("actor") || "",
      ),
    );
  const b = await readJson(request, 40000),
    now = Date.now();
  if (b.version !== 1) fail(426, "WORLD_UPDATE", "마을 화면을 새로고침하세요.");
  if (
    !idOK(b.memberId) ||
    !idOK(b.opId) ||
    !int(b.issuedAt) ||
    b.issuedAt > now + 30000 ||
    b.issuedAt + 900000 <= now ||
    !int(b.rev)
  )
    fail(400, "WORLD_INPUT", "프로필 또는 저장 요청의 유효 시간을 확인하세요.");
  const archive = await getArchive(env, false, c),
    members = new Set(archive.state.members.map((m) => m.id));
  if (!members.has(b.memberId))
    fail(400, "MEMBER_REQUIRED", "본인의 현재 활동 프로필을 선택하세요.");
  const digest = [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(b)),
      ),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  for (let n = 0; n < 5; n++) {
    const { s, sha } = await read();
    s.receipts = s.receipts.filter((x) => x.expires > now);
    const receipt = s.receipts.find((x) => x.id === b.opId);
    if (receipt) {
      if (receipt.owner !== b.memberId || receipt.digest !== digest)
        fail(400, "WORLD_REPLAY", "이미 사용된 저장 번호입니다.");
      return json({ data: worldView(s, b.memberId), replayed: true });
    }
    if (s.receipts.length >= 400)
      fail(
        429,
        "WORLD_BUSY",
        "최근 저장이 많아요. 잠시 후 같은 요청을 다시 저장하세요.",
      );
    try {
      applyWorld(s, b, members, now);
    } catch (e) {
      fail(
        e.status || 400,
        e.status === 409 ? "WORLD_CONFLICT" : "WORLD_INPUT",
        e.message,
      );
    }
    s.receipts.push({
      id: b.opId,
      owner: b.memberId,
      digest,
      expires: now + 900000,
    });
    validateWorld(s);
    const raw = new TextEncoder().encode(JSON.stringify(s));
    if (raw.length > 780000)
      fail(
        413,
        "WORLD_FULL",
        "마을 보관 용량이 가득 찼어요. 관리자가 오래된 기록을 정리해야 합니다.",
      );
    let binary = "";
    for (let i = 0; i < raw.length; i += 8192)
      binary += String.fromCharCode(...raw.subarray(i, i + 8192));
    try {
      const saved = await github(route, env, "PUT", {
        message: "Update moonlight village",
        branch: c.branch,
        content: btoa(binary),
        ...(sha ? { sha } : {}),
      });
      if (!/^[a-f0-9]{40,64}$/.test(saved.content?.sha || ""))
        fail(
          502,
          "WORLD_UNCONFIRMED",
          "저장 응답을 확인하지 못했어요. 같은 요청으로 다시 저장하세요.",
        );
      return json({ data: worldView(s, b.memberId) });
    } catch (e) {
      if (e.status === 409) continue;
      throw e;
    }
  }
  fail(
    409,
    "WORLD_CONFLICT",
    "동료의 작업을 반영 중이에요. 최신 상태를 확인하세요.",
  );
}
