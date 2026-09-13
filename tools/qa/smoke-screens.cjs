// Execute the production read-only browser checker against a synthetic Worker, never production data.
const { spawn } = require("node:child_process"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  { pathToFileURL } = require("node:url"),
  assert = require("node:assert/strict");
let server;
process.on("exit", () => server?.kill());
(async () => {
  await new Promise((resolve, reject) => {
    server = spawn(process.execPath, [path.join(__dirname, "server.mjs")], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout.on("data", (b) => {
      if (b.toString().includes("Synthetic extension integration server"))
        resolve();
    });
    server.stderr.on("data", (b) => process.stderr.write(b));
    server.once("exit", (c) => reject(Error("Server exit " + c)));
  });
  const url = "http://127.0.0.1:3001";
  let cookie = "";
  const req = async (p, body) =>
    fetch(url + "/api/" + p, {
      method: body ? "POST" : "GET",
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { Origin: url, "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const login = await req("login", {
    password: "Local-worker-test-password-9284",
  });
  assert.equal(login.status, 200);
  cookie = login.headers
    .getSetCookie()
    .find((c) => c.startsWith("__Host-theme_sa="))
    .split(";")[0];
  const old = await (await req("archive")).json(),
    { normalize, emptyState } = await import("../../site/model.mjs");
  const s = emptyState();
  s.members = [
    {
      id: "synthetic-member",
      name: "가상 운영 점검",
      stats: [100, 100, 100, 100, 100, 100],
      abilities: [],
    },
  ];
  s.leaderId = "synthetic-member";
  const saved = await fetch(url + "/api/archive", {
    method: "PUT",
    headers: {
      Cookie: cookie,
      Origin: url,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      state: normalize(s),
      sha: old.sha,
      clientVersion: 2,
    }),
  });
  assert.equal(saved.status, 200);
  const before = (await saved.json()).sha;
  const source = await fs.readFile(
    path.join(__dirname, "../smoke-cloudflare.mjs"),
    "utf8",
  );
  const checker = source
    .slice(0, source.indexOf("async function main()"))
    .replace(
      "async function verifyLiveScreens",
      "export async function verifyLiveScreens",
    );
  const file = path.join(
    __dirname,
    "../../.cache/qa/read-only-screen-check.mjs",
  );
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, checker);
  const { verifyLiveScreens } = await import(pathToFileURL(file).href);
  assert((await verifyLiveScreens(url, cookie, "synthetic-member")) >= 98);
  assert.equal((await (await req("archive")).json()).sha, before);
  server.kill();
  console.log(
    "PASS: actual production read-only screen checker, required profile choice, every navigation route, village tabs/settings and eight luck-game settings at desktop/mobile widths, synthetic data only.",
  );
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
