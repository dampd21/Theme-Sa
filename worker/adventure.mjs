import {
  CASES,
  GEAR,
  nodes,
  exits,
  accessible,
  clueId,
  ADVENTURE_VERSION,
} from "../site/adventure-rules.mjs";
const ANSWERS = {
  harbor: "star-ship-bell",
  garden: "west-flower",
  tower: "promise-third",
  library: "moon-wave-bird",
  theater: "goodbye",
  market: "blank",
  observatory: "north-stop",
  inn: "hello-key",
};
const validId = (x) => typeof x === "string" && x.length > 0 && x.length <= 100;
const integer = (x, n = 1e15) => Number.isSafeInteger(x) && x >= 0 && x <= n;
const array = (x, n) => Array.isArray(x) && x.length <= n;
const date = (x) =>
  typeof x === "string" && x.length < 40 && Number.isFinite(Date.parse(x));
const unique = (x) => new Set(x).size === x.length;
export const emptyAdventure = () => ({
  version: 1,
  runs: [],
  receipts: [],
  updatedAt: null,
});
export function validateAdventure(s) {
  if (
    !s ||
    s.version !== 1 ||
    !array(s.runs, 72) ||
    !array(s.receipts, 400) ||
    (s.updatedAt !== null && !date(s.updatedAt)) ||
    !unique(s.runs.map((r) => r.id))
  )
    throw Error("adventure schema");
  for (const r of s.runs) {
    const c = CASES[r.campaign];
    if (
      !c ||
      !validId(r.id) ||
      !validId(r.owner) ||
      !["solo", "shared"].includes(r.mode) ||
      !["active", "returned"].includes(r.status) ||
      !array(r.party, 300) ||
      !r.party.length ||
      !unique(r.party.map((p) => p.memberId)) ||
      !array(r.found, 6) ||
      !unique(r.found) ||
      !array(r.solved, 3) ||
      !unique(r.solved) ||
      !array(r.log, 80) ||
      !array(r.votes, 300) ||
      !array(r.notes, 30) ||
      !array(r.hints, 3) ||
      !integer(r.rev) ||
      !integer(r.seed, 4294967295) ||
      !date(r.createdAt) ||
      !date(r.updatedAt) ||
      typeof r.ending !== "string" ||
      r.ending.length > 20 ||
      !r.found.every(
        (v) => /^\d-[01]$/.test(v) && Number(v[0]) < c.stages.length,
      ) ||
      !r.solved.every((v) => integer(v, c.stages.length - 1))
    )
      throw Error("run schema");
    for (const p of r.party)
      if (
        !validId(p.memberId) ||
        !integer(p.at, nodes(r.campaign).length - 1) ||
        !array(p.gear, 3) ||
        p.gear.length !== 3 ||
        !unique(p.gear) ||
        !p.gear.every((v) => GEAR.some((g) => g[0] === v))
      )
        throw Error("party");
    for (const v of r.votes)
      if (
        !r.party.some((p) => p.memberId === v.memberId) ||
        !c.endings.some((e) => e[0] === v.choice)
      )
        throw Error("vote");
    if (
      !unique(r.votes.map((v) => v.memberId)) ||
      !unique(r.hints.map((h) => h.stage))
    )
      throw Error("duplicates");
    for (const h of r.hints)
      if (
        !integer(h.stage, c.stages.length - 1) ||
        !integer(h.level, 2) ||
        !h.level
      )
        throw Error("hint");
    for (const n of r.notes)
      if (
        !validId(n.memberId) ||
        typeof n.text !== "string" ||
        n.text.length > 240 ||
        !date(n.at)
      )
        throw Error("note");
    for (const l of r.log)
      if (
        !validId(l.memberId) ||
        typeof l.text !== "string" ||
        l.text.length > 300 ||
        !date(l.at)
      )
        throw Error("log");
    if (
      r.mode === "solo" &&
      (r.party.length !== 1 || r.party[0].memberId !== r.owner)
    )
      throw Error("solo");
    if (
      r.solved.some((v, i) => v !== i) ||
      r.solved.some(
        (v) => ![0, 1].every((side) => r.found.includes(clueId(v, side))),
      )
    )
      throw Error("progress");
    if (
      r.status === "returned" &&
      !["abort", ...c.endings.map((e) => e[0])].includes(r.ending)
    )
      throw Error("ending");
  }
  for (const q of s.receipts)
    if (
      !validId(q.id) ||
      !validId(q.memberId) ||
      !integer(q.expires) ||
      typeof q.notice !== "string" ||
      q.notice.length > 300
    )
      throw Error("receipt");
  if (!unique(s.receipts.map((q) => q.id))) throw Error("receipt duplicate");
  return s;
}
export function adventureView(s, actor) {
  return {
    version: 1,
    now: Date.now(),
    updatedAt: s.updatedAt,
    runs: s.runs
      .filter((r) => r.mode === "shared" || r.owner === actor)
      .map((r) => structuredClone(r)),
  };
}
export async function adventureRoute(request, env, session, D) {
  const { fail, json, github, privateRepo, filePath, getArchive, readJson } = D;
  let config;
  const repo = () => (config ||= privateRepo(env));
  async function load() {
    const c = await repo(),
      route = filePath({ ...c, path: c.path + ".adventure.json" }),
      f = await github(
        route + "?ref=" + encodeURIComponent(c.branch) + "&_=" + Date.now(),
        env,
      );
    if (f.missing) return { s: emptyAdventure(), sha: null, c, route };
    try {
      if (
        f.type !== "file" ||
        f.encoding !== "base64" ||
        f.size > 800000 ||
        !/^[a-f0-9]{40,64}$/.test(f.sha || "")
      )
        throw Error();
      const bytes = Uint8Array.from(atob(f.content.replace(/\s/g, "")), (v) =>
        v.charCodeAt(0),
      );
      if (bytes.length > 800000) throw Error();
      return {
        s: validateAdventure(
          JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
        ),
        sha: f.sha,
        c,
        route,
      };
    } catch {
      fail(
        502,
        "ADVENTURE_CORRUPT",
        "모험 기록이 손상되었거나 호환되지 않습니다. 기존 파일은 덮어쓰지 않았어요.",
      );
    }
  }
  const url = new URL(request.url),
    now = Date.now();
  if (request.method === "GET")
    return json(
      adventureView((await load()).s, url.searchParams.get("actor") || ""),
    );
  const b = await readJson(request, 10000),
    actor = b.memberId;
  if (b.version !== ADVENTURE_VERSION)
    fail(426, "ADVENTURE_UPDATE", "모험 화면을 새로고침해 주세요.");
  if (
    !validId(actor) ||
    !validId(b.opId) ||
    !/^[a-zA-Z0-9_-]+$/.test(b.opId) ||
    !integer(b.issuedAt) ||
    b.issuedAt > now + 30000 ||
    b.issuedAt + 900000 <= now
  )
    fail(
      400,
      "ADVENTURE_EXPIRED",
      "요청이 만료되었어요. 최신 상태를 확인해 주세요.",
    );
  const archive = await getArchive(env, false, await repo()),
    members = new Set(archive.state.members.map((m) => m.id));
  if (!members.has(actor))
    fail(400, "MEMBER_REQUIRED", "본인의 현재 활동 프로필을 선택해 주세요.");
  const input = (m) => fail(400, "ADVENTURE_INPUT", m),
    conflict = () =>
      fail(
        409,
        "ADVENTURE_CHANGED",
        "다른 조사나 이동이 먼저 반영됐어요. 최신 상태를 확인하고 다시 선택하세요.",
      );
  for (let attempt = 0; attempt < 5; attempt++) {
    const d = await load(),
      s = d.s;
    s.receipts = s.receipts.filter((q) => q.expires > now);
    const old = s.receipts.find((q) => q.id === b.opId);
    if (old) {
      if (old.memberId !== actor) input("다른 프로필의 저장 요청입니다.");
      return json({
        data: adventureView(s, actor),
        notice: old.notice,
        replayed: true,
      });
    }
    if (s.receipts.length >= 400)
      fail(
        429,
        "ADVENTURE_BUSY",
        "최근 저장이 많아요. 잠시 후 같은 요청으로 다시 시도하세요.",
      );
    let r = s.runs.find((r) => r.id === b.runId),
      notice = "",
      at = new Date(now).toISOString();
    const log = (text) => {
      r.log.push({ memberId: actor, text, at });
      r.log = r.log.slice(-80);
    };
    if (b.action === "create") {
      if (
        !Object.hasOwn(CASES, b.campaign) ||
        !["solo", "shared"].includes(b.mode) ||
        !array(b.gear, 3) ||
        b.gear.length !== 3 ||
        !unique(b.gear) ||
        !b.gear.every((v) => GEAR.some((g) => g[0] === v))
      )
        input("탐험과 서로 다른 준비물 세 개를 선택해 주세요.");
      if (
        s.runs.filter((r) => r.status === "active").length >= 12 ||
        s.runs.filter((r) => r.status === "active" && r.owner === actor)
          .length >= 2
      )
        input(
          "진행 중인 원정을 먼저 마치거나 귀환해 주세요. 개인당 개설 2개, 팀 전체 12개까지입니다.",
        );
      if (s.runs.length >= 72)
        input("완료된 원정 중 불필요한 기록을 정리해 주세요.");
      r = {
        id: crypto.randomUUID(),
        owner: actor,
        campaign: b.campaign,
        mode: b.mode,
        status: "active",
        party: [{ memberId: actor, at: 0, gear: b.gear }],
        found: [],
        solved: [],
        log: [],
        notes: [],
        hints: [],
        votes: [],
        rev: 0,
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
        createdAt: at,
        updatedAt: at,
        ending: "",
      };
      s.runs.push(r);
      log("준비물 세 개를 챙겨 원정을 시작했다.");
      notice = "원정이 출발했어요.";
    } else {
      if (!r) conflict();
      if (r.mode === "solo" && r.owner !== actor)
        fail(
          403,
          "ADVENTURE_SOLO",
          "개인 원정은 해당 활동 프로필로 진행해 주세요.",
        );
      let p = r.party.find((p) => p.memberId === actor);
      const c = CASES[r.campaign];
      if (b.action === "archive") {
        if (
          r.status !== "returned" ||
          (r.owner !== actor && members.has(r.owner))
        )
          input("개설자만 완료된 원정을 정리할 수 있어요.");
        s.runs = s.runs.filter((x) => x !== r);
        notice =
          "완료된 원정을 목록에서 정리했어요. GitHub 과거 이력은 남아 있습니다.";
      } else if (b.action === "join") {
        if (r.mode !== "shared" || r.status !== "active")
          input("진행 중인 공동 원정만 참여할 수 있어요.");
        if (!p) {
          if (r.votes.length)
            input(
              "이미 귀환 결말을 의논하고 있어요. 다음 원정에 함께해 주세요.",
            );
          if (r.party.length >= 300) input("원정 인원이 가득 찼어요.");
          if (
            !array(b.gear, 3) ||
            b.gear.length !== 3 ||
            !unique(b.gear) ||
            !b.gear.every((v) => GEAR.some((g) => g[0] === v))
          )
            input("준비물 세 개를 선택해 주세요.");
          r.party.push({ memberId: actor, at: 0, gear: b.gear });
          r.votes = [];
          log("동료의 원정에 합류했다.");
        }
        notice = "공동 원정에 합류했어요. 다음 선택부터 함께할 수 있습니다.";
      } else {
        if (!p || r.status !== "active")
          input("먼저 진행 중인 원정에 참여해 주세요.");
        const n = nodes(r.campaign)[p.at],
          stage = c.stages[n.stage];
        if (b.action === "move") {
          if (
            b.from !== p.at ||
            !exits(r, p.at, p.gear).includes(b.to) ||
            !accessible(r, b.to)
          )
            conflict();
          p.at = b.to;
          notice = nodes(r.campaign)[p.at].name + "에 도착했어요.";
        } else if (b.action === "inspect") {
          if (b.from !== p.at || !["left", "right"].includes(n.kind))
            conflict();
          const side = n.kind === "left" ? 0 : 1,
            id = clueId(n.stage, side);
          if (!r.found.includes(id)) {
            r.found.push(id);
            log(stage.clues[side][0] + " 단서를 발견했다.");
          }
          notice = stage.clues[side][1];
        } else if (b.action === "hint") {
          if (n.kind !== "platform")
            input("역의 장치 앞에서 길잡이에게 물어보세요.");
          let h = r.hints.find((h) => h.stage === n.stage);
          if (!h) {
            h = { stage: n.stage, level: 0 };
            r.hints.push(h);
          }
          h.level = Math.min(
            2,
            h.level + (stage.clues.some((v) => p.gear.includes(v[2])) ? 2 : 1),
          );
          notice = stage.puzzle.hints[h.level - 1];
        } else if (b.action === "solve") {
          if (
            b.from !== p.at ||
            n.kind !== "platform" ||
            n.stage !== r.solved.length
          )
            conflict();
          if (![0, 1].every((side) => r.found.includes(clueId(n.stage, side))))
            input("두 조사 지점의 단서를 먼저 모아 주세요.");
          if (!stage.puzzle.options.some((o) => o[0] === b.answer))
            input("장치의 선택지를 골라 주세요.");
          if (b.answer === ANSWERS[stage.puzzle.id]) {
            r.solved.push(n.stage);
            log(stage.puzzle.title + "을 해결했다.");
            notice = "신호가 복원되었어요. 다음 여정으로 갈 수 있습니다.";
          } else
            notice =
              "장치가 조용히 꺼졌어요. 단서와 길잡이 힌트를 비교해 보세요. 벌점은 없습니다.";
        } else if (b.action === "note") {
          if (
            typeof b.text !== "string" ||
            !b.text.trim() ||
            b.text.trim().length > 240
          )
            input("메모를 1~240자로 적어 주세요.");
          r.notes.push({ memberId: actor, text: b.text.trim(), at });
          r.notes = r.notes.slice(-30);
          notice = "원정 수첩에 메모를 남겼어요.";
        } else if (b.action === "vote") {
          if (
            r.solved.length !== c.stages.length ||
            !c.endings.some((e) => e[0] === b.choice)
          )
            input("모든 장치를 해결한 뒤 귀환의 결말을 선택해 주세요.");
          r.votes = r.votes.filter((v) => v.memberId !== actor);
          r.votes.push({ memberId: actor, choice: b.choice });
          const voters = r.party.filter((p) => members.has(p.memberId)),
            needed = Math.floor(voters.length / 2) + 1;
          if (
            r.votes.filter(
              (v) => v.choice === b.choice && members.has(v.memberId),
            ).length >= needed
          ) {
            r.status = "returned";
            r.ending = b.choice;
            log(
              c.endings.find((e) => e[0] === b.choice)[1] +
                " — 원정에서 귀환했다.",
            );
            notice = "원정 완료! 유물과 탐험 기록을 확인하세요.";
          } else
            notice = `결말 의견을 남겼어요. 현재 참여 가능한 ${voters.length}개 프로필 중 ${needed}개가 같은 결말을 선택하면 귀환합니다.`;
        } else if (b.action === "leave") {
          if (r.mode === "solo" || r.party.length === 1) {
            r.status = "returned";
            r.ending = "abort";
            log("안전하게 조기 귀환했다.");
          } else {
            r.party = r.party.filter((q) => q !== p);
            r.votes = [];
            log("원정을 동료에게 맡기고 귀환했다.");
          }
          notice =
            "안전하게 귀환했어요. 다른 동료의 진행과 기존 능력치는 유지됩니다.";
        } else input("지원하지 않는 모험 동작입니다.");
      }
    }
    r.rev++;
    r.updatedAt = at;
    s.updatedAt = at;
    s.receipts.push({
      id: b.opId,
      memberId: actor,
      expires: b.issuedAt + 900000,
      notice,
    });
    validateAdventure(s);
    const bytes = new TextEncoder().encode(JSON.stringify(s));
    if (bytes.length > 780000)
      fail(
        413,
        "ADVENTURE_FULL",
        "모험 보관 한도에 도달했습니다. 완료된 원정을 정리해 주세요.",
      );
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    try {
      const saved = await github(d.route, env, "PUT", {
        message: "Save adventure progress",
        content: btoa(binary),
        branch: d.c.branch,
        ...(d.sha ? { sha: d.sha } : {}),
      });
      if (!/^[a-f0-9]{40,64}$/.test(saved.content?.sha || ""))
        fail(
          502,
          "ADVENTURE_UNCONFIRMED",
          "저장 응답을 확인하지 못했어요. 같은 요청으로 재시도하세요.",
        );
      return json({
        data: adventureView(s, actor),
        notice,
        replayed: false,
        runId: r.id,
      });
    } catch (e) {
      if (e.code !== "CONFLICT") throw e;
    }
  }
  fail(
    409,
    "ADVENTURE_BUSY",
    "공동 작업을 반영 중이에요. 같은 요청으로 다시 저장하세요.",
  );
}
