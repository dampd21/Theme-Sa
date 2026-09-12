import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.mjs";
import { fixture } from "./fixture.mjs";
import {
  emptyState,
  normalize,
  removeMember,
  restoreMember,
  purgeExpired,
  GROUPS,
  differences,
} from "../site/model.mjs";
const legacy = {
  version: 1,
  teamName: "가상 테스트팀",
  members: [
    {
      id: "m1",
      name: "가상 팀장",
      gender: "비공개",
      age: "25",
      birthYear: "2001",
      school: "",
      grade: "",
      classroom: "",
      position: "탐색",
      abilities: ["감지"],
      memo: "원본 보존 확인",
      address: "가상 기지",
      createdAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  leaderId: "m1",
  updatedAt: "2026-09-01T00:00:00.000Z",
};
const origin = "https://theme-sa.test";
function req(path, method = "GET", body, cookie) {
  return new Request(origin + path, {
    method,
    headers: {
      ...(method === "GET"
        ? {}
        : { Origin: origin, "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
test("legacy migration preserves every old profile field, creates private exact backup and blocks old clients", async (t) => {
  const f = fixture(legacy),
    oldFetch = globalThis.fetch;
  globalThis.fetch = f.fetcher;
  t.after(() => (globalThis.fetch = oldFetch));
  const raw = f.files.get("data/team.json").content;
  const login = await worker.fetch(
      req("/api/login", "POST", { password: f.env.SITE_PASSWORD }),
      f.env,
    ),
    cookie = login.headers.get("Set-Cookie").split(";")[0];
  let r = await worker.fetch(req("/api/archive", "GET", null, cookie), f.env),
    remote = await r.json();
  assert.equal(r.status, 200);
  assert.equal(remote.state.version, 2);
  for (const [k, v] of Object.entries(legacy.members[0]))
    assert.deepEqual(remote.state.members[0][k], v);
  assert.equal(f.files.size, 1, "Reading must never migrate the stored file");
  const old = await worker.fetch(
    req("/api/archive", "PUT", { state: legacy, sha: remote.sha }, cookie),
    f.env,
  );
  assert.equal(old.status, 426);
  assert.equal(f.files.get("data/team.json").content, raw);
  remote.state.members[0].codeName = "월영";
  remote.state.members[0].roleIds = ["role-deputy"];
  remote.state.customFields.push({ id: "custom-a", label: "수호령" });
  remote.state.members[0].custom.push({ id: "custom-a", value: "가상 여우" });
  remote.state.notices.push({
    id: "notice-a",
    title: "첫 공지",
    body: "가상 안내",
  });
  r = await worker.fetch(
    req(
      "/api/archive",
      "PUT",
      { state: remote.state, sha: remote.sha, clientVersion: 2, actorId: "m1" },
      cookie,
    ),
    f.env,
  );
  assert.equal(r.status, 200);
  const saved = await r.json();
  assert.equal(saved.state.members[0].codeName, "월영");
  assert.equal(f.files.size, 2);
  assert.equal(
    [...f.files].find(([p]) => p.includes(".pre-v2-"))[1].content,
    raw,
  );
  assert.equal(saved.state.activity.length, 1);
  assert.equal(saved.state.activity[0].actorId, "m1");
  const stale = await worker.fetch(
    req(
      "/api/archive",
      "PUT",
      { state: remote.state, sha: remote.sha, clientVersion: 2 },
      cookie,
    ),
    f.env,
  );
  assert.equal(stale.status, 409);
  const reload = await worker.fetch(
    req("/api/archive", "GET", null, cookie),
    f.env,
  );
  assert.equal((await reload.json()).state.notices[0].title, "첫 공지");
  const missing = structuredClone(saved.state);
  delete missing.notices;
  r = await worker.fetch(
    req(
      "/api/archive",
      "PUT",
      { state: missing, sha: saved.sha, clientVersion: 2 },
      cookie,
    ),
    f.env,
  );
  assert.equal(r.status, 400);
  f.setReadOnly(true);
  r = await worker.fetch(
    req(
      "/api/archive",
      "PUT",
      { state: saved.state, sha: saved.sha, clientVersion: 2 },
      cookie,
    ),
    f.env,
  );
  assert.equal(r.status, 503);
});
test("all extension collections round-trip and unsafe schema edits are rejected", () => {
  let s = normalize(legacy);
  for (const key of GROUPS)
    s[key].push({
      id: "record-" + key,
      title: "가상 " + key,
      body: "<script>not executable</script>",
      ...(key === "relationships"
        ? { fromId: "m1", toId: "m2", relation: "동료" }
        : {}),
    });
  s.members.push({
    ...s.members[0],
    id: "m2",
    name: "가상 치료사",
    roleIds: ["role-healer"],
    talents: [{ name: "감지", category: "감지", effect: "설정용" }],
  });
  s = normalize(s);
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(s))), s);
  const malformed = (fn) => {
    const c = structuredClone(s);
    fn(c);
    assert.throws(() => normalize(c));
  };
  malformed(
    (c) =>
      (c.roles.find((r) => r.id === "role-deputy").parentId = "role-healer"),
  );
  malformed(
    (c) =>
      (c.roles.find((r) => r.id === "role-leader").parentId = "role-healer"),
  );
  malformed((c) => (c.members[0].roleIds = ["missing"]));
  malformed((c) => (c.members[0].stats = [-1, 50, 50, 50, 50, 50]));
  malformed((c) => (c.members[0].color = "red;display:none"));
  malformed((c) => (c.events[0].date = "2026-02-31"));
  malformed((c) => (c.relationships[0].toId = "m1"));
  malformed(
    (c) => (c.polls[0].votes = [{ actorId: "m1", optionId: "missing" }]),
  );
  malformed((c) => (c.world[0].body = "x".repeat(8001)));
  const before = structuredClone(s);
  s.members[0].position = "결계";
  assert(
    differences(before, s).some(
      (d) =>
        d.label.includes("역할") && d.before === "탐색" && d.after === "결계",
    ),
  );
});
test("trash restores profiles, transfers leader safely, prunes invalid custom refs and expires at 30 days", () => {
  const now = "2026-09-12T00:00:00Z";
  let s = normalize(legacy);
  s.members.push({ ...s.members[0], id: "m2", name: "가상 부팀장" });
  s.members[0].roleIds = ["role-healer"];
  s = removeMember(s, "m1", now);
  assert.equal(s.leaderId, "m2");
  assert.equal(s.trash.length, 1);
  s.roles = s.roles.filter((r) => r.id !== "role-healer");
  restoreMember(s, "m1", Date.parse(now) + 1000);
  assert.equal(s.members[1].roleIds.length, 0);
  assert.equal(s.leaderId, "m2");
  s = normalize(s);
  removeMember(s, "m1", now);
  assert.throws(() => restoreMember(s, "m1", Date.parse(now) + 31 * 86400000));
  purgeExpired(s, Date.parse(now) + 31 * 86400000);
  assert.equal(s.trash.length, 0);
});
test("failed migration backup never overwrites the original archive", async (t) => {
  const f = fixture(legacy),
    oldFetch = globalThis.fetch;
  globalThis.fetch = f.fetcher;
  t.after(() => (globalThis.fetch = oldFetch));
  f.setReadOnly(true);
  const raw = f.files.get("data/team.json").content;
  const login = await worker.fetch(
      req("/api/login", "POST", { password: f.env.SITE_PASSWORD }),
      f.env,
    ),
    cookie = login.headers.get("Set-Cookie").split(";")[0];
  const remote = await (
    await worker.fetch(req("/api/archive", "GET", null, cookie), f.env)
  ).json();
  remote.state.teamName = "새 이름";
  const r = await worker.fetch(
    req(
      "/api/archive",
      "PUT",
      { state: remote.state, sha: remote.sha, clientVersion: 2 },
      cookie,
    ),
    f.env,
  );
  assert.equal(r.status, 503);
  assert.equal(f.files.get("data/team.json").content, raw);
});
