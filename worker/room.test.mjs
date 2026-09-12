import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.mjs";
import { fixture } from "./fixture.mjs";
import { emptyState, normalize } from "../site/model.mjs";
import { emptyRoom, validateRoom } from "./room.mjs";
import { zoneCells, fixedCell, mazePath, INK } from "../site/room-rules.mjs";
const origin = "https://theme-sa.test",
  roomFile = "data/team.json.room.json";
async function harness(t) {
  const s = emptyState();
  s.members = ["a", "b", "c"].map((id) => ({
    id,
    name: "가상 " + id,
    abilities: [],
    stats: [100, 100, 100, 100, 100, 100],
  }));
  s.leaderId = "a";
  const f = fixture(normalize(s)),
    old = globalThis.fetch;
  globalThis.fetch = f.fetcher;
  t.after(() => (globalThis.fetch = old));
  const req = (path, method = "GET", body, cookie) =>
    worker.fetch(
      new Request(origin + "/api/" + path, {
        method,
        headers: {
          ...(body
            ? { Origin: origin, "Content-Type": "application/json" }
            : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
      f.env,
    );
  const login = await req("login", "POST", { password: f.env.SITE_PASSWORD }),
    cookie = login.headers.get("set-cookie").split(";")[0];
  const send = (action, extra = {}, memberId = "a") => ({
    version: 1,
    opId: crypto.randomUUID(),
    issuedAt: Date.now(),
    memberId,
    action,
    ...extra,
  });
  const post = async (b) => {
    const r = await req("room", "POST", b, cookie);
    return { status: r.status, ...(await r.json()) };
  };
  return {
    f,
    req,
    cookie,
    send,
    post,
    get: async (actor = "a") =>
      (await req("room?actor=" + actor, "GET", null, cookie)).json(),
  };
}
const stroke = {
  color: INK[0],
  points: [
    [10, 10],
    [100, 100],
    [400, 200],
  ],
};
test("room authenticated reads never initialize, duplicate writes merge safely, archive and training are untouched", async (t) => {
  const h = await harness(t),
    archive = h.f.files.get("data/team.json").content;
  assert.equal((await h.req("room")).status, 401);
  assert.equal((await h.get()).caseId, 0);
  assert.equal(h.f.files.size, 1);
  const body = h.send("weather", { weather: "rain" });
  const r = await Promise.all([h.post(body), h.post(body)]);
  assert(r.every((v) => v.status === 200));
  assert.equal(r.filter((v) => v.replayed).length, 1);
  assert.equal((await h.get()).votes.length, 1);
  assert.equal(h.f.files.get("data/team.json").content, archive);
  assert(!h.f.files.has("data/team.json.training.json"));
  validateRoom(JSON.parse(h.f.files.get(roomFile).content));
  assert.equal(
    (await h.post({ ...body, opId: crypto.randomUUID(), memberId: "missing" }))
      .status,
    400,
  );
  assert.equal(
    (
      await h.post({
        ...body,
        opId: crypto.randomUUID(),
        issuedAt: Date.now() - 900001,
      })
    ).status,
    400,
  );
});
test("three mystery chapters require clues and keep discoveries and endings shared", async (t) => {
  const h = await harness(t);
  assert.equal(
    (await h.post(h.send("solve", { caseId: 0, answer: "welcome" }))).status,
    400,
  );
  for (const [caseId, answer] of ["welcome", "frame", "team"].entries()) {
    for (const source of ["window", "frame", "spirit"])
      assert.equal(
        (
          await h.post(
            h.send(
              "discover",
              { caseId, source },
              source === "frame" ? "b" : "a",
            ),
          )
        ).status,
        200,
      );
    const wrong = await h.post(h.send("solve", { caseId, answer: "wrong" }));
    assert.equal(wrong.data.caseId, caseId);
    const right = await h.post(h.send("solve", { caseId, answer }, "c"));
    assert.equal(right.data.caseId, caseId + 1);
    assert(right.notice.length > 10);
  }
  const d = await h.get();
  assert.equal(d.clues.length, 9);
  assert.equal(d.solved.length, 3);
  for (let i = 0; i < 3; i++)
    assert.equal((await h.post(h.send("clean"))).status, 200);
  assert.equal((await h.post(h.send("clean"))).status, 400);
  assert.equal((await h.get()).clean.length, 3);
});
test("word chains, shared repair and one-stroke turns validate input and reject stale boards", async (t) => {
  const h = await harness(t);
  let d = await h.get();
  let r = await h.post(
    h.send("word", {
      mode: "chain",
      boardId: d.chains.chain.id,
      turn: 0,
      word: "나무",
    }),
  );
  assert.equal(r.status, 200);
  assert.equal(
    (
      await h.post(
        h.send("word", {
          mode: "chain",
          boardId: d.chains.chain.id,
          turn: 1,
          word: "무지개",
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await h.post(
        h.send(
          "word",
          {
            mode: "chain",
            boardId: d.chains.chain.id,
            turn: 0,
            word: "무지개",
          },
          "b",
        ),
      )
    ).status,
    409,
  );
  r = await h.post(
    h.send(
      "word",
      { mode: "chain", boardId: d.chains.chain.id, turn: 1, word: "무지개" },
      "b",
    ),
  );
  assert.equal(r.status, 200);
  assert.equal(
    (await h.post(h.send("repair", { serial: 0, answer: "봉인" }))).data.typo
      .serial,
    1,
  );
  assert.equal(
    (await h.post(h.send("repair", { serial: 0, answer: "봉인" }, "b"))).status,
    409,
  );
  d = await h.get();
  assert.equal(
    (await h.post(h.send("ink", { boardId: d.talisman.id, turn: 0, stroke })))
      .status,
    200,
  );
  assert.equal(
    (await h.post(h.send("ink", { boardId: d.talisman.id, turn: 1, stroke })))
      .status,
    400,
  );
  assert.equal(
    (
      await h.post(
        h.send("ink", { boardId: d.talisman.id, turn: 1, stroke }, "b"),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await h.post(
        h.send("ink", { boardId: d.talisman.id, turn: 2, stroke }, "c"),
      )
    ).status,
    200,
  );
  r = await h.post(
    h.send("ink.finish", { boardId: d.talisman.id, title: "함께 그린 부적" }),
  );
  assert.equal(r.data.talismans.length, 1);
  assert.equal(r.data.talisman.strokes.length, 0);
});
test("belongings and blind drawings hide solutions in view until reveal; no claim of personal authentication", async (t) => {
  const h = await harness(t);
  let r = await h.post(
    h.send("item.create", { label: "가상 방울", clue: "달빛 찻상 옆" }),
  );
  const item = r.data.items[0];
  assert(!("ownerId" in item));
  assert(item.mine);
  assert.equal((await h.get("b")).items[0].mine, false);
  assert.equal(
    (await h.post(h.send("item.guess", { itemId: item.id, answerId: "a" })))
      .status,
    400,
  );
  r = await h.post(
    h.send("item.guess", { itemId: item.id, answerId: "a" }, "b"),
  );
  assert.equal(r.data.items[0].ownerId, "a");
  r = await h.post(
    h.send("sketch.create", { description: "네모 속의 달", strokes: [stroke] }),
  );
  const sketch = r.data.sketches[0];
  assert(sketch.reference);
  assert(!("reference" in (await h.get("b")).sketches[0]));
  r = await h.post(
    h.send("sketch.reply", { sketchId: sketch.id, strokes: [stroke] }, "b"),
  );
  assert(r.data.sketches[0].reference);
  assert.equal(r.data.sketches[0].response.memberId, "b");
  assert.equal(
    (
      await h.post(
        h.send("sketch.reply", { sketchId: sketch.id, strokes: [stroke] }, "c"),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await h.post(
        h.send("sketch.create", {
          description: "bad",
          strokes: [
            {
              color: "red",
              points: [
                [0, 0],
                [1, 1],
              ],
            },
          ],
        }),
      )
    ).status,
    400,
  );
});
test("maze merges different zones, prevents blocked endpoints and validates actual escape path", async (t) => {
  const h = await harness(t);
  let m = (await h.get()).maze;
  await h.post(h.send("maze.claim", { mazeId: m.id, zone: 0 }));
  await h.post(h.send("maze.claim", { mazeId: m.id, zone: 1 }, "b"));
  const cells0 = zoneCells(0).map((i) =>
      [17, 18, 32, 33].includes(i) ? 1 : 0,
    ),
    cells1 = zoneCells(1).map((i) => ([21, 22, 36, 37].includes(i) ? 1 : 0));
  const saves = await Promise.all([
    h.post(
      h.send("maze.edit", { mazeId: m.id, zone: 0, zoneRev: 0, cells: cells0 }),
    ),
    h.post(
      h.send(
        "maze.edit",
        { mazeId: m.id, zone: 1, zoneRev: 0, cells: cells1 },
        "b",
      ),
    ),
  ]);
  assert(saves.every((v) => v.status === 200));
  m = (await h.get()).maze;
  assert.equal(m.cells.filter(Boolean).length, 8);
  assert.equal(m.zoneRev[0], 1);
  assert.equal(m.zoneRev[1], 1);
  const blocked = zoneCells(0).map((i) => (fixedCell(i) ? 0 : 1));
  assert.equal(
    (
      await h.post(
        h.send("maze.edit", {
          mazeId: m.id,
          zone: 0,
          zoneRev: 1,
          cells: blocked,
        }),
      )
    ).status,
    400,
  );
  const publish = await h.post(h.send("maze.publish", { mazeId: m.id }));
  assert(publish.data.maze.published);
  assert.equal(
    (await h.post(h.send("maze.solve", { mazeId: m.id, path: [0, 224] })))
      .status,
    400,
  );
  const path = mazePath(publish.data.maze.cells);
  assert.equal(
    (await h.post(h.send("maze.solve", { mazeId: m.id, path }, "c"))).status,
    200,
  );
  const next = await h.post(h.send("maze.new", { mazeId: m.id }));
  assert.equal(next.data.mazes.length, 1);
  assert.notEqual(next.data.maze.id, m.id);
});
test("corrupt room stores and nested histories fail closed; read-only upstream preserves all bytes", async (t) => {
  const h = await harness(t);
  for (const corrupt of [
    "bad json",
    JSON.stringify({ ...emptyRoom(), wordHistory: [{}] }),
  ]) {
    h.f.put(roomFile, corrupt);
    assert.equal((await h.req("room", "GET", null, h.cookie)).status, 502);
    assert.equal(
      (await h.post(h.send("weather", { weather: "moon" }))).status,
      502,
    );
    assert.equal(h.f.files.get(roomFile).content, corrupt);
  }
  h.f.put(roomFile, JSON.stringify(emptyRoom()));
  const before = h.f.files.get(roomFile).content;
  h.f.setReadOnly(true);
  assert.equal((await h.post(h.send("clean"))).status, 503);
  assert.equal(h.f.files.get(roomFile).content, before);
});
