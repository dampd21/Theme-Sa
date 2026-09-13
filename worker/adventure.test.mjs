import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.mjs";
import { fixture } from "./fixture.mjs";
import { emptyState, normalize } from "../site/model.mjs";
import { validateAdventure } from "./adventure.mjs";
import { CASES } from "../site/adventure-rules.mjs";
import {
  guardWindow,
  memoryBeat,
  createSim,
  stepSim,
  boardKey,
  rankRows,
} from "../site/game-rules.mjs";
const answers = {
  train: ["star-ship-bell", "west-flower", "promise-third"],
  library: ["moon-wave-bird"],
  theater: ["goodbye"],
  market: ["blank"],
  observatory: ["north-stop"],
  inn: ["hello-key"],
};
async function harness(t) {
  const state = emptyState();
  state.members = ["a", "b", "c"].map((id) => ({
    id,
    name: "가상 " + id,
    stats: [100, 100, 100, 100, 100, 100],
    abilities: [],
    createdAt: null,
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
        body: body ? JSON.stringify(body) : undefined,
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
    const r = await req("adventure", "POST", b, cookie);
    return { status: r.status, ...(await r.json()) };
  };
  const get = async (actor = "a") => {
    const r = await req("adventure?actor=" + actor, "GET", null, cookie);
    return { status: r.status, ...(await r.json()) };
  };
  const start = async (campaign = "train", mode = "solo") => {
    const r = await post(
      body("create", {
        campaign,
        mode,
        gear: ["lantern", "letter", "compass"],
      }),
    );
    assert.equal(r.status, 200, JSON.stringify(r));
    return r.runId;
  };
  const act = async (id, action, extra = {}, actor = "a") => {
    const r = await post(body(action, { runId: id, ...extra }, actor));
    assert.equal(r.status, 200, JSON.stringify(r));
    return r;
  };
  return { f, req, cookie, body, post, get, start, act };
}
async function solve(h, id, campaign = "train", actor = "a") {
  for (let i = 0; i < CASES[campaign].stages.length; i++) {
    const base = i * 3 + 1;
    await h.act(id, "move", { from: 0, to: base }, actor);
    for (const side of [1, 2]) {
      await h.act(id, "move", { from: base, to: base + side }, actor);
      await h.act(id, "inspect", { from: base + side }, actor);
      await h.act(id, "move", { from: base + side, to: base }, actor);
    }
    await h.act(
      id,
      "solve",
      { from: base, answer: answers[campaign][i] },
      actor,
    );
    await h.act(id, "move", { from: base, to: 0 }, actor);
  }
}
test("adventure auth, no read initialization, exact duplicate creation and original files untouched", async (t) => {
  const h = await harness(t),
    before = h.f.files.get("data/team.json").content;
  assert.equal((await h.req("adventure")).status, 401);
  assert.deepEqual((await h.get()).runs, []);
  assert.equal(h.f.files.size, 1);
  const b = h.body("create", {
    campaign: "train",
    mode: "solo",
    gear: ["lantern", "bell", "thread"],
  });
  const r = await Promise.all([h.post(b), h.post(b)]);
  assert(r.every((x) => x.status === 200));
  assert.equal(r.filter((x) => x.replayed).length, 1);
  assert.equal((await h.get()).runs.length, 1);
  assert.equal(h.f.files.get("data/team.json").content, before);
  assert(!h.f.files.has("data/team.json.training.json"));
  assert(!h.f.files.has("data/team.json.room.json"));
  assert.equal(
    (await h.post({ ...b, opId: crypto.randomUUID(), memberId: "missing" }))
      .status,
    400,
  );
});
test("complete solo train, enforce travel/clues/answers, hints and three stations to an ending", async (t) => {
  const h = await harness(t),
    id = await h.start();
  assert.equal(
    (await h.post(h.body("move", { runId: id, from: 0, to: 7 }))).status,
    409,
  );
  await h.act(id, "move", { from: 0, to: 1 });
  assert.equal(
    (
      await h.post(
        h.body("solve", { runId: id, from: 1, answer: answers.train[0] }),
      )
    ).status,
    400,
  );
  await h.act(id, "hint");
  let r = (await h.get()).runs[0];
  assert.equal(r.hints[0].level, 2);
  await h.act(id, "move", { from: 1, to: 0 });
  await solve(h, id);
  await h.act(id, "vote", { choice: "release" });
  r = (await h.get()).runs[0];
  assert.equal(r.status, "returned");
  assert.equal(r.solved.length, 3);
  assert.equal(r.found.length, 6);
  assert.equal(r.ending, "release");
  assert.equal(
    (await h.post(h.body("move", { runId: id, from: 0, to: 1 }))).status,
    400,
  );
  validateAdventure(
    JSON.parse(h.f.files.get("data/team.json.adventure.json").content),
  );
});
test("all five short adventures have solvable independent endings and notes", async (t) => {
  const h = await harness(t);
  for (const c of Object.keys(CASES).filter((c) => c !== "train")) {
    const id = await h.start(c);
    await h.act(id, "note", { text: "<img src=x onerror=alert(1)> 가상 메모" });
    await solve(h, id, c);
    await h.act(id, "vote", { choice: "restore" });
    const r = (await h.get()).runs.find((r) => r.id === id);
    assert.equal(r.ending, "restore");
    assert.equal(r.notes.length, 1);
    assert.equal(r.solved.length, 1);
  }
  assert.equal((await h.get()).runs.length, 5);
});
test("shared concurrent positions merge, solo view stays profile scoped, voting requires majority", async (t) => {
  const h = await harness(t),
    solo = await h.start("inn"),
    id = await h.start("library", "shared");
  assert(!(await h.get("b")).runs.some((r) => r.id === solo));
  assert.equal(
    (await h.post(h.body("note", { runId: solo, text: "x" }, "b"))).status,
    403,
  );
  await h.act(id, "join", { gear: ["bell", "mirror", "thread"] }, "b");
  const rs = await Promise.all(
    ["a", "b"].map((m) =>
      h.post(h.body("move", { runId: id, from: 0, to: 1 }, m)),
    ),
  );
  assert(rs.every((r) => r.status === 200));
  let r = (await h.get()).runs.find((r) => r.id === id);
  assert(r.party.every((p) => p.at === 1));
  await h.act(id, "move", { from: 1, to: 0 });
  await solve(h, id, "library");
  await h.act(id, "vote", { choice: "keep" });
  assert.equal((await h.get()).runs.find((r) => r.id === id).status, "active");
  await h.act(id, "vote", { choice: "keep" }, "b");
  assert.equal(
    (await h.get()).runs.find((r) => r.id === id).status,
    "returned",
  );
});
test("lost response replay, safe early return, owner cleanup and corrupt stores fail closed", async (t) => {
  const h = await harness(t),
    id = await h.start("market");
  const b = h.body("note", { runId: id, text: "단서 보존" });
  await h.post(b);
  const again = await h.post(b);
  assert(again.replayed);
  assert.equal((await h.get()).runs[0].notes.length, 1);
  await h.act(id, "leave");
  assert.equal((await h.get()).runs[0].ending, "abort");
  await h.act(id, "archive");
  assert.equal((await h.get()).runs.length, 0);
  const path = "data/team.json.adventure.json";
  h.f.put(path, '{"version":1,"runs":[null],"receipts":[]}');
  const before = h.f.files.get(path).content;
  assert.equal((await h.get()).status, 502);
  assert.equal(h.f.files.get(path).content, before);
});
test("escalating difficulty has faster threats, shrinking defense windows and memory beats; legacy ranks remain separate", () => {
  assert(guardWindow(19).hit < guardWindow(0).hit);
  assert(memoryBeat(10) < memoryBeat(3));
  const metrics = [];
  for (const difficulty of [1, 2]) {
    const s = createSim({
      game: "survival",
      mode: "fair",
      seed: 8,
      difficulty,
    });
    s.p.hp = 999;
    s.p.maxHp = 999;
    let late = 0;
    while (s.t < 100000) {
      stepSim(s);
      late = Math.max(late, ...s.enemies.map((e) => e.speed));
    }
    metrics.push(late);
  }
  assert(metrics[1] > metrics[0] * 1.5);
  assert.equal(
    boardKey({ game: "focus", mode: "visible", control: "pc" }),
    "focus:visible:pc",
  );
  assert.equal(
    boardKey({ game: "focus", mode: "visible", control: "pc", difficulty: 2 }),
    "focus:visible:pc:v2",
  );
  const data = {
    profiles: [
      {
        memberId: "a",
        bests: [
          {
            key: "focus:visible:pc",
            period: "all",
            score: 99999,
            at: "2026-01-01",
          },
          {
            key: "focus:visible:pc:v2",
            period: "all",
            score: 90000,
            at: "2026-09-13",
          },
        ],
      },
    ],
  };
  assert.equal(
    rankRows(
      data,
      [{ id: "a", name: "a" }],
      "focus",
      "visible",
      "pc",
      "all",
      undefined,
      1,
    )[0].score,
    99999,
  );
  assert.equal(
    rankRows(
      data,
      [{ id: "a", name: "a" }],
      "focus",
      "visible",
      "pc",
      "all",
      undefined,
      2,
    )[0].score,
    90000,
  );
});

test("preparation unlocks real shortcuts without bypassing locked stations", async (t) => {
  const h = await harness(t),
    created = await h.post(
      h.body("create", {
        campaign: "train",
        mode: "solo",
        gear: ["mirror", "thread", "compass"],
      }),
    ),
    id = created.runId;
  assert.equal(created.status, 200);
  await h.act(id, "move", { from: 0, to: 1 });
  await h.act(id, "move", { from: 1, to: 2 });
  await h.act(id, "inspect", { from: 2 });
  await h.act(id, "move", { from: 2, to: 3 });
  await h.act(id, "inspect", { from: 3 });
  await h.act(id, "move", { from: 3, to: 0 });
  assert.equal(
    (await h.post(h.body("move", { runId: id, from: 0, to: 4 }))).status,
    409,
  );
  await h.act(id, "move", { from: 0, to: 1 });
  await h.act(id, "solve", { from: 1, answer: "star-ship-bell" });
  await h.act(id, "move", { from: 1, to: 4 });
  assert.equal((await h.get()).runs[0].party[0].at, 4);
  const before = h.f.files.get("data/team.json.adventure.json").content;
  h.f.setReadOnly(true);
  assert.notEqual(
    (await h.post(h.body("note", { runId: id, text: "저장 불가 검증" })))
      .status,
    200,
  );
  assert.equal(h.f.files.get("data/team.json.adventure.json").content, before);
});
