const { chromium } = require("playwright"),
  { spawn } = require("node:child_process"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  fs = require("node:fs");
const { chooseProfile } = require("./profile.cjs");
let server, browser;
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
    server.once("exit", (c) => reject(Error("server exited " + c)));
  });
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      hasTouch: true,
      reducedMotion: "reduce",
    }),
    page = await context.newPage(),
    errors = [],
    external = [];
  page.setDefaultTimeout(15000);
  page.on("dialog", (d) => d.accept());
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      /^https?:/.test(r.url()) &&
      !r.url().startsWith("http://127.0.0.1:3001")
    )
      external.push(r.url());
  });
  const base = "http://127.0.0.1:3001",
    b = (a) => page.locator(`[data-world="${a}"]`),
    ready = () =>
      page.waitForFunction(
        () =>
          document.querySelector("#worldFields") &&
          !document.querySelector("#worldFields").disabled,
      ),
    click = async (a, attrs = "") => {
      await page.locator(`[data-world="${a}"]${attrs}`).click();
      await ready();
    },
    tab = async (t) => {
      await page.locator(`[data-wtab="${t}"]`).click();
      await page.locator(`[data-wtab="${t}"][aria-pressed="true"]`).waitFor();
      await ready();
    };
  const get = () =>
    page.evaluate(() =>
      fetch(
        "/api/world?actor=" + document.querySelector("#actorSelect").value,
      ).then((r) => r.json()),
    );
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("#sharedPassword").fill("Local-worker-test-password-9284");
  await page.locator("#connectButton").click();
  await page.locator("#profileGate").waitFor();
  const { emptyState, normalize } = await import("../../site/model.mjs");
  const s = emptyState();
  s.members = ["a", "b", "c"].map((id) => ({
    id,
    name: "가상 마을친구 " + id,
    stats: [50, 50, 50, 50, 50, 50],
    abilities: [],
  }));
  s.leaderId = "a";
  await page.evaluate(async (state) => {
    const old = await (await fetch("/api/archive")).json();
    await fetch("/api/archive", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, sha: old.sha, clientVersion: 2 }),
    });
  }, normalize(s));
  await page.reload({ waitUntil: "networkidle" });
  await chooseProfile(page, "a");
  const before = await page.evaluate(() =>
    Promise.all(
      ["archive", "training", "room", "adventure", "party"].map((p) =>
        fetch("/api/" + p).then((r) => r.json()),
      ),
    ),
  );
  await page.evaluate(() => (location.hash = "#village"));
  await page.locator(".world-room").waitFor();
  await tab("town");
  const { PLACES, TIMES, MAIL, GAME_INFO } =
    await import("../../site/world-content.mjs");
  // Every place and time via native controls, including exact lost-response retry.
  let failOnce = true;
  await page.route("**/api/world", async (route) => {
    if (
      failOnce &&
      route.request().method() === "POST" &&
      route.request().postDataJSON().action === "explore"
    ) {
      failOnce = false;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await b("visit").first().click();
  await b("retry").waitFor();
  await click("retry");
  await page.unroute("**/api/world");
  for (const place of PLACES) {
    await click("visit", `[data-id="${place.id}"]`);
    for (const time of Object.keys(TIMES))
      await click("time", `[data-id="${time}"]`);
  }
  assert.equal((await get()).profile.clues.length, 24);
  assert.equal((await get()).barrier, 24);
  const dir = path.join(__dirname, "../../.cache/qa");
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({
    path: path.join(dir, "world-town-desktop.png"),
    fullPage: true,
  });
  await tab("mail");
  for (const m of MAIL)
    await click("mail", `[data-id="${m.id}"][data-choice="1"]`);
  assert.equal((await get()).profile.mail.length, 4);
  await tab("atelier");
  await page.locator("#worldPetName").fill("빛나는 가상 친구");
  await click("pet");
  await click("care");
  await click("toyStart");
  for (let i = 0; i < 3; i++) {
    const item = page.locator(`[data-world="toyPick"][data-index="${i}"]`);
    if (!(await item.isDisabled())) await item.click();
  }
  assert(
    (await page.locator("#worldFields").innerText()).includes("찾았어요!"),
  );
  await click("errand", '[data-route="1"]');
  await page.evaluate(() =>
    fetch("/_qa/advance", {
      method: "POST",
      body: JSON.stringify({ delta: 61000 }),
    }),
  );
  await click("claim");
  assert((await get()).profile.artifacts.includes("errand"));
  await page.locator("#worldSealName").fill("친구에게 돌아가는 별");
  await page
    .locator("#worldSealDescription")
    .fill("늦게 돌아와도 네 자리는 남아 있어.");
  await page.locator("#worldSealSymbol").selectOption("star");
  await click("seal");
  await page.locator("#worldGiftTo").selectOption("b");
  await click("gift");
  const download = page.waitForEvent("download");
  await click("png");
  const pngDownload = await download;
  console.log(
    "PNG download name:",
    pngDownload.suggestedFilename(),
    "failure:",
    await pngDownload.failure(),
  );
  const pngPath = path.join(dir, "world-generated-seal.png");
  await pngDownload.saveAs(pngPath);
  assert.equal(fs.readFileSync(pngPath).subarray(1, 4).toString(), "PNG");
  await tab("home");
  await click("room", '[data-id="greenhouse"]');
  for (let i = 0; i < 4; i++) await click("plant");
  await click("home");
  await click("room", '[data-id="radio"]');
  for (const [i, value] of [3, 1, 4].entries())
    await page.locator("#radio-" + i).selectOption("" + value);
  await click("radio");
  await click("home");
  await click("room", '[data-id="mirror"]');
  assert.equal(await page.locator("#worldFields details").count(), 4);
  await click("home");
  await click("room", '[data-id="rainroom"]');
  assert(
    (await page.locator("#worldFields").innerText()).includes("우산 요괴"),
  );
  await tab("games");
  const { solution } = await import("./world-solutions.mjs");
  for (const type of Object.keys(GAME_INFO)) {
    await click("gameStart", `[data-id="${type}"]`);
    let run = (await get()).profile.active;
    assert.equal(run.type, type);
    await page.setViewportSize({ width: 320, height: 850 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "active game overflow " + type,
    );
    const actions = solution(type, run.level, run.seed);
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      let selector = '[data-world="step"]';
      for (const [k, v] of Object.entries(action))
        selector += `[data-${k}="${v === true ? "1" : v}"]`;
      await page.locator(selector).tap();
      await ready();
      if (type === "tactics" && i === 0) {
        await click("gameSave");
        await page.reload({ waitUntil: "networkidle" });
        await tab("games");
        await page.locator(".world-game").waitFor();
        assert.equal((await get()).profile.active.actions.length, 1);
      }
    }
    assert((await get()).profile.wins.includes(type + ":0"), type);
    assert.equal((await get()).profile.active, null, type);
  }
  await tab("home");
  await click("room", '[data-id="lost"]');
  await click("lost", '[data-id="윤"]');
  assert((await get()).profile.lost);
  await tab("atelier");
  await click("display", '[data-id="appraisal"]');
  await click("display", '[data-id="shop"]');
  assert(
    (await page.locator("#worldFields").innerText()).includes(
      "비가 멎지 않아도",
    ),
  );
  await page.locator("summary").filter({ hasText: "유물 해석 쪽지" }).click();
  await page.locator("#worldArtifactNote").fill("우산은 기다림의 약속 같아요.");
  await click("artifactNote");
  assert.equal((await get()).artifactNotes.length, 1);
  await tab("together");
  for (let i = 0; i < 4; i++) {
    await click("caseInspect", `[data-index="${i}"]`);
    await click("caseShare", `[data-index="${i}"]`);
  }
  await click("caseSolve", '[data-answer="1"]');
  await page.locator("#worldRelayNote").fill("다음 분을 위해 손거울을 남겨요.");
  await page.locator("#worldRelayTool").selectOption("mirror");
  await click("relay", '[data-door="1"]');
  assert.equal((await get()).relay.floor, 2);
  await tab("quests");
  await click("newQuest");
  await page
    .locator("#questTitle")
    .fill("<img src=x onerror=alert(1)> 가상 의뢰");
  await click("testQuest");
  assert(await b("publishQuest").isDisabled());
  for (let i = 0; i < 3; i++) await click("testInspect", `[data-index="${i}"]`);
  await click("testAnswer", '[data-answer="0"]');
  await click("closeQuest");
  await click("restoreQuest");
  assert((await page.locator("#questTitle").inputValue()).includes("<img"));
  await click("testQuest");
  for (let i = 0; i < 3; i++) await click("testInspect", `[data-index="${i}"]`);
  await click("testAnswer", '[data-answer="0"]');
  await click("publishQuest");
  assert.equal((await get()).quests.length, 1);
  assert.equal(await page.locator("#worldFields img").count(), 0);
  await click("openQuest");
  for (let i = 0; i < 3; i++)
    await click("questInspect", `[data-index="${i}"]`);
  await click("questAnswer", '[data-answer="0"]');
  assert((await get()).profile.quests.length === 1);
  await tab("journal");
  for (const answer of [1, 0, 2, 2])
    await click("plot", `[data-answer="${answer}"]`);
  assert.equal((await get()).profile.plot.length, 4);
  assert((await get()).profile.artifacts.includes("plot"));
  await page.locator("#worldSearch").fill("기록실");
  assert((await page.locator("#worldClueList").innerText()).includes("기록실"));
  const bookDownload = page.waitForEvent("download");
  await click("exportBook");
  const book = await bookDownload;
  assert.equal(book.suggestedFilename(), "moonlight-chronicle.txt");
  await book.saveAs(path.join(dir, "world-generated-chronicle.txt"));
  assert(
    fs
      .readFileSync(path.join(dir, "world-generated-chronicle.txt"), "utf8")
      .includes("가상 마을친구"),
  );
  await click("settings");
  await page.locator("#worldGhost").check();
  await page.locator("#worldMotion").check();
  await click("prefs");
  await tab("town");
  await click("visit", '[data-id="river"]');
  assert.equal(
    await page.locator("html").getAttribute("data-reduce-motion"),
    "true",
  );
  // Another member sees shared evidence, gift and asynchronous relay, but not our personal adventure state.
  const mobile = await browser.newContext({
    viewport: { width: 360, height: 800 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  await mobile.addCookies(await context.cookies());
  const second = await mobile.newPage();
  second.on("dialog", (d) => d.accept());
  await second.goto(base + "/#village");
  await chooseProfile(second, "b");
  await second.locator(".world-room").waitFor();
  await second.locator('[data-wtab="atelier"]').tap();
  await second.locator("#worldPetName").waitFor();
  assert(
    (await second.locator("#worldFields").innerText()).includes(
      "친구에게 돌아가는 별",
    ),
  );
  await second.locator('[data-wtab="together"]').tap();
  await second.locator('[data-world="caseSolve"][data-answer="1"]').tap();
  await second.waitForFunction(
    () => !document.querySelector("#worldFields").disabled,
  );
  await second.locator("summary").filter({ hasText: "인계 메모" }).click();
  assert(
    (await second.locator("#worldFields").innerText()).includes(
      "다음 분을 위해 손거울",
    ),
  );
  await second.locator('[data-world="relay"][data-door="0"]').tap();
  await second.waitForFunction(
    () => !document.querySelector("#worldFields").disabled,
  );
  await mobile.close();
  for (const t of [
    "home",
    "town",
    "mail",
    "atelier",
    "games",
    "together",
    "quests",
    "journal",
  ]) {
    await tab(t);
    for (const width of [320, 360, 393, 412, 768, 1440]) {
      await page.setViewportSize({ width, height: 850 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `overflow ${t} ${width}`,
      );
    }
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await tab("home");
  await page.screenshot({
    path: path.join(dir, "world-home-s22.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await tab("games");
  await page.screenshot({
    path: path.join(dir, "world-games-desktop.png"),
    fullPage: true,
  });
  const after = await page.evaluate(() =>
    Promise.all(
      ["archive", "training", "room", "adventure", "party"].map((p) =>
        fetch("/api/" + p).then((r) => r.json()),
      ),
    ),
  );
  assert.equal(after[0].sha, before[0].sha);
  for (let i = 1; i < after.length; i++) {
    for (const k of ["now", "clock"]) {
      delete after[i][k];
      delete before[i][k];
    }
    assert.deepEqual(after[i], before[i]);
  }
  await page.locator("#logoutButton").click();
  await page.locator("#loginScreen").waitFor({ state: "visible" });
  assert.equal(
    await page.evaluate(() => fetch("/api/world").then((r) => r.status)),
    401,
  );
  assert.equal(
    await page.evaluate(async () => {
      const { localDraft } = await import("/party-media.mjs");
      return (await localDraft("world:a")) === undefined;
    }),
    true,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await browser.close();
  server.kill();
  console.log(
    "PASS: all 24 village features, 7 native-input game completions, 24 place-time clues, 4 letters & 4 plot chapters, 5 hidden rooms, pet errand, PNG seal & gift, shared case & asynchronous corridor, tested custom quest, archive book, consent/settings, mobile touch and six widths, replay retry and isolated storage.",
  );
})().catch(async (e) => {
  console.error(e);
  await browser?.close();
  server?.kill();
  process.exit(1);
});
