import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.mjs";
import { fixture } from "./fixture.mjs";
import { normalize, emptyState } from "../site/model.mjs";
import { emptyWorld, validateWorld, applyWorld, newProfile } from "./world.mjs";
import {
  PLACES,
  TIMES,
  MAIL,
  PLOT,
  GAME_INFO,
  LIAR,
} from "../site/world-content.mjs";
import { initialGame, gameStep, replayGame } from "../site/world-games.mjs";
import { solution } from "../tools/qa/world-solutions.mjs";
const quest = () => ({
  title: "가상 의뢰",
  place: "tea",
  intro: "단서를 살펴보세요.",
  clues: ["찻잔", "빈 주머니", "열쇠"],
  options: ["주인", "손님", "인형"],
  answer: 0,
  hints: ["하나", "둘", "셋"],
  success: "돌려줬어요.",
  failure: "다시 봐요.",
});
async function harness(t) {
  const s = emptyState();
  s.members = ["a", "b", "c"].map((id) => ({
    id,
    name: id,
    stats: [50, 50, 50, 50, 50, 50],
    abilities: [],
  }));
  s.leaderId = "a";
  const f = fixture(normalize(s)),
    original = globalThis.fetch;
  globalThis.fetch = f.fetcher;
  t.after(() => (globalThis.fetch = original));
  const req = (p, method = "GET", body, cookie) =>
    worker.fetch(
      new Request("https://theme-sa.test/api/" + p, {
        method,
        headers: {
          ...(body
            ? {
                Origin: "https://theme-sa.test",
                "Content-Type": "application/json",
              }
            : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      f.env,
    );
  const cookie = (
    await req("login", "POST", { password: f.env.SITE_PASSWORD })
  ).headers
    .get("set-cookie")
    .split(";")[0];
  const get = async (actor = "a") =>
    (await req("world?actor=" + actor, "GET", null, cookie)).json();
  const body = (action, rev, extra = {}, memberId = "a") => ({
    version: 1,
    memberId,
    rev,
    action,
    opId: crypto.randomUUID(),
    issuedAt: Date.now(),
    ...extra,
  });
  const post = async (b) => {
    const r = await req("world", "POST", b, cookie);
    return { status: r.status, ...(await r.json()) };
  };
  return { f, req, cookie, get, body, post };
}
test("world: authentication, absent read, protected storage, no existing file edits", async (t) => {
  const h = await harness(t),
    before = structuredClone([...h.f.files]);
  assert.equal((await h.req("world")).status, 401);
  assert.equal((await h.get()).profile.rev, 0);
  assert.deepEqual([...h.f.files], before);
  assert.equal(
    (
      await h.post(
        h.body("explore", 0, { place: "hall", time: "day" }, "missing"),
      )
    ).status,
    400,
  );
  const r = await h.post(h.body("explore", 0, { place: "hall", time: "day" }));
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.data.profile.clues.length, 1);
  assert.equal(h.f.files.get("data/team.json").sha, before[0][1].sha);
  validateWorld(JSON.parse(h.f.files.get("data/team.json.world.json").content));
});
test("world: all 24 clues, four branching letters, all four chapters and hidden rooms solo", async (t) => {
  const h = await harness(t);
  let rev = 0;
  const go = async (action, extra) => {
    const r = await h.post(h.body(action, rev, extra));
    assert.equal(r.status, 200, JSON.stringify(r));
    rev = r.data.profile.rev;
    return r.data;
  };
  for (const place of PLACES)
    for (const time of Object.keys(TIMES))
      await go("explore", { place: place.id, time });
  let d = await h.get();
  assert.equal(d.profile.clues.length, 24);
  assert.equal(d.barrier, 24);
  for (const m of MAIL) await go("mail", { mail: m.id, choice: 1 });
  for (const chapter of PLOT) await go("plot", { answer: chapter.answer ?? 2 });
  for (let i = 0; i < 4; i++) await go("plant");
  await go("radio", { dials: [3, 1, 4] });
  d = await h.get();
  assert.equal(d.profile.plot.length, 4);
  assert(d.profile.artifacts.includes("plot"));
  assert(d.profile.artifacts.includes("garden"));
  assert(d.profile.artifacts.includes("radio"));
  assert(d.events.length > 20);
});
test("world: every level of all seven games can finish by replay; invalid action and rewind rejected", () => {
  for (const type of Object.keys(GAME_INFO))
    for (let level = 0; level < 3; level++) {
      const a = solution(type, level, 321),
        run = { type, level, seed: 321, actions: a };
      assert.equal(replayGame(run).status, "won", type + level);
      assert.throws(() => gameStep(replayGame(run), {}));
    }
  assert.throws(() => gameStep(initialGame("stars"), { star: 11 }));
  assert.throws(() => gameStep(initialGame("tactics"), { move: "up" }));
  for (let seed = 1; seed <= 20; seed++)
    assert.equal(
      replayGame({
        type: "deck",
        level: seed % 3,
        seed,
        actions: solution("deck", seed % 3, seed),
      }).status,
      "won",
    );
});
test("world: logic rooms each have exactly one valid safe door", () => {
  const predicates = [
    [(d) => d === 0, (d) => d === 2, (d) => d !== 0 && d !== 1],
    [(d) => d === 1, (d) => d !== 2, (d) => d === 2],
    [(d) => d === 1, (d) => d !== 0, (d) => d === 2],
  ];
  LIAR.forEach((q, i) =>
    assert.deepEqual(
      [0, 1, 2].filter(
        (d) => predicates[i].filter((f) => f(d)).length === q.truth,
      ),
      [q.answer],
    ),
  );
});
test("world: game checkpoint, finish rewards dedupe, active resume and separate XP", async (t) => {
  const h = await harness(t),
    archive = h.f.files.get("data/team.json").sha;
  let d = (
    await h.post(
      h.body("gameStart", 0, {
        id: "game1",
        type: "tactics",
        level: 0,
        seed: 1,
      }),
    )
  ).data;
  const a = solution("tactics");
  d = (
    await h.post(
      h.body("gameSave", d.profile.rev, {
        id: "game1",
        actions: a.slice(0, 2),
      }),
    )
  ).data;
  assert.equal(d.profile.active.actions.length, 2);
  assert.equal(
    (
      await h.post(
        h.body("gameSave", d.profile.rev, { id: "game1", actions: [] }),
      )
    ).status,
    400,
  );
  const b = h.body("gameSave", d.profile.rev, { id: "game1", actions: a });
  const r = await h.post(b);
  assert.equal(r.status, 200);
  assert.equal(r.data.profile.active, null);
  assert(r.data.profile.artifacts.includes("tactics"));
  assert.equal((await h.post(b)).replayed, true);
  assert.equal(h.f.files.get("data/team.json").sha, archive);
  assert(!h.f.files.has("data/team.json.training.json"));
});
test("world: pets, timed errands, settings consent, gifts and gallery", () => {
  const s = emptyWorld(),
    members = new Set(["a", "b"]);
  let now = 100000;
  const go = (action, extra = {}) =>
    applyWorld(
      s,
      { memberId: "a", rev: s.profiles[0]?.rev || 0, action, ...extra },
      members,
      now,
    );
  go("pet", { kind: "fox", name: "모루 친구", color: "#b9d8a6", home: "창가" });
  go("care");
  assert.throws(() => go("care"));
  go("errand", { route: 1 });
  assert.throws(() => go("claim"));
  now += 60001;
  go("claim");
  assert(s.profiles[0].artifacts.includes("errand"));
  go("prefs", { prefs: { ghost: true, motion: true, eerie: false } });
  go("explore", { place: "river", time: "night" });
  assert.equal(s.traces.length, 1);
  go("prefs", { prefs: { ghost: false, motion: false, eerie: false } });
  assert.equal(s.traces.length, 0);
  go("seal", {
    name: "안전한 이름",
    symbol: "moon",
    color: "#b9d8a6",
    pattern: 2,
  });
  go("gift", { id: "gift1", to: "b" });
  assert.equal(s.gifts[0].seal.symbol, "moon");
  go("display", { items: ["errand"] });
  validateWorld(s);
});
test("world: asynchronous case, relay collision, authored user quests and prepublication playtest", async (t) => {
  const h = await harness(t);
  let rev = 0;
  for (let i = 0; i < 4; i++) {
    let r = await h.post(h.body("caseInspect", rev, { index: i }));
    rev = r.data.profile.rev;
    r = await h.post(h.body("caseShare", rev, { index: i }));
    rev = r.data.profile.rev;
  }
  let r = await h.post(h.body("caseSolve", 0, { answer: 1 }, "b"));
  assert.equal(r.status, 200);
  assert(r.data.profile.caseSolved);
  r = await h.post(
    h.body("relay", rev, {
      door: 1,
      note: "등불을 남겨요",
      tool: "mirror",
      relayRev: 0,
    }),
  );
  rev = r.data.profile.rev;
  assert.equal(r.data.relay.floor, 2);
  assert.equal(
    (
      await h.post(
        h.body(
          "relay",
          1,
          { door: 0, note: "", tool: "bell", relayRev: 0 },
          "b",
        ),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await h.post(
        h.body("questSave", rev, {
          id: "q",
          questRev: null,
          quest: quest(),
          proof: { seen: [], answer: 0 },
        }),
      )
    ).status,
    400,
  );
  r = await h.post(
    h.body("questSave", rev, {
      id: "q",
      questRev: null,
      quest: quest(),
      proof: { seen: [0, 1, 2], answer: 0 },
    }),
  );
  assert.equal(r.status, 200);
  assert.equal(
    (
      await h.post(
        h.body(
          "questSolve",
          1,
          { id: "q", questRev: 1, seen: [0, 1, 2], answer: 0 },
          "b",
        ),
      )
    ).status,
    200,
  );
});
test("world: exact replay, conflicting profile versions, corruption and missing upstream acknowledgment", async (t) => {
  const h = await harness(t);
  let lost = true;
  globalThis.fetch = async (u, o) => {
    const r = await h.f.fetcher(u, o);
    if (
      lost &&
      o?.method === "PUT" &&
      new URL(u).pathname.endsWith(".world.json")
    ) {
      lost = false;
      throw Error("lost response");
    }
    return r;
  };
  const b = h.body("explore", 0, { place: "hall", time: "day" });
  assert.equal((await h.post(b)).status, 502);
  const replay = await h.post(b);
  assert(replay.replayed);
  assert.equal(replay.data.profile.clues.length, 1);
  assert.equal(
    (await h.post(h.body("explore", 0, { place: "hall", time: "night" })))
      .status,
    409,
  );
  assert.equal((await h.post({ ...b, time: "night" })).status, 400);
  h.f.put("data/team.json.world.json", '{"version":999}');
  const before = h.f.files.get("data/team.json.world.json").sha;
  assert.equal(
    (await h.post(h.body("explore", 1, { place: "hall", time: "day" }))).status,
    502,
  );
  assert.equal(h.f.files.get("data/team.json.world.json").sha, before);
});

test("world: shared SHA retry preserves another profile and malformed success is retriable", async (t) => {
  const h = await harness(t);
  let inject = true;
  globalThis.fetch = async (u, o) => {
    if (
      inject &&
      o?.method === "PUT" &&
      new URL(u).pathname.endsWith(".world.json")
    ) {
      inject = false;
      const s = emptyWorld();
      applyWorld(
        s,
        {
          memberId: "b",
          rev: 0,
          action: "explore",
          place: "river",
          time: "night",
        },
        new Set(["a", "b"]),
      );
      h.f.put("data/team.json.world.json", JSON.stringify(s));
    }
    return h.f.fetcher(u, o);
  };
  let result = await h.post(
    h.body("explore", 0, { place: "hall", time: "day" }),
  );
  assert.equal(result.status, 200);
  assert.equal((await h.get("b")).profile.clues.length, 1);
  globalThis.fetch = async (u, o) => {
    const r = await h.f.fetcher(u, o);
    if (o?.method === "PUT")
      return new Response("{}", {
        headers: { "Content-Type": "application/json" },
      });
    return r;
  };
  const b = h.body("artifactNote", 1, {
    id: "note1",
    artifact: "appraisal",
    text: "친구들과 나눈 가상 감상",
  });
  result = await h.post(b);
  assert.equal(result.status, 502);
  result = await h.post(b);
  assert(result.replayed);
  assert.equal(result.data.artifactNotes.length, 1);
});
test("world: note ownership, duplicate gifts/notes and profile limit reject safely", async (t) => {
  const h = await harness(t);
  let r = await h.post(
    h.body("artifactNote", 0, {
      id: "note1",
      artifact: "appraisal",
      text: "나의 해석",
    }),
  );
  assert.equal(r.status, 200);
  assert.equal(
    (
      await h.post(
        h.body("artifactNote", 1, {
          id: "note1",
          artifact: "appraisal",
          text: "다른 문구",
        }),
      )
    ).status,
    400,
  );
  r = await h.post(h.body("artifactNoteDelete", 0, { id: "note1" }, "b"));
  assert.equal(r.status, 200);
  assert.equal(r.data.artifactNotes.length, 1);
  const s = emptyWorld();
  s.profiles = Array.from({ length: 80 }, (_, i) =>
    newProfile("synthetic-" + i),
  );
  h.f.put("data/team.json.world.json", JSON.stringify(s));
  const before = h.f.files.get("data/team.json.world.json").sha;
  assert.equal(
    (await h.post(h.body("explore", 0, { place: "hall", time: "day" }))).status,
    400,
  );
  assert.equal(h.f.files.get("data/team.json.world.json").sha, before);
});
