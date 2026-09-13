import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.mjs";
import { fixture } from "./fixture.mjs";
import { normalize, emptyState } from "../site/model.mjs";
import { emptyParty, validateParty } from "./party.mjs";
import {
  bracket,
  ladder,
  traceLadder,
  teams,
  shuffle,
  randomInt,
  validateCup,
  validatePreset,
  checkJPEG,
} from "../site/party-rules.mjs";
const makeCup = (n = 64) => ({
  version: 1,
  title: "가상 월드컵",
  description: "synthetic only",
  candidates: Array.from({ length: n }, (_, i) => ({
    id: "c" + i,
    name: "후보 " + i,
    image: "",
  })),
});
const preset = () => ({
  title: "가상 설정",
  game: "ladder",
  entries: ["a", "b"],
  outcomes: ["yes", "no"],
  teams: 2,
  dice: 2,
  min: 8,
  max: 25,
});
async function harness(t) {
  const state = emptyState();
  state.members = ["a", "b", "c"].map((id) => ({
    id,
    name: id,
    stats: [50, 50, 50, 50, 50, 50],
    abilities: [],
  }));
  state.leaderId = "a";
  const f = fixture(normalize(state)),
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
  const body = (action, extra = {}, memberId = "a") => ({
    version: 1,
    memberId,
    opId: crypto.randomUUID(),
    issuedAt: Date.now(),
    action,
    ...extra,
  });
  const post = async (b) => {
    const r = await req("party", "POST", b, cookie);
    return { status: r.status, ...(await r.json()) };
  };
  const get = async (suffix) => {
    const r = await req("party" + (suffix || ""), "GET", null, cookie);
    return { status: r.status, ...(await r.json()) };
  };
  return { f, req, cookie, body, post, get };
}
test("party: no anonymous/foreign-origin access; absent store read does not initialize; existing records unchanged", async (t) => {
  const h = await harness(t),
    before = structuredClone([...h.f.files]);
  assert.equal((await h.req("party")).status, 401);
  assert.equal((await h.req("party?cup=" + "a".repeat(64))).status, 401);
  assert.equal((await h.get()).version, 1);
  assert.deepEqual([...h.f.files], before);
  const r = await worker.fetch(
    new Request("https://theme-sa.test/api/party", {
      method: "POST",
      headers: {
        Cookie: h.cookie,
        Origin: "https://evil.test",
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
    h.f.env,
  );
  assert.equal(r.status, 403);
  assert.equal(
    (
      await h.post(
        h.body("cupSave", { id: "cup1", rev: null, cup: makeCup() }, "missing"),
      )
    ).status,
    400,
  );
});
test("party: shared 64 candidates publish; immutable snapshots, exact replay, conflict and revisions", async (t) => {
  const h = await harness(t),
    before = h.f.files.get("data/team.json").sha;
  const b = h.body("cupSave", { id: "cup1", rev: null, cup: makeCup() });
  const r = await h.post(b);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.data.cups[0].count, 64);
  const hash = r.data.cups[0].hash;
  assert.equal((await h.get("?cup=" + hash)).cup.candidates.length, 64);
  const repeat = await h.post(b);
  assert(repeat.replayed);
  assert.equal(repeat.data.published, 1);
  assert.equal((await h.post({ ...b, cup: makeCup(32) })).status, 400);
  const v = makeCup(32);
  v.title = "새 제목";
  const revised = await h.post(
    h.body("cupSave", { id: "cup1", rev: 1, cup: v }, "b"),
  );
  assert.equal(revised.status, 200);
  assert.equal(revised.data.cups[0].owner, "a");
  assert.equal(
    (await h.post(h.body("cupSave", { id: "cup1", rev: 1, cup: v }))).status,
    409,
  );
  assert.equal((await h.get("?cup=" + hash)).cup.candidates.length, 64);
  assert.equal(h.f.files.get("data/team.json").sha, before);
});
test("party: complete all 63 choices; stable 64→32→16→8→4→2→1 bracket; cloud checkpoint and per-actor views", async (t) => {
  const h = await harness(t);
  await h.post(h.body("cupSave", { id: "cup", rev: null, cup: makeCup() }));
  const start = await h.post(
    h.body("start", { id: "run", cupId: "cup", size: 64 }),
  );
  assert.equal(start.status, 200, JSON.stringify(start));
  let run = start.data.runs[0];
  assert.equal(new Set(run.order).size, 64);
  assert.equal(
    (
      await h.post(
        h.body("checkpoint", { id: "run", rev: 0, picks: ["unknown"] }),
      )
    ).status,
    400,
  );
  assert.equal(
    (await h.post(h.body("checkpoint", { id: "run", rev: 0, picks: [] }, "b")))
      .status,
    400,
  );
  const phases = [];
  for (let i = 0; i < 63; i++) {
    const old = bracket(run.order, run.picks);
    run.picks.push(old.pair[0]);
    const next = bracket(run.order, run.picks);
    if (next.size !== old.size) {
      phases.push(old.size);
      const s = await h.post(
        h.body("checkpoint", { id: "run", rev: run.rev, picks: run.picks }),
      );
      assert.equal(s.status, 200, JSON.stringify(s));
      run = s.data.runs[0];
    }
  }
  assert.deepEqual(phases, [64, 32, 16, 8, 4, 2]);
  assert(bracket(run.order, run.picks).champion);
  assert.equal(run.rev, 6);
  assert.equal((await h.get("?actor=b")).runs.length, 0);
  assert.equal((await h.get("?actor=a")).runs[0].picks.length, 63);
  assert.equal(
    (
      await h.post(
        h.body("checkpoint", { id: "run", rev: 5, picks: run.picks }),
      )
    ).status,
    409,
  );
  assert.equal(
    (await h.post(h.body("checkpoint", { id: "run", rev: 6, picks: [] })))
      .status,
    400,
  );
  validateParty(JSON.parse(h.f.files.get("data/team.json.party.json").content));
});
test("party: active run survives edit/removal, explicit discard, presets shared and deleting only selected records", async (t) => {
  const h = await harness(t);
  await h.post(h.body("cupSave", { id: "cup", rev: null, cup: makeCup() }));
  let r = await h.post(h.body("start", { id: "run", cupId: "cup", size: 32 }));
  const hash = r.data.runs[0].hash;
  await h.post(h.body("cupSave", { id: "cup", rev: 1, cup: makeCup(2) }));
  await h.post(h.body("cupDelete", { id: "cup", rev: 2 }, "b"));
  assert.equal((await h.get("?cup=" + hash)).cup.candidates.length, 64);
  assert.equal(
    (await h.post(h.body("start", { id: "new", cupId: "cup", size: 2 })))
      .status,
    400,
  );
  r = await h.post(
    h.body("presetSave", { id: "p1", rev: null, config: preset() }),
  );
  assert.equal(r.status, 200);
  assert.equal((await h.get("?actor=b")).presets.length, 1);
  assert.equal(
    (
      await h.post(
        h.body("presetSave", { id: "p1", rev: null, config: preset() }),
      )
    ).status,
    409,
  );
  assert.equal(
    (await h.post(h.body("presetDelete", { id: "p1", rev: 1 }, "b"))).data
      .presets.length,
    0,
  );
  assert.equal(
    (await h.post(h.body("runDelete", { id: "run", rev: 0 }))).data.runs.length,
    0,
  );
});
test("party: corrupt store, oversized/unsafe image, quotas and upstream denial preserve data", async (t) => {
  const h = await harness(t),
    b = h.body("cupSave", { id: "c", rev: null, cup: makeCup(2) });
  for (const image of [
    "https://evil.test/x.jpg",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/jpeg;base64," + "A".repeat(12000),
    "data:image/jpeg;base64,/9j/2Q==",
  ]) {
    const c = makeCup(2);
    c.candidates[0].image = image;
    assert.equal(
      (await h.post(h.body("cupSave", { id: "c", rev: null, cup: c }))).status,
      400,
    );
  }
  assert(!checkJPEG("data:image/png;base64,AA=="));
  assert.throws(() => validateCup(makeCup(65)));
  h.f.put("data/team.json.party.json", '{"version":999}');
  const bad = h.f.files.get("data/team.json.party.json").sha;
  assert.equal((await h.post(b)).status, 502);
  assert.equal(h.f.files.get("data/team.json.party.json").sha, bad);
  const s = emptyParty();
  s.published = 240;
  h.f.put("data/team.json.party.json", JSON.stringify(s));
  assert.equal((await h.post(b)).status, 400);
  h.f.files.delete("data/team.json.party.json");
  h.f.setReadOnly(true);
  assert.equal((await h.post(b)).status, 503);
  assert(!h.f.files.has("data/team.json.party.json"));
});
test("party: transport ambiguity retries without duplicates and SHA conflict retry preserves other updates", async (t) => {
  const h = await harness(t);
  let once = true;
  globalThis.fetch = async (u, o) => {
    const r = await h.f.fetcher(u, o);
    if (
      once &&
      o?.method === "PUT" &&
      new URL(u).pathname.endsWith(".party.json")
    ) {
      once = false;
      throw Error("lost success response");
    }
    return r;
  };
  const b = h.body("presetSave", { id: "p1", rev: null, config: preset() });
  assert.equal((await h.post(b)).status, 502);
  const replay = await h.post(b);
  assert.equal(replay.status, 200);
  assert(replay.replayed);
  assert.equal(replay.data.presets.length, 1);
  let conflict = true;
  globalThis.fetch = async (u, o) => {
    if (
      conflict &&
      o?.method === "PUT" &&
      new URL(u).pathname.endsWith(".party.json")
    ) {
      conflict = false;
      const s = JSON.parse(h.f.files.get("data/team.json.party.json").content);
      s.presets.push({ id: "other", owner: "b", rev: 1, config: preset() });
      h.f.put("data/team.json.party.json", JSON.stringify(s));
    }
    return h.f.fetcher(u, o);
  };
  const merged = await h.post(
    h.body("presetSave", { id: "p2", rev: null, config: preset() }),
  );
  assert.equal(merged.status, 200);
  assert.equal(merged.data.presets.length, 3);
});
test("party rules: 1000 real ladder bijections, balanced teams, validated presets and unbiased bounded random", () => {
  for (let k = 0; k < 1000; k++) {
    const n = 2 + (k % 11),
      l = ladder(n);
    assert.equal(new Set(l.results).size, n);
    for (let i = 0; i < n; i++)
      assert.equal(traceLadder(n, l.rungs, i).at(-1)[0], l.results[i]);
  }
  for (let n = 2; n <= 64; n++) {
    const list = Array.from({ length: n }, (_, i) => "" + i);
    assert.deepEqual(shuffle(list).sort(), [...list].sort());
    for (const count of [2, Math.min(n, 16)]) {
      const t = teams(list, count),
        sizes = t.map((x) => x.length);
      assert(Math.max(...sizes) - Math.min(...sizes) <= 1);
      assert.equal(new Set(t.flat().map((x) => x.index)).size, n);
    }
  }
  for (let i = 0; i < 1000; i++) {
    const n = 1 + (i % 64);
    assert(randomInt(n) >= 0 && randomInt(n) < n);
  }
  assert.throws(() => randomInt(0));
  assert.throws(() => validatePreset({ ...preset(), game: "no" }));
  assert.throws(() => validatePreset({ ...preset(), outcomes: [] }));
  assert.throws(() =>
    validatePreset({ ...preset(), game: "coin", entries: ["a", "b", "c"] }),
  );
});

test("party: missing or malformed PUT acknowledgments never claim success", async (t) => {
  const h = await harness(t);
  const b = h.body("cupSave", { id: "c", rev: null, cup: makeCup(2) });
  globalThis.fetch = async (u, o) =>
    o?.method === "PUT"
      ? new Response("{}", {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      : h.f.fetcher(u, o);
  assert.equal((await h.post(b)).status, 502);
  assert(!h.f.files.has("data/team.json.party.json"));
  globalThis.fetch = async (u, o) => {
    const r = await h.f.fetcher(u, o);
    if (o?.method === "PUT" && new URL(u).pathname.endsWith(".party.json"))
      return new Response("{}", {
        headers: { "Content-Type": "application/json" },
      });
    return r;
  };
  assert.equal((await h.post(b)).status, 502);
  assert.equal((await h.post(b)).replayed, true);
});
