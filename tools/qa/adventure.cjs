const { chromium } = require("playwright"),
  { spawn } = require("node:child_process"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  fs = require("node:fs");
const { chooseProfile } = require("./profile.cjs");
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
    server.once("exit", (c) => reject(Error("QA server exited " + c)));
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
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  page.on("request", (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith(base))
      external.push(r.url());
  });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("#sharedPassword").fill("Local-worker-test-password-9284");
  await page.locator("#connectButton").click();
  await page.locator("#profileGate").waitFor({ state: "visible" });
  assert(await page.locator("#profileGateConfirm").isDisabled());
  assert(await page.locator("#profileBootstrap").isVisible());
  await page.keyboard.press("Escape");
  assert(await page.locator("#profileGate").isVisible());
  const { emptyState, normalize } = await import("../../site/model.mjs");
  const state = emptyState();
  state.teamName = "달빛 원정대 · 가상 검증";
  state.members = ["a", "b", "c"].map((id) => ({
    id,
    name: "가상 탐험가 " + id,
    stats: [100, 100, 100, 100, 100, 100],
    abilities: [],
  }));
  state.leaderId = "a";
  const seed = await page.evaluate(async (state) => {
    const old = await (await fetch("/api/archive")).json();
    return (
      await fetch("/api/archive", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, sha: old.sha, clientVersion: 2 }),
      })
    ).json();
  }, normalize(state));
  await page.reload({ waitUntil: "networkidle" });
  await chooseProfile(page, "a");
  assert.equal(await page.locator(".dash-seal svg").count(), 1);
  assert.equal(await page.locator(".dash-seal strong").count(), 0);
  async function nav(hash) {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForTimeout(80);
  }
  async function read() {
    return page.evaluate(() =>
      fetch(
        "/api/adventure?actor=" + document.querySelector("#actorSelect").value,
      ).then((r) => r.json()),
    );
  }
  async function save(sel) {
    const result = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/adventure" &&
        r.request().method() === "POST",
    );
    result.catch(() => {});
    await page.locator(sel).click();
    const response = await result,
      j = await response.json();
    assert.equal(response.status(), 200, JSON.stringify(j));
    await page.waitForFunction(
      () =>
        !document
          .querySelector(".adv-status")
          ?.textContent.includes("저장하는 중"),
    );
    return j;
  }
  async function create(c, mode = "solo") {
    await nav("adventure");
    await page.locator('[data-campaign="' + c + '"]').click();
    await page.locator("#advMode").selectOption(mode);
    await save("[data-adv=create]");
    await page.locator(".adv-location").waitFor();
    return (await read()).runs.at(-1).id;
  }
  async function solve(c) {
    const answers = {
      train: ["star-ship-bell", "west-flower", "promise-third"],
      library: ["moon-wave-bird"],
      theater: ["goodbye"],
      market: ["blank"],
      observatory: ["north-stop"],
      inn: ["hello-key"],
    };
    for (const [i, answer] of answers[c].entries()) {
      const b = i * 3 + 1;
      await save('[data-to="' + b + '"]');
      assert(await page.locator("[data-adv=solve]").first().isDisabled());
      for (const side of [1, 2]) {
        await save('[data-to="' + (b + side) + '"]');
        await save("[data-adv=inspect]");
        await save('[data-to="' + b + '"]');
      }
      await save("[data-adv=hint]");
      await save('[data-answer="' + answer + '"]');
      await save('[data-to="0"]');
    }
  }
  const train = await create("train");
  await page
    .locator("#advNote")
    .fill("창밖의 신호를 먼저 살펴보세요. <img src=x onerror=alert(1)>");
  await save("[data-adv=note]");
  assert.equal(await page.locator(".adv-note img").count(), 0);
  fs.mkdirSync(path.join(__dirname, "../../.cache/qa"), { recursive: true });
  await page.screenshot({
    path: path.join(__dirname, "../../.cache/qa/adventure-train.png"),
    fullPage: true,
  });
  await solve("train");
  await save("[data-choice=release]");
  assert(await page.locator(".adv-ending").isVisible());
  assert.equal((await read()).runs.find((r) => r.id === train).found.length, 6);
  for (const c of ["library", "theater", "market", "observatory", "inn"]) {
    await create(c);
    await solve(c);
    await save("[data-choice=restore]");
    assert(await page.locator(".adv-ending").isVisible());
  }
  const shared = await create("library", "shared");
  await page.locator("#actorSelect").selectOption("b");
  await page.locator("[data-adv=joinLaunch]").click();
  await save("[data-adv=join]");
  await solve("library");
  await save("[data-choice=keep]");
  assert.equal(
    (await read()).runs.find((r) => r.id === shared).status,
    "active",
  );
  await page.locator("#actorSelect").selectOption("a");
  await page.locator("[data-choice=keep]").waitFor();
  await save("[data-choice=keep]");
  assert.equal(
    (await read()).runs.find((r) => r.id === shared).status,
    "returned",
  );
  // Lost committed response: the exact retry must append only one note.
  const pendingRun = await create("inn");
  let lost = false;
  await page.route("**/api/adventure", async (route) => {
    if (route.request().method() === "POST" && !lost) {
      lost = true;
      await route.fetch();
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "QA_LOST", message: "가상 응답 손실" },
        }),
      });
    }
    return route.continue();
  });
  await page.locator("#advNote").fill("같은 요청 한 번만");
  await page.locator("[data-adv=note]").click();
  await page.locator("#advRetry").waitFor();
  await save("#advRetry");
  assert.equal(
    (await read()).runs.find((r) => r.id === pendingRun).notes.length,
    1,
  );
  await page.unroute("**/api/adventure");
  await page.locator("#advNote").fill("유지할 초안");
  page.removeAllListeners("dialog");
  page.on("dialog", (d) => d.dismiss());
  await nav("members");
  assert.equal(
    await page.evaluate(() => location.hash),
    "#adventure/" + pendingRun,
  );
  assert.equal(await page.locator("#advNote").inputValue(), "유지할 초안");
  await page.locator("#advNote").fill("");
  page.removeAllListeners("dialog");
  page.on("dialog", (d) => d.accept());
  for (const width of [320, 360, 384, 412, 780, 1024, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    for (const hash of [
      "adventure",
      "adventure/" + train,
      "adventure/" + pendingRun,
      "dashboard",
      "training/sense",
      "rankings",
    ]) {
      await nav(hash);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Overflow " + width + " " + hash,
      );
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await nav("adventure");
  await page.screenshot({
    path: path.join(__dirname, "../../.cache/qa/adventure-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 360, height: 780 });
  await nav("adventure/" + pendingRun);
  await page.screenshot({
    path: path.join(__dirname, "../../.cache/qa/adventure-s22.png"),
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
  await mobile.locator('[data-profile-choice="a"]').tap();
  await mobile.locator("#profileGateConfirm").tap();
  await mobile.evaluate((h) => (location.hash = h), "adventure/" + pendingRun);
  await mobile.locator('[data-to="1"]').tap();
  await mobile.locator('[data-to="2"]').waitFor();
  await mobile.locator('[data-to="2"]').tap();
  await mobile.locator("[data-adv=inspect]").tap();
  await mobile.waitForFunction(() =>
    document.querySelector(".adv-evidence article"),
  );
  assert(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await phone.close();
  const final = await page.evaluate(() =>
    fetch("/api/archive").then((r) => r.json()),
  );
  assert.equal(final.sha, seed.sha);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await nav("dashboard");
  await page.locator("#logoutButton").click();
  await page.locator("#sharedPassword").fill("Local-worker-test-password-9284");
  await page.locator("#connectButton").click();
  await page.locator("#profileGate").waitFor({ state: "visible" });
  assert(await page.locator("#profileGateConfirm").isDisabled());
  await chooseProfile(page, "c");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator("#actorSelect").inputValue(), "c");
  assert(!(await page.locator("#profileGate").isVisible()));
  await page.locator("#logoutButton").click();
  await page.locator("#loginScreen").waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => sessionStorage.length), 0);
  await browser.close();
  server.kill();
  console.log(
    "PASS: mandatory profile gate, bootstrap, original seal, all six solo adventures, three train stations, shared joining/voting, real mobile taps, exact retry, drafts, seven widths, resume, no archive mutation or script errors.",
  );
})().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
