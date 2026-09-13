import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.mjs";
import { fixture } from "./fixture.mjs";
import { emptyState, normalize } from "../site/model.mjs";
import {
  GAMES,
  evaluate,
  createSim,
  stepSim,
  attackTimes,
  puzzle,
  memoryInfo,
  sequence,
  progress,
  periodKeys,
  rankRows,
} from "../site/game-rules.mjs";
const origin = "https://theme-sa.test";
function team() {
  const s = emptyState();
  s.members = ["a", "b", "c"].map((id, i) => ({
    id,
    name: "가상 훈련원 " + (i + 1),
    abilities: [],
    createdAt: null,
    stats: [100, 100, 100, 100, 100, 100],
  }));
  s.leaderId = "a";
  return normalize(s);
}
function request(path, method = "GET", body, cookie) {
  return new Request(origin + "/api/" + path, {
    method,
    headers: {
      ...(method === "POST"
        ? { Origin: origin, "Content-Type": "application/json" }
        : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
function solved(run) {
  if (run.game === "focus") return { duration: 7770, actions: [{ t: 7770 }] };
  if (run.game === "defense") {
    const times = attackTimes(run.seed, run.difficulty || 1);
    return { duration: times.at(-1) + 400, actions: times.map((t) => ({ t })) };
  }
  if (run.game === "sense")
    return {
      duration: 4000,
      actions: Array.from({ length: 20 }, (_, i) => ({
        t: (i + 1) * 200,
        index: puzzle(run.seed, i, run.difficulty || 1).target,
      })),
    };
  if (["purify", "coop"].includes(run.game)) {
    const actions = [];
    let info = memoryInfo(run, actions);
    while (!info.complete) {
      const t = info.watchUntil + 200 + info.index * 100;
      actions.push({ t, index: info.seq[info.index] });
      info = memoryInfo(run, actions);
    }
    return { duration: actions.at(-1).t, actions };
  }
  const s = createSim(run),
    actions = [];
  while (!s.ended) {
    const target = {
      x: Math.round(240 + 175 * Math.cos(s.t / 1300)),
      y: Math.round(240 + 175 * Math.sin(s.t / 1300)),
    };
    if (s.t % 100 === 0) actions.push({ t: s.t, ...target });
    stepSim(s, actions.at(-1) || { x: 240, y: 240 });
  }
  return { duration: s.t, actions };
}
test("all seven game rules replay deterministically and training starts at zero independently of editable stats", () => {
  for (const game of Object.keys(GAMES)) {
    const run = {
      game,
      mode: GAMES[game].modes[0][0],
      seed: 123456,
      levels: [0, 0, 0, 0, 0, 0],
      stage: 0,
    };
    const body = solved(run),
      one = evaluate(run, body);
    assert.deepEqual(evaluate(run, body), one);
    assert(one.score >= 0);
    assert.throws(() =>
      evaluate(run, { ...body, duration: 1, actions: [{ t: 999999 }] }),
    );
  }
  assert.equal(progress(0).level, 0);
  assert.equal(progress(59).level, 0);
  assert.equal(progress(60).level, 1);
  assert.equal(progress(3975).level, 30);
  const monday = periodKeys(Date.parse("2026-09-13T15:01:00Z"));
  assert.equal(monday.day, "2026-09-14");
  assert.equal(monday.week, "2026-09-14");
});
test("authenticated signed runs, server XP, exact replay protection, separate file and no archive overwrite", async (t) => {
  const f = fixture(team()),
    originalFetch = globalThis.fetch,
    realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  globalThis.fetch = f.fetcher;
  t.after(() => {
    globalThis.fetch = originalFetch;
    Date.now = realNow;
  });
  const archiveBefore = f.files.get("data/team.json").content;
  const send = async (path, method, body, cookie) =>
    worker.fetch(request(path, method, body, cookie), f.env);
  assert.equal((await send("training", "GET")).status, 401);
  let r = await send("login", "POST", { password: f.env.SITE_PASSWORD });
  const cookie = r.headers.get("Set-Cookie").split(";")[0];
  r = await send("training", "GET", null, cookie);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).profiles.length, 0);
  assert.equal(f.files.size, 1);
  async function start(
    game = "focus",
    mode = GAMES[game].modes[0][0],
    memberId = "a",
    extra = {},
  ) {
    const r = await send(
      "training/start",
      "POST",
      {
        rules: 1,
        difficulty: 2,
        game,
        mode,
        memberId,
        control: "pc",
        ...extra,
      },
      cookie,
    );
    assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
    return r.json();
  }
  let session = await start("survival", "growth");
  assert.deepEqual(session.run.levels, [0, 0, 0, 0, 0, 0]);
  session = await start();
  const solvedRun = solved(session.run);
  r = await send(
    "training/finish",
    "POST",
    { token: session.token, ...solvedRun, xp: 999999 },
    cookie,
  );
  assert.equal(r.status, 400, "Cannot finish before real elapsed duration");
  clock += 8000;
  r = await send(
    "training/finish",
    "POST",
    { token: session.token, ...solvedRun, xp: 999999 },
    cookie,
  );
  assert.equal(r.status, 200);
  const result = await r.json();
  assert.equal(result.awards[0].xp, 15);
  assert.equal(result.xp[0], 15);
  r = await send(
    "training/finish",
    "POST",
    { token: session.token, ...solvedRun },
    cookie,
  );
  assert.equal((await r.json()).replayed, true);
  assert.equal(f.files.get("data/team.json").content, archiveBefore);
  assert(f.files.has("data/team.json.training.json"));
  let overview = await (await send("training", "GET", null, cookie)).json();
  assert.equal(overview.profiles[0].xp[0], 15);
  assert.equal(
    rankRows(
      overview,
      team().members,
      "focus",
      "visible",
      "pc",
      "all",
      undefined,
      2,
    )[0].rank,
    1,
  );
  r = await send(
    "training/finish",
    "POST",
    { token: session.token + "x", ...solvedRun },
    cookie,
  );
  assert.equal(r.status, 401);
  r = await send(
    "training/start",
    "POST",
    {
      rules: 1,
      difficulty: 2,
      game: "focus",
      mode: "visible",
      memberId: "missing",
      control: "pc",
    },
    cookie,
  );
  assert.equal(r.status, 400);
  // Simulate independent writers reading the same SHA. The second save retries from latest state.
  const first = await start("sense"),
    second = await start("defense", undefined, "b");
  clock += 40000;
  const outcomes = await Promise.all([
    send(
      "training/finish",
      "POST",
      { token: first.token, ...solved(first.run) },
      cookie,
    ),
    send(
      "training/finish",
      "POST",
      { token: second.token, ...solved(second.run) },
      cookie,
    ),
  ]);
  assert(outcomes.every((r) => r.status === 200));
  overview = await (await send("training", "GET", null, cookie)).json();
  assert(overview.profiles.find((p) => p.memberId === "a").xp[3] > 0);
  assert(overview.profiles.find((p) => p.memberId === "b").xp[2] > 0);
  for (let i = 1; i < 12; i++) {
    const run = await start();
    clock += 8000;
    const response = await send(
      "training/finish",
      "POST",
      { token: run.token, ...solved(run.run) },
      cookie,
    );
    assert.equal(response.status, 200);
  }
  overview = await (await send("training", "GET", null, cookie)).json();
  assert.equal(
    overview.profiles.find((p) => p.memberId === "a").xp[0],
    110,
    "5 full + 5 half rewards only",
  );
  assert.equal(overview.profiles.find((p) => p.memberId === "a").counts[0], 12);
  assert.equal(f.files.get("data/team.json").content, archiveBefore);
});
test("three-profile relay pays cooperation XP once at completion, rejects repeat participation and preserves training on corruption", async (t) => {
  const f = fixture(team()),
    originalFetch = globalThis.fetch,
    realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  globalThis.fetch = f.fetcher;
  t.after(() => {
    globalThis.fetch = originalFetch;
    Date.now = realNow;
  });
  const send = (path, method, body, cookie) =>
    worker.fetch(request(path, method, body, cookie), f.env);
  const login = await send("login", "POST", { password: f.env.SITE_PASSWORD });
  const cookie = login.headers.get("Set-Cookie").split(";")[0];
  const created = await (
    await send("training/relay", "POST", {}, cookie)
  ).json();
  let last;
  for (const memberId of ["a", "b", "c"]) {
    const started = await send(
      "training/start",
      "POST",
      {
        rules: 1,
        difficulty: 2,
        game: "coop",
        mode: "relay",
        control: "touch",
        memberId,
        relayId: created.relay.id,
      },
      cookie,
    );
    assert.equal(started.status, 200);
    const run = await started.json(),
      body = solved(run.run);
    clock += body.duration + 1000;
    const finish = await send(
      "training/finish",
      "POST",
      { token: run.token, ...body },
      cookie,
    );
    assert.equal(finish.status, 200);
    last = await finish.json();
    if (memberId !== "c") assert.equal(last.awards.length, 0);
    if (memberId === "a")
      assert.equal(
        (
          await send(
            "training/start",
            "POST",
            {
              rules: 1,
              difficulty: 2,
              game: "coop",
              mode: "relay",
              control: "touch",
              memberId,
              relayId: created.relay.id,
            },
            cookie,
          )
        ).status,
        409,
      );
  }
  assert.equal(last.awards.length, 3);
  assert(last.awards.every((a) => a.xp === 15));
  const overview = await (await send("training", "GET", null, cookie)).json();
  assert(overview.profiles.every((p) => p.xp[5] === 15));
  assert(overview.relays[0].completedAt);
  f.put("data/team.json.training.json", "not json");
  assert.equal((await send("training", "GET", null, cookie)).status, 502);
  assert.equal(f.files.get("data/team.json.training.json").content, "not json");
});

async function gameHarness(
  t,
  initialClock = Date.parse("2026-09-12T02:00:00Z"),
) {
  const f = fixture(team()),
    oldFetch = globalThis.fetch,
    oldNow = Date.now;
  let clock = initialClock;
  globalThis.fetch = f.fetcher;
  Date.now = () => clock;
  t.after(() => {
    globalThis.fetch = oldFetch;
    Date.now = oldNow;
  });
  const send = (path, method = "GET", body, cookie) =>
    worker.fetch(request(path, method, body, cookie), f.env);
  const login = async () => {
    const r = await send("login", "POST", { password: f.env.SITE_PASSWORD });
    return r.headers.get("Set-Cookie").split(";")[0];
  };
  const cookie = await login();
  const start = async (
    game = "focus",
    mode = GAMES[game].modes[0][0],
    memberId = "a",
    extra = {},
  ) => {
    const r = await send(
      "training/start",
      "POST",
      {
        rules: 1,
        difficulty: 2,
        game,
        mode,
        control: "pc",
        memberId,
        ...extra,
      },
      cookie,
    );
    assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
    return r.json();
  };
  const finish = async (run) => {
    const body = solved(run.run);
    clock += body.duration + 100;
    return send(
      "training/finish",
      "POST",
      { token: run.token, ...body },
      cookie,
    );
  };
  return {
    f,
    send,
    login,
    cookie,
    start,
    finish,
    now: () => clock,
    advance: (ms) => (clock += ms),
    set: (ms) => (clock = ms),
    overview: async () => (await send("training", "GET", null, cookie)).json(),
  };
}

test("ranking ties match game metrics and trailing memory inputs are rejected", () => {
  const members = team().members;
  for (const game of ["focus", "defense", "purify"]) {
    const key = [game, GAMES[game].modes[0][0], "pc"].join(":");
    const data = {
      profiles: members.map((m, i) => ({
        memberId: m.id,
        bests: [
          {
            key,
            period: "all",
            score: 100,
            duration: 7700 + i * 100,
            metric: 7,
            at: "2026-09-12T00:00:00Z",
          },
        ],
      })),
    };
    assert.deepEqual(
      rankRows(data, members, game, GAMES[game].modes[0][0], "pc").map(
        (r) => r.rank,
      ),
      [1, 1, 1],
    );
  }
  const run = { game: "purify", mode: "standard", seed: 123, stage: 0 };
  const body = solved(run);
  assert.throws(() =>
    evaluate(run, {
      ...body,
      actions: [...body.actions, { t: body.duration, index: 0 }],
    }),
  );
});

test("concurrent same-token finishes, session binding and exact expiry cannot duplicate awards", async (t) => {
  const h = await gameHarness(t),
    run = await h.start();
  h.advance(8000);
  const body = { token: run.token, ...solved(run.run) };
  const results = await Promise.all([
    h.send("training/finish", "POST", body, h.cookie),
    h.send("training/finish", "POST", body, h.cookie),
  ]);
  assert(results.every((r) => r.status === 200));
  const values = await Promise.all(results.map((r) => r.json()));
  assert.equal(values.filter((v) => v.replayed).length, 1);
  assert(values.every((v) => v.overview.profiles[0].xp[0] === 15));
  assert.equal((await h.overview()).profiles[0].xp[0], 15);
  const otherCookie = await h.login();
  assert.equal(
    (await h.send("training/finish", "POST", body, otherCookie)).status,
    401,
  );
  h.set(run.run.expires);
  assert.equal(
    (await h.send("training/finish", "POST", body, h.cookie)).status,
    401,
  );
  assert.equal((await h.overview()).profiles[0].xp[0], 15);
  assert.equal(
    (
      await h.send(
        "training/start",
        "POST",
        {
          rules: 1,
          difficulty: 2,
          game: "constructor",
          mode: "standard",
          memberId: "a",
          control: "pc",
        },
        h.cookie,
      )
    ).status,
    400,
  );
});

test("KST day/week rollover preserves XP, signed growth uses only stored training, and corruption is never reset", async (t) => {
  const h = await gameHarness(t, Date.parse("2026-09-13T14:50:00Z"));
  for (let i = 0; i < 11; i++)
    assert.equal((await h.finish(await h.start())).status, 200);
  assert.equal((await h.overview()).profiles[0].xp[0], 110);
  h.set(Date.parse("2026-09-13T15:00:00Z"));
  assert.equal((await h.finish(await h.start())).status, 200);
  let data = await h.overview();
  assert.equal(data.profiles[0].xp[0], 125);
  assert.equal(data.profiles[0].counts[0], 1);
  assert.equal(data.period.week, "2026-09-14");
  assert(
    data.profiles[0].bests.every((b) =>
      ["all", "2026-09-14"].includes(b.period),
    ),
  );
  const file = "data/team.json.training.json",
    store = JSON.parse(h.f.files.get(file).content);
  store.profiles[0].xp = [3975, 3975, 3975, 3975, 3975, 3975];
  h.f.put(file, JSON.stringify(store));
  assert.deepEqual(
    (await h.start("survival", "growth")).run.levels,
    [30, 30, 30, 30, 30, 30],
  );
  assert.deepEqual(
    (await h.start("survival", "fair")).run.levels,
    [0, 0, 0, 0, 0, 0],
  );
  assert.deepEqual((await h.start("agility")).run.levels, [0, 0, 0, 0, 0, 0]);
  assert.equal(
    (await (await h.finish(await h.start())).json()).awards[0].xp,
    0,
  );
  const broken = JSON.parse(h.f.files.get(file).content);
  broken.profiles[0].coopWeekly = -1;
  const bytes = JSON.stringify(broken);
  h.f.put(file, bytes);
  assert.equal((await h.send("training", "GET", null, h.cookie)).status, 502);
  assert.equal((await h.finish(await h.start())).status, 502);
  assert.equal(h.f.files.get(file).content, bytes);
});

test("relay simultaneous stage conflict, per-control contribution and practice isolation", async (t) => {
  const h = await gameHarness(t);
  const create = async () =>
    (await (await h.send("training/relay", "POST", {}, h.cookie)).json()).relay;
  let relay = await create();
  const a = await h.start("coop", "relay", "a", { relayId: relay.id }),
    b = await h.start("coop", "relay", "b", { relayId: relay.id });
  h.advance(10000);
  const results = await Promise.all([
    h.send(
      "training/finish",
      "POST",
      { token: a.token, ...solved(a.run) },
      h.cookie,
    ),
    h.send(
      "training/finish",
      "POST",
      { token: b.token, ...solved(b.run) },
      h.cookie,
    ),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  let data = await h.overview(),
    first = data.relays[0].steps[0].memberId;
  for (const id of ["a", "b", "c"].filter((id) => id !== first))
    assert.equal(
      (
        await h.finish(
          await h.start("coop", "relay", id, { relayId: relay.id }),
        )
      ).status,
      200,
    );
  relay = await create();
  for (const id of ["a", "b", "c"])
    assert.equal(
      (
        await h.finish(
          await h.start("coop", "relay", id, {
            relayId: relay.id,
            control: "touch",
          }),
        )
      ).status,
      200,
    );
  data = await h.overview();
  for (const p of data.profiles) {
    assert.equal(p.coop, 2);
    assert.equal(p.xp[5], 30);
    assert.equal(
      p.bests.find((b) => b.key === "coop:relay:pc:v2" && b.period === "all")
        .score,
      1,
    );
    assert.equal(
      p.bests.find((b) => b.key === "coop:relay:touch:v2" && b.period === "all")
        .score,
      1,
    );
  }
  const practice = await (
    await h.finish(await h.start("coop", "practice"))
  ).json();
  assert.equal(practice.awards.length, 0);
  assert.equal(
    (await h.overview()).profiles.find((p) => p.memberId === "a").xp[5],
    30,
  );
});

test("unexpired receipt capacity fails closed without evicting proofs or changing the archive", async (t) => {
  const h = await gameHarness(t);
  const run = await h.start();
  const response = {
    result: {
      score: 0,
      metric: 0,
      duration: 1,
      cleared: 0,
      eligible: false,
      detail: "",
    },
    awards: [],
    note: "",
    levels: [0, 0, 0, 0, 0, 0],
    xp: [0, 0, 0, 0, 0, 0],
    replayed: false,
  };
  const store = {
    version: 1,
    rules: 1,
    difficulty: 2,
    profiles: [],
    receipts: Array.from({ length: 2000 }, (_, i) => ({
      id: "held-" + i,
      expires: h.now() + 900000,
      response,
    })),
    relays: [],
    recent: [],
    updatedAt: null,
  };
  const file = "data/team.json.training.json",
    bytes = JSON.stringify(store);
  assert(Buffer.byteLength(bytes) < 880000);
  h.f.put(file, bytes);
  assert.equal((await h.finish(run)).status, 429);
  assert.equal(h.f.files.get(file).content, bytes);
  assert.equal(JSON.parse(h.f.files.get(file).content).receipts.length, 2000);
});
