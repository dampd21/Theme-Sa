// Synthetic verification of CI script control flow, without any live requests or credentials.
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";
import { join } from "node:path";
let code = await readFile(
  new URL("../smoke-cloudflare.mjs", import.meta.url),
  "utf8",
);
code = code.replace(/^import .*;\n/gm, "");
// Browser route rendering is covered by the actual browser suites; isolate CI orchestration here.
const a = code.indexOf("async function verifyLiveScreens("),
  b = code.indexOf("async function main()", a);
assert(a >= 0 && b > a);
code = code.slice(0, a) + code.slice(b);
for (const transient of [false, true]) {
  const state = { logins: 0, reads: 0, screen: 0, logout: 0 },
    failures = [],
    proc = {
      env: {
        RUNNER_TEMP: "/synthetic",
        SITE_PASSWORD: "synthetic-only",
        DATA_REPO_TOKEN: "synthetic-server-only",
      },
      exitCode: 0,
    };
  const reply = (body, status = 200, headers = {}) =>
    new Response(JSON.stringify(body), { status, headers });
  await vm.runInNewContext(code, {
    process: proc,
    console: {
      log() {},
      error(m) {
        failures.push(m);
      },
    },
    readFile: async () => "https://theme-sa.example.workers.dev",
    appendFile: async () => {},
    join,
    setTimeout: (fn) => fn(),
    AbortSignal,
    verifyLiveScreens: async (url, cookie, id) => {
      assert.equal(cookie, "__Host-theme_sa=synthetic-cookie");
      assert.equal(id, "synthetic-member");
      state.screen++;
    },
    fetch: async (url, init = {}) => {
      const p = new URL(url).pathname;
      if (p === "/") return new Response('<input id="sharedPassword">');
      const auth = init.headers.Cookie === "__Host-theme_sa=synthetic-cookie";
      if (p === "/api/login") {
        state.logins++;
        assert.equal(JSON.parse(init.body).password, proc.env.SITE_PASSWORD);
        // Selecting the named host cookie must work even when the edge adds another cookie first.
        return reply({ authenticated: true }, 200, [
          ["Set-Cookie", "other=unrelated; Secure"],
          [
            "Set-Cookie",
            "__Host-theme_sa=synthetic-cookie; Path=/; HttpOnly; Secure; SameSite=Strict",
          ],
        ]);
      }
      if (p === "/api/session")
        return reply({
          authenticated: auth && !(transient && state.logins === 1),
        });
      if (p === "/api/logout") {
        state.logout++;
        return reply({ ok: true });
      }
      assert.equal(
        init.method,
        "GET",
        "Production record mutations are forbidden",
      );
      if (!auth) return reply({ error: { code: "LOGIN_REQUIRED" } }, 401);
      state.reads++;
      if (p === "/api/archive")
        return reply({
          state: { version: 2, members: [{ id: "synthetic-member" }] },
        });
      if (p === "/api/training")
        return reply({ rules: 1, profiles: [], relays: [] });
      if (p === "/api/world")
        return reply({ version: 1, quests: [], events: [], profile: {} });
      if (p === "/api/party")
        return reply({ version: 1, cups: [], presets: [] });
      if (p === "/api/adventure") return reply({ version: 1, runs: [] });
      if (p === "/api/room") return reply({ version: 1, clues: [] });
      throw new Error("Unexpected route");
    },
  });
  assert.deepEqual(failures, []);
  assert.equal(proc.exitCode, 0);
  assert.equal(state.logins, transient ? 2 : 1);
  assert.equal(state.reads, 6);
  assert.equal(state.screen, 1);
  assert.equal(state.logout, 1);
}
console.log(
  "PASS: CI smoke orchestration, named-cookie selection, bounded session recovery, protected reads, screen check and logout; no live network.",
);
