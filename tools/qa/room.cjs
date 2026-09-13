const { chooseProfile } = require("./profile.cjs");
const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  { spawn } = require("node:child_process"),
  path = require("node:path"),
  fs = require("node:fs"),
  { pathToFileURL } = require("node:url");
const base = "http://127.0.0.1:3001";
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
    server.once("exit", (c) => reject(Error("QA server exit " + c)));
  });
  const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox"],
    }),
    context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    }),
    page = await context.newPage(),
    errors = [],
    external = [];
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith(base))
      external.push(r.url());
  });
  page.on("dialog", (d) => d.accept());
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("#sharedPassword").fill("Local-worker-test-password-9284");
  await page.locator("#connectButton").click();
  await page.locator("#application").waitFor();
  const { emptyState, normalize } = await import(
    pathToFileURL(path.join(__dirname, "../../site/model.mjs")).href
  );
  const { mazePath, zoneCells } = await import(
    pathToFileURL(path.join(__dirname, "../../site/room-rules.mjs")).href
  );
  const s = emptyState();
  s.teamName = "달빛 가상 아지트";
  s.members = ["a", "b", "c"].map((id, i) => ({
    id,
    name: ["가상 기록관", "가상 결계사", "가상 치료사"][i],
    abilities: [],
    stats: [100, 100, 100, 100, 100, 100],
  }));
  s.leaderId = "a";
  const seed = await page.evaluate(async (state) => {
    const old = await (await fetch("/api/archive")).json();
    const r = await fetch("/api/archive", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, sha: old.sha, clientVersion: 2 }),
    });
    return r.json();
  }, normalize(s));
  await page.reload({ waitUntil: "networkidle" });
  await chooseProfile(page, "a");
  await page
    .locator("#actorSelect option[value=a]")
    .waitFor({ state: "attached" });
  await page.locator("#actorSelect").selectOption("a");
  async function nav(hash) {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForTimeout(70);
  }
  async function actor(id) {
    await page.locator("#actorSelect").selectOption(id);
    await page.waitForTimeout(100);
  }
  async function get() {
    return page.evaluate(() =>
      fetch(
        "/api/room?actor=" + document.querySelector("#actorSelect").value,
      ).then((r) => r.json()),
    );
  }
  async function save(sel) {
    const waiting = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/room" &&
        r.request().method() === "POST",
    );
    waiting.catch(() => {});
    await page.locator(sel).click();
    const r = await waiting,
      j = await r.json();
    assert.equal(r.status(), 200, JSON.stringify(j));
    await page.waitForFunction(
      () => !document.querySelector("#actorSelect").disabled,
    );
    return j;
  }
  async function draw(sel) {
    await page.locator(sel).scrollIntoViewIfNeeded();
    const b = await page.locator(sel).boundingBox();
    await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.3, {
      steps: 5,
    });
    await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.65, {
      steps: 5,
    });
    await page.mouse.up();
  }
  await nav("room");
  await page.locator(".room-stage").waitFor();
  await page.locator("#eerieToggle").check();
  await page.locator("#weatherChoice").selectOption("rain");
  await save("#weatherVote");
  assert.equal((await get()).weather, "rain");
  // A GET started before a write cannot overwrite the accepted newer state.
  let releaseOld,
    signalOld,
    held = false;
  const oldStarted = new Promise((r) => (signalOld = r)),
    oldGate = new Promise((r) => (releaseOld = r));
  await page.route("**/api/room?*", async (route) => {
    if (held) return route.continue();
    held = true;
    const old = await route.fetch();
    signalOld();
    await oldGate;
    await route.fulfill({ response: old });
  });
  await page.locator("#refreshButton").click();
  await oldStarted;
  await page.locator("#weatherChoice").selectOption("moon");
  await save("#weatherVote");
  releaseOld();
  await page.waitForTimeout(150);
  await page.unroute("**/api/room?*");
  assert.equal(await page.locator("#weatherChoice").inputValue(), "moon");
  await save(".room-dust.dust-0");
  assert.equal((await get()).clean.length, 1);
  for (const [caseId, answer] of ["welcome", "frame", "team"].entries()) {
    await nav("room");
    for (const id of ["inspectWindow", "inspectFrame", "inspectGhost"])
      await save("#" + id);
    await nav("room/mystery");
    await save('[data-solve="' + answer + '"]');
    assert.equal((await get()).caseId, caseId + 1);
  }
  assert.equal((await get()).clues.length, 9);
  console.log(
    "Living scene, weather, cleaning and all three mysteries passed.",
  );
  await nav("room/words");
  await page.locator("#wordInput").fill("허용되지않은가상단어");
  await page.locator("#wordSend").click();
  await page.waitForFunction(() =>
    document.querySelector("#roomStatus").textContent.includes("저장을 확인"),
  );
  assert.equal(await page.locator("#roomRetry").count(), 0);
  assert.equal(
    await page.locator("#wordInput").inputValue(),
    "허용되지않은가상단어",
  );
  await page.locator("#wordInput").fill("나무");
  await save("#wordSend");
  await actor("b");
  await page.locator("#wordInput").fill("무지개");
  await save("#wordSend");
  assert.equal((await get()).chains.chain.turns.length, 2);
  await page.locator("#typoAnswer").fill("봉인");
  await save("#repairSend");
  assert.equal((await get()).typo.serial, 1);
  await page.locator("#sentenceMode").click();
  await page.locator("#wordInput").fill("오늘");
  await save("#wordSend");
  await actor("a");
  await page.locator("#wordInput").fill("기록실은");
  await save("#wordSend");
  await page.locator("#itemLabel").fill("별빛 방울");
  await page.locator("#itemClue").fill("책상을 지키는 작은 소지품");
  await save("#itemCreate");
  const item = (await get()).items[0];
  assert(!("ownerId" in item));
  await actor("b");
  await page.locator("#guess-" + item.id).selectOption("a");
  await save('[data-guess="' + item.id + '"]');
  assert(
    (await page.locator(".room-success").innerText()).includes("가상 기록관"),
  );
  console.log(
    "Word chain, shared sentence, typo repair and belongings passed.",
  );
  await nav("room/art");
  for (const who of ["a", "b", "c"]) {
    await actor(who);
    await draw("#inkCanvas");
    await save("#inkSend");
  }
  await page.locator("#inkTitle").fill("세 사람의 달빛 부적");
  await save("#inkFinish");
  assert.equal((await get()).talismans.length, 1);
  await actor("a");
  await draw("#sketchCanvas");
  await page
    .locator("#sketchDescription")
    .fill("비스듬한 선이 오른쪽 아래로 이어집니다.");
  await save("#sketchCreate");
  const sketch = (await get()).sketches[0];
  await actor("b");
  await page.locator("#sketchSelect").selectOption(sketch.id);
  assert(!("reference" in (await get()).sketches[0]));
  await draw("#sketchCanvas");
  await save("#sketchReply");
  assert.equal((await get()).sketches[0].response.memberId, "b");
  assert.equal(await page.locator("#view .room-art-svg").count(), 3);
  console.log(
    "Native pointer collaborative ink and blind drawing reveal passed.",
  );
  await nav("room/maze");
  await actor("a");
  await page.locator("#mazeZone").selectOption("0");
  await save("#mazeClaim");
  for (const cell of [7, 8, 12, 13])
    await page.locator('[data-cell="' + cell + '"]').click();
  await save("#mazeSave");
  await actor("b");
  await page.locator("#mazeZone").selectOption("1");
  await save("#mazeClaim");
  for (const cell of [6, 7, 11, 12])
    await page.locator('[data-cell="' + cell + '"]').click();
  await save("#mazeSave");
  await save("#mazePublish");
  let m = (await get()).maze,
    p = mazePath(m.cells);
  for (let i = 1; i < p.length; i++) {
    const diff = p[i] - p[i - 1];
    await page
      .locator(
        '[data-move="' +
          { 1: "right", "-1": "left", 15: "down", "-15": "up" }[diff] +
          '"]',
      )
      .click();
  }
  await save("#mazeSolve");
  assert.equal((await get()).maze.solvers.length, 1);
  console.log("Two-zone design and actual directional maze escape passed.");
  // A response lost after the server commits must not clean twice.
  await nav("room");
  let intercepted = false;
  await page.route("**/api/room", async (route) => {
    if (route.request().method() === "POST" && !intercepted) {
      intercepted = true;
      await route.fetch();
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "TEST_LOST", message: "가상 응답 손실" },
        }),
      });
    } else await route.continue();
  });
  const before = (await get()).clean.length;
  await page.locator("[data-clean]").first().click();
  await page.locator("#roomRetry").waitFor();
  await save("#roomRetry");
  assert.equal((await get()).clean.length, before + 1);
  await page.unroute("**/api/room");
  // Unsaved text stays intact when navigation is declined.
  await nav("room/words");
  await page.locator("#itemLabel").fill("보존할 가상 초안");
  page.removeAllListeners("dialog");
  page.on("dialog", (d) => d.dismiss());
  await page.evaluate(() => (location.hash = "members"));
  await page.waitForTimeout(100);
  assert.equal(
    await page.locator("#itemLabel").inputValue(),
    "보존할 가상 초안",
  );
  assert.equal(await page.evaluate(() => location.hash), "#room/words");
  await page.locator("#itemLabel").fill("");
  page.removeAllListeners("dialog");
  page.on("dialog", (d) => d.accept());
  const shots = path.join(__dirname, "../../.cache/qa");
  fs.mkdirSync(shots, { recursive: true });
  for (const width of [320, 360, 384, 412, 780, 1024, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    for (const route of [
      "room",
      "room/mystery",
      "room/words",
      "room/art",
      "room/maze",
      "dashboard",
    ]) {
      await nav(route);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Overflow " + width + " " + route,
      );
    }
  }
  await nav("room");
  await page.screenshot({
    path: path.join(shots, "room-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.screenshot({
    path: path.join(shots, "room-s22.png"),
    fullPage: true,
  });
  await nav("room/art");
  await page.screenshot({
    path: path.join(shots, "room-art-s22.png"),
    fullPage: true,
  });
  const phone = await browser.newContext({
      viewport: { width: 360, height: 780 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
      reducedMotion: "reduce",
    }),
    mobile = await phone.newPage();
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto(base, { waitUntil: "networkidle" });
  await mobile
    .locator("#sharedPassword")
    .fill("Local-worker-test-password-9284");
  await mobile.locator("#connectButton").tap();
  await mobile.locator("#application").waitFor();
  await chooseProfile(mobile, "a");
  await mobile.locator("#actorSelect").selectOption("a");
  await mobile.evaluate(() => (location.hash = "room/art"));
  await mobile.locator("#inkCanvas").waitFor();
  await mobile.locator("#inkCanvas").scrollIntoViewIfNeeded();
  const box = await mobile.locator("#inkCanvas").boundingBox(),
    cdp = await phone.newCDPSession(mobile);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + 50, y: box.y + 50 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: box.x + 150, y: box.y + 160 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  const response = mobile.waitForResponse(
    (r) => r.url().endsWith("/api/room") && r.request().method() === "POST",
  );
  response.catch(() => {});
  await mobile.locator("#inkSend").tap();
  assert.equal((await response).status(), 200);
  await mobile.waitForFunction(
    () => !document.querySelector("#inkSend").disabled,
  );
  await mobile.evaluate(() => (location.hash = "room/words"));
  await mobile.locator("#sentenceMode").tap();
  assert(
    (await mobile.locator("#sentenceMode").getAttribute("aria-pressed")) ===
      "true",
  );
  await mobile.evaluate(() =>
    document.querySelector("#chainMode").dispatchEvent(
      new PointerEvent("click", {
        bubbles: true,
        detail: 1,
        pointerType: "touch",
      }),
    ),
  );
  assert(
    (await mobile.locator("#sentenceMode").getAttribute("aria-pressed")) ===
      "true",
  );
  const modeBox = await mobile.locator("#chainMode").boundingBox();
  await mobile.mouse.click(
    modeBox.x + modeBox.width / 2,
    modeBox.y + modeBox.height / 2,
  );
  assert(
    (await mobile.locator("#chainMode").getAttribute("aria-pressed")) ===
      "true",
  );
  for (const [event, x] of [
    ["pointerdown", 10],
    ["pointermove", 50],
    ["pointerup", 10],
  ])
    await mobile.locator("#sentenceMode").dispatchEvent(event, {
      pointerId: 92,
      pointerType: "touch",
      clientX: x,
      clientY: 10,
    });
  assert(
    (await mobile.locator("#chainMode").getAttribute("aria-pressed")) ===
      "true",
  );
  await phone.close();
  const failed = await context.newPage();
  let fails = 0,
    failRead = true;
  failed.on("pageerror", (e) => errors.push(e.message));
  await failed.route("**/api/room?*", (route) => {
    fails++;
    return failRead
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "TEST_READ", message: "가상 읽기 실패" },
          }),
        })
      : route.continue();
  });
  await failed.addInitScript(() =>
    sessionStorage.setItem("theme-sa-activity-profile", "a"),
  );
  await failed.goto(base + "/#room", { waitUntil: "networkidle" });
  await failed.locator("#roomReload").waitFor();
  await failed.waitForTimeout(200);
  assert.equal(fails, 1, "No failed-load retry loop");
  failRead = false;
  await failed.locator("#roomReload").click();
  await failed.locator(".room-stage").waitFor();
  assert.equal(fails, 2);
  await failed.close();
  const final = await page.evaluate(() =>
    fetch("/api/archive").then((r) => r.json()),
  );
  assert.equal(final.sha, seed.sha);
  assert.deepEqual(
    final.state.members[0].stats,
    [100, 100, 100, 100, 100, 100],
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await page.locator("#logoutButton").click();
  await page.locator("#loginScreen").waitFor();
  assert.equal(await page.evaluate(() => sessionStorage.length), 0);
  await browser.close();
  server.kill();
  console.log(
    "PASS: all 14 room features, three mysteries, native mouse/touch drawing, shared turns, maze, retry deduplication, draft guard, original archive preservation, seven widths and logout.",
  );
})().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
