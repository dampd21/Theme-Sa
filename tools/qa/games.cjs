const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const base = "http://127.0.0.1:3001";
let server;
process.on("exit", () => server?.kill());
(async () => {
  await new Promise((resolve, reject) => {
    server = spawn(process.execPath, [path.join(__dirname, "server.mjs")], {
      env: { ...process.env, THEME_SA_GAME_QA: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout.on("data", (b) => {
      if (b.toString().includes("Synthetic extension integration server"))
        resolve();
    });
    server.stderr.on("data", (b) => process.stderr.write(b));
    server.once("exit", (code) => reject(new Error("Server exited " + code)));
  });
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    }),
    page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [],
    external = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/.test(m.text()))
      errors.push(m.text());
  });
  page.on("request", (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith(base))
      external.push(r.url());
  });
  page.on("dialog", (d) => d.accept());
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("#sharedPassword").fill("Local-worker-test-password-9284");
  await page.locator("#connectButton").click();
  await page.locator("#application").waitFor({ state: "visible" });
  assert((await page.locator("#view h1").innerText()).includes("대시보드"));
  // Seed only synthetic fixture records using the real archive handler.
  const { emptyState, normalize } = await import(
    pathToFileURL(path.join(__dirname, "../../site/model.mjs")).href
  );
  const s = emptyState();
  s.teamName = "가상 훈련팀";
  s.members = ["a", "b", "c"].map((id, i) => ({
    id,
    name: ["가상 팀장", "가상 치료사", "가상 기록관"][i],
    abilities: [],
    createdAt: null,
    stats: [100, 100, 100, 100, 100, 100],
  }));
  s.leaderId = "a";
  const initial = await page.evaluate(() =>
    fetch("/api/archive").then((r) => r.json()),
  );
  const seeded = await page.evaluate(
    async (body) => {
      const r = await fetch("/api/archive", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: r.status, json: await r.json() };
    },
    { state: normalize(s), sha: initial.sha, clientVersion: 2 },
  );
  assert.equal(seeded.status, 200);
  await page.locator("#refreshButton").click();
  await page
    .locator("#actorSelect option[value=a]")
    .waitFor({ state: "attached" });
  await page.locator("#actorSelect").selectOption("a");
  async function nav(hash) {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForFunction((h) => location.hash === "#" + h, hash);
  }
  async function overview() {
    return page.evaluate(() => fetch("/api/training").then((r) => r.json()));
  }
  async function advance(ms) {
    await context.request.post(base + "/_qa/advance", {
      data: { delta: Math.min(240000, ms + 4000) },
    });
    await page.clock.runFor(ms);
  }
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const rules = await import(
    pathToFileURL(path.join(__dirname, "../../site/game-rules.mjs")).href
  );
  async function start(game, mode) {
    if (await page.locator("#againGame").count())
      await page.locator("#againGame").click({ force: true });
    await nav("training/" + game);
    await page.locator("#startGame").waitFor();
    if (mode) await page.locator("#gameMode").selectOption(mode);
    await page.locator("#gameControl").selectOption("pc");
    const response = page.waitForResponse((r) =>
      r.url().endsWith("/api/training/start"),
    );
    await page.locator("#startGame").click({ force: true });
    const r = await response;
    assert.equal(r.status(), 200, await r.text());
    const session = await r.json();
    await page.locator("#gameClock").waitFor();
    return session.run;
  }
  async function playCanvas(max) {
    await context.request.post(base + "/_qa/advance", {
      data: { delta: max + 4000 },
    });
    for (let t = 0; t <= max + 1000; t += 1000) {
      if (!(await page.locator("#gameClock").count())) break;
      await page.clock.runFor(1000);
      await page.waitForTimeout(5);
    }
  }
  async function result() {
    try {
      await page.locator(".game-result #againGame").waitFor();
    } catch (e) {
      throw new Error(
        "Game did not save: " + (await page.locator("#view").innerText()),
      );
    }
  }
  let run = await start("focus", "visible");
  await advance(7770);
  await page.keyboard.press("Space");
  await result();
  let data = await overview();
  assert.equal(data.profiles.find((p) => p.memberId === "a").xp[0], 15);
  console.log("Focus native input + server save passed.");
  // Response lost after commit: retry must return same receipt, not a second reward.
  let intercept = true;
  await page.route("**/api/training/finish", async (route) => {
    if (intercept) {
      intercept = false;
      await route.fetch();
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "TEST_NETWORK", message: "가상 응답 손실" },
        }),
      });
    } else await route.continue();
  });
  run = await start("focus", "hidden");
  await advance(7770);
  assert.equal(await page.locator("#focusTimer").innerText(), "?.???");
  await page.locator("#gameAction").dispatchEvent("pointerdown", {
    pointerId: 1,
    pointerType: "touch",
    button: 0,
  });
  await page.locator("#retryGameSave").waitFor();
  await page.locator("#retryGameSave").click({ force: true });
  await result();
  assert(
    (await page.locator(".game-result").innerText()).includes("이미 저장"),
  );
  await page.unroute("**/api/training/finish");
  assert.equal((await overview()).profiles[0].xp[0], 30);
  run = await start("defense");
  let elapsed = 0;
  for (const time of rules.attackTimes(run.seed)) {
    await advance(time - elapsed);
    await page.keyboard.press("Space");
    elapsed = time;
  }
  await advance(450);
  await result();
  assert((await overview()).profiles[0].xp[2] > 0);
  console.log("Defense complete and XP passed.");
  run = await start("sense");
  for (let round = 0; round < 20; round++) {
    await advance(200);
    const target = rules.puzzle(run.seed, round).target;
    await page
      .locator(`[data-puzzle="${target}"]`)
      .dispatchEvent("pointerdown", {
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
      });
  }
  await result();
  assert((await overview()).profiles[0].xp[3] > 0);
  console.log("Detection sequence passed.");
  run = await start("purify");
  let actions = [],
    info = rules.memoryInfo(run, actions);
  elapsed = 0;
  while (!info.complete) {
    const t = info.watchUntil + 200 + info.index * 100;
    await advance(t - elapsed);
    await page.keyboard.press(String(info.seq[info.index] + 1));
    actions.push({ t, index: info.seq[info.index] });
    elapsed = t;
    info = rules.memoryInfo(run, actions);
  }
  await result();
  assert((await overview()).profiles[0].xp[4] > 0);
  console.log("Memory complete passed.");
  run = await start("agility");
  await playCanvas(90000);
  await result();
  assert(
    (await overview()).profiles[0].bests.some(
      (b) => b.key === "agility:standard:pc",
    ),
  );
  console.log("Dodge canvas replay passed.");
  run = await start("survival", "growth");
  assert.deepEqual(
    run.levels,
    rules.levels((await overview()).profiles.find((p) => p.memberId === "a")),
  );
  assert.notDeepEqual(run.levels, [100, 100, 100, 100, 100, 100]);
  await playCanvas(180000);
  await result();
  assert(
    (await overview()).profiles[0].bests.some(
      (b) => b.key === "survival:growth:pc",
    ),
  );
  console.log("RPG canvas replay and real training stats passed.");
  await nav("training/coop");
  await page.locator("#createRelay").click({ force: true });
  await page.waitForFunction(() =>
    document.querySelector("#view").textContent.includes("진행 중인 봉인"),
  );
  for (const member of ["a", "b", "c"]) {
    await page.locator("#actorSelect").selectOption(member);
    run = await start("coop", "relay");
    const seq = rules.sequence(run.seed),
      len = 3 + run.stage;
    elapsed = 0;
    for (let i = 0; i < len; i++) {
      const t = len * 500 + 850 + i * 100;
      await advance(t - elapsed);
      await page.keyboard.press(String(seq[i] + 1));
      elapsed = t;
    }
    await result();
  }
  data = await overview();
  assert(data.profiles.every((p) => p.xp[5] === 15));
  assert(data.relays[0].completedAt);
  console.log("Three-profile cooperation reward passed.");
  await nav("dashboard");
  for (const width of [320, 360, 384, 412, 780, 1024, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    for (const hash of [
      "dashboard",
      "training",
      "rankings",
      "member/a",
      "training/focus",
      "training/survival",
    ]) {
      await nav(hash);
      await page.locator("#view h1").first().waitFor();
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Overflow " + width + " " + hash,
      );
    }
  }
  const shots = path.join(__dirname, "../../.cache/qa");
  fs.mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await nav("dashboard");
  await page.screenshot({
    path: path.join(shots, "dashboard-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 360, height: 780 });
  await nav("dashboard");
  await page.screenshot({
    path: path.join(shots, "dashboard-s22.png"),
    fullPage: true,
  });
  await nav("training");
  await page.screenshot({
    path: path.join(shots, "training-s22.png"),
    fullPage: true,
  });
  await nav("rankings");
  await page.locator("#rankGame").selectOption("coop");
  await page.locator("#rankPeriod").selectOption("all");
  await page.locator(".ranking-row").first().waitFor();
  assert.equal(await page.locator(".ranking-row").count(), 3);
  // Navigation guard + cancellation never grant XP.
  await page.locator("#actorSelect").selectOption("a");
  await start("focus");
  await advance(1000);
  await page.locator("#abortGame").click({ force: true });
  await page.locator("#startGame").waitFor();
  assert.equal(
    (await overview()).profiles.find((p) => p.memberId === "a").xp[0],
    30,
  );
  await nav("member/a");
  assert(
    (await page.locator(".training-profile").innerText()).includes(
      "게임별 프로필 랭크",
    ),
  );
  const final = await page.evaluate(() =>
    fetch("/api/archive").then((r) => r.json()),
  );
  assert.deepEqual(
    final.state.members[0].stats,
    [100, 100, 100, 100, 100, 100],
  );
  assert.equal(
    final.sha,
    seeded.json.sha,
    "Playing games must not touch the team archive",
  );
  // Real touch events in an S22-sized, coarse-pointer browser context.
  const touchContext = await browser.newContext({
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const mobile = await touchContext.newPage();
  mobile.setDefaultTimeout(15000);
  mobile.on("pageerror", (e) => errors.push(e.message));
  mobile.on("dialog", (d) => d.accept());
  await mobile.goto(base, { waitUntil: "networkidle" });
  await mobile
    .locator("#sharedPassword")
    .fill("Local-worker-test-password-9284");
  await mobile.locator("#connectButton").tap();
  await mobile.locator("#application").waitFor();
  await mobile.locator("#actorSelect").selectOption("a");
  await mobile.clock.install();
  await mobile.clock.pauseAt(new Date(Date.now() + 1000));
  await mobile.evaluate(() => (location.hash = "training/focus"));
  await mobile.locator("#startGame").waitFor();
  assert.equal(await mobile.locator("#gameControl").inputValue(), "touch");
  for (let i = 0; i < 2; i++) {
    if (i) await mobile.locator("#againGame").tap({ force: true });
    await mobile.locator("#startGame").tap({ force: true });
    await mobile.locator("#gameClock").waitFor();
    await touchContext.request.post(base + "/_qa/advance", {
      data: { delta: 9000 },
    });
    await mobile.clock.runFor(7770);
    await mobile.locator("#gameAction").tap({ force: true });
    await mobile.locator(".game-result #againGame").waitFor();
  }
  assert(
    (await mobile.locator(".reward-list").innerText()).includes(
      "LEVEL UP 0 → 1",
    ),
  );
  await mobile.screenshot({
    path: path.join(shots, "level-up-touch-s22.png"),
    fullPage: true,
  });
  await mobile.evaluate(() => (location.hash = "training/agility"));
  await mobile.locator("#startGame").waitFor();
  assert.equal(await mobile.locator("#gameControl").inputValue(), "touch");
  await mobile.locator("#startGame").tap({ force: true });
  await mobile.locator("#gameCanvas").waitFor();
  await touchContext.request.post(base + "/_qa/advance", {
    data: { delta: 95000 },
  });
  await mobile.evaluate(() =>
    document.querySelector("#gameCanvas").scrollIntoView({ block: "center" }),
  );
  const box = await mobile.locator("#gameCanvas").boundingBox(),
    cdp = await touchContext.newCDPSession(mobile);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
  });
  await mobile.clock.runFor(500);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: box.x + box.width * 0.75, y: box.y + box.height * 0.3 }],
  });
  await mobile.clock.runFor(1500);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await mobile.screenshot({
    path: path.join(shots, "agility-touch-s22.png"),
    fullPage: true,
  });
  assert(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  for (let t = 2000; t < 92000; t += 1000) {
    if (!(await mobile.locator("#gameClock").count())) break;
    await mobile.clock.runFor(1000);
    await mobile.waitForTimeout(5);
  }
  await mobile.locator(".game-result #againGame").waitFor();
  const touchData = await mobile.evaluate(() =>
    fetch("/api/training").then((r) => r.json()),
  );
  const touchProfile = touchData.profiles.find((p) => p.memberId === "a");
  assert.equal(touchProfile.xp[0], 60);
  assert(touchProfile.bests.some((b) => b.key === "focus:visible:touch"));
  assert(
    touchProfile.bests.some((b) => b.key === "agility:standard:touch"),
    JSON.stringify({
      keys: touchProfile.bests.map((b) => b.key),
      text: await mobile.locator("#view").innerText(),
    }),
  );
  await mobile.locator("#logoutButton").tap({ force: true });
  await touchContext.close();
  console.log(
    "Native S22 touch timing, canvas drag, replay and level-up passed.",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await page.locator("#logoutButton").click({ force: true });
  await page.locator("#loginScreen").waitFor();
  assert.equal(await page.evaluate(() => sessionStorage.length), 0);
  console.log(
    "PASS: seven real UI engines, native inputs, replay and deduplication, XP, ranking, dashboard, separate storage, three-profile relay, seven widths, logout.",
  );
  await browser.close();
  server.kill();
})().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
