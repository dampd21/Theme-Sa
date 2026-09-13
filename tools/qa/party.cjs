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
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout.on("data", (b) => {
      if (b.toString().includes("Synthetic extension integration server"))
        resolve();
    });
    server.stderr.on("data", (b) => process.stderr.write(b));
    server.once("exit", (c) => reject(Error("QA server exit " + c)));
  });
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    }),
    page = await context.newPage(),
    errors = [],
    external = [];
  page.setDefaultTimeout(18000);
  page.on("dialog", (d) => d.accept());
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      /^https?:/.test(r.url()) &&
      !r.url().startsWith("http://127.0.0.1:3001")
    )
      external.push(r.url());
  });
  const nav = async (hash) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForTimeout(100);
  };
  const p = (a) => page.locator(`[data-party="${a}"]`),
    tab = async (t) => {
      await page.locator(`[data-tab="${t}"]`).click();
    };
  const get = () =>
    page.evaluate(() =>
      fetch(
        "/api/party?actor=" + document.querySelector("#actorSelect").value,
      ).then((r) => r.json()),
    );
  await page.goto("http://127.0.0.1:3001", { waitUntil: "networkidle" });
  assert.equal(
    await page.evaluate(() => fetch("/api/party").then((r) => r.status)),
    401,
  );
  await page.locator("#sharedPassword").fill("Local-worker-test-password-9284");
  await page.locator("#connectButton").click();
  await page.locator("#profileGate").waitFor();
  const { emptyState, normalize } = await import("../../site/model.mjs");
  const s = emptyState();
  s.members = ["a", "b", "c"].map((id) => ({
    id,
    name: "가상 놀이친구 " + id,
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
      ["archive", "training", "room", "adventure"].map((p) =>
        fetch("/api/" + p).then((r) => r.json()),
      ),
    ),
  );
  await nav("#settings");
  await page.locator('a[href="#party/settings"]').click();
  await p("new").click();
  await page.locator("#cupTitle").fill("사진으로 만든 가상 친구들의 64강");
  const images = await page.evaluate(() =>
    Array.from({ length: 64 }, (_, i) => {
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = 640;
      const x = c.getContext("2d");
      const g = x.createLinearGradient(0, 0, 640, 640);
      g.addColorStop(0, `hsl(${(i * 37) % 360} 32% 30%)`);
      g.addColorStop(1, `hsl(${(i * 37 + 70) % 360} 40% 60%)`);
      x.fillStyle = g;
      x.fillRect(0, 0, 640, 640);
      x.fillStyle = "#f6e7b9";
      x.beginPath();
      x.arc(320, 260, 135, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = "#304438";
      x.font = "100px sans-serif";
      x.textAlign = "center";
      x.fillText(String(i + 1).padStart(2, "0"), 320, 295);
      x.font = "26px sans-serif";
      x.fillStyle = "#fff";
      x.fillText("MOONLIGHT CLUB", 320, 490);
      return c.toDataURL("image/png").split(",")[1];
    }),
  );
  await page.locator("#cupPhotos").setInputFiles(
    images.map((image, i) => ({
      name: `달빛 후보 ${String(i + 1).padStart(2, "0")}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(image, "base64"),
    })),
  );
  await page.waitForFunction(
    () =>
      document.querySelector("#cupCount")?.textContent.includes("64/64") &&
      !document.querySelector("#partyFields").disabled,
  );
  assert.equal(await page.locator(".party-candidate img").count(), 64);
  await page
    .locator("[data-candidate-name]")
    .first()
    .fill("<img src=x onerror=alert(1)>");
  await p("closeEditor").click();
  await p("restore").click();
  assert.equal(
    await page.locator("[data-candidate-name]").first().inputValue(),
    "<img src=x onerror=alert(1)>",
  );
  // Reject unsupported files while retaining existing candidates.
  await page
    .locator("[data-candidate-photo]")
    .first()
    .setInputFiles({
      name: "bad.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from('<svg onload="alert(1)"/>'),
    });
  await page.waitForFunction(
    () => !document.querySelector("#partyFields").disabled,
  );
  assert.equal(await page.locator(".party-candidate img").count(), 64);
  await page.locator("[data-candidate-name]").first().fill("달빛 후보 01");
  let lost = false;
  await page.route("**/api/party", async (route) => {
    const r = route.request();
    if (
      !lost &&
      r.method() === "POST" &&
      r.postDataJSON().action === "cupSave"
    ) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await p("saveCup").click();
  await p("retry").waitFor();
  await p("retry").click();
  await page.locator(".party-cup-card").waitFor();
  await page.unroute("**/api/party");
  let data = await get();
  assert.equal(data.cups.length, 1);
  assert.equal(data.published, 1);
  const cupId = data.cups[0].id,
    hash = data.cups[0].hash;
  const definition = await page.evaluate(
    (h) => fetch("/api/party?cup=" + h).then((r) => r.json()),
    hash,
  );
  assert.equal(definition.cup.candidates.length, 64);
  assert(
    definition.cup.candidates.every(
      (x) =>
        x.image.startsWith("data:image/jpeg;base64,") &&
        x.image.length <= 10947,
    ),
  );
  await p("start").click();
  await page.locator(".party-pick").first().waitFor();
  assert.equal(await page.locator(".party-pick img").count(), 2);
  const dir = path.join(__dirname, "../../.cache/qa");
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({
    path: path.join(dir, "party-worldcup-desktop.png"),
    fullPage: true,
  });
  for (let i = 0; i < 3; i++) {
    await page.locator(".party-pick").first().click();
    await page.waitForFunction(
      () => !document.querySelector("#partyFields").disabled,
    );
  }
  assert.equal((await get()).runs[0].picks.length, 0);
  await page.reload({ waitUntil: "networkidle" });
  await tab("cups");
  await p("resume").click();
  await page.locator(".party-pick").first().waitFor();
  assert((await page.locator(".party-match").innerText()).includes("총 3/63"));
  await p("checkpoint").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".party-save-line")
        ?.textContent.includes("공동 저장됨") &&
      !document.querySelector("#partyFields").disabled,
  );
  assert.equal((await get()).runs[0].picks.length, 3);
  // Other browser session resumes the same explicit profile checkpoint, not local state.
  const other = await browser.newContext({
    viewport: { width: 360, height: 800 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
    reducedMotion: "reduce",
  });
  await other.addCookies(await context.cookies());
  const second = await other.newPage();
  second.on("dialog", (d) => d.accept());
  await second.goto("http://127.0.0.1:3001/#party");
  await chooseProfile(second, "a");
  await second.locator('[data-party="resume"]').click();
  await second.locator(".party-pick").first().waitFor();
  assert(
    (await second.locator(".party-match").innerText()).includes("총 3/63"),
  );
  await second.locator(".party-pick").last().tap();
  await second.waitForFunction(
    () => !document.querySelector("#partyFields").disabled,
  );
  await second.locator('[data-party="checkpoint"]').tap();
  await second.waitForFunction(
    () =>
      document
        .querySelector(".party-save-line")
        ?.textContent.includes("공동 저장됨") &&
      !document.querySelector("#partyFields").disabled,
  );
  await page.locator(".party-pick").first().click();
  await page.waitForFunction(
    () => !document.querySelector("#partyFields").disabled,
  );
  const myDraft = await page.locator(".party-bracket").innerText();
  await p("checkpoint").click();
  await p("resolve").waitFor();
  await p("resolve").click();
  await p("remoteRun").waitFor();
  assert.equal(await page.locator(".party-bracket").innerText(), myDraft);
  await p("remoteRun").click();
  assert((await page.locator(".party-match").innerText()).includes("총 4/63"));
  await other.close();
  // 320px & S22-like widths, including active picks and all 64 candidates.
  for (const width of [320, 360, 393, 412, 768]) {
    await page.setViewportSize({ width, height: 850 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `overflow match ${width}`,
    );
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({
    path: path.join(dir, "party-worldcup-s22.png"),
    fullPage: true,
  });
  for (let i = 4; i < 63; i++) {
    await page.locator(".party-pick").first().click();
    await page.waitForFunction(
      () => !document.querySelector("#partyFields").disabled,
    );
  }
  await page.locator(".party-champion").waitFor();
  data = await get();
  assert.equal(data.runs[0].picks.length, 63);
  assert.equal(
    await page.locator(".party-bracket .party-list-row").count(),
    63,
  );
  await p("leaveRun").click();
  await tab("settings");
  await p("edit").click();
  await page.locator("#cupTitle").fill("수정된 제목");
  await p("saveCup").click();
  await page.locator(".party-cup-card").waitFor();
  await p("resume").click();
  await page.locator(".party-champion").waitFor();
  assert(
    (await page.locator(".party-match h2").first().innerText()).includes(
      "사진으로 만든",
    ),
  );
  await p("leaveRun").click();
  await tab("luck");
  await page.locator("#luckEntries").fill("떡볶이\n피자\n치킨\n초밥");
  await page.locator("#luckTitle").fill("우리의 간식 룰렛");
  let reauth = false;
  await page.route("**/api/party", async (route) => {
    if (
      !reauth &&
      route.request().method() === "POST" &&
      route.request().postDataJSON().action === "presetSave"
    ) {
      reauth = true;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "SESSION_REQUIRED", message: "가상 세션 만료" },
        }),
      });
    } else await route.continue();
  });
  await page.locator("#luckSave").click();
  await page.locator("#reauth").waitFor({ state: "visible" });
  await page.locator("#reauthPassword").fill("Local-worker-test-password-9284");
  await page.locator("#reauthForm button.primary").click();
  await page.locator("#reauth").waitFor({ state: "hidden" });
  await p("retry").click();
  await page.unroute("**/api/party");
  await page.waitForFunction(
    () => !document.querySelector("#partyFields").disabled,
  );
  assert.equal((await get()).presets.length, 1);
  await page.locator("#luckStart").click();
  await page.waitForFunction(() =>
    document.querySelector("#luckResult").textContent.includes("번 ·"),
  );
  const wheel = await page.locator("#luckResult").innerText();
  assert(/떡볶이|피자|치킨|초밥/.test(wheel));
  // Verify selected wedge actually lands beneath the pointer.
  const wedge = await page.evaluate(() => {
    const i = parseInt(document.querySelector("#luckResult").textContent) - 1,
      n = 4,
      angle = Number(
        document
          .querySelector("#partyWheel")
          .style.transform.match(/rotate\((.*?)deg/)[1],
      );
    return (angle + ((i + 0.5) * 360) / n) % 360;
  });
  assert(Math.abs(wedge) < 0.001);
  for (const game of [
    "ladder",
    "draw",
    "teams",
    "order",
    "dice",
    "coin",
    "bomb",
  ]) {
    await page.locator(`[data-game="${game}"]`).click();
    if (game === "coin")
      await page.locator("#luckEntries").fill("내가 고르기\n친구가 고르기");
    else if (game !== "dice")
      await page.locator("#luckEntries").fill("나래\n여울\n솔\n별");
    if (game === "ladder")
      await page
        .locator("#luckOutcomes")
        .fill("간식 고르기\n통과\n응원하기\n통과");
    if (game === "bomb") {
      await page.locator("#luckMin").fill("5");
      await page.locator("#luckMax").fill("5");
    }
    await page.locator("#luckStart").click();
    if (game === "ladder") {
      assert.equal(await page.locator("[data-trace]").count(), 4);
      await page.locator('[data-trace="0"]').click();
      assert(await page.locator("#ladderTrace").getAttribute("d"));
      await page.locator("#ladderAll").click();
      assert.equal(
        (await page.locator("#luckResult").innerText()).split("\n").length,
        4,
      );
    } else if (game === "draw") {
      await page.locator('[data-envelope="0"]').click();
      assert(await page.locator('[data-envelope="0"]').isDisabled());
      await page.locator("#drawAll").click();
      assert.equal(
        (await page.locator("#luckResult").innerText()).split("\n").length,
        4,
      );
    } else if (game === "bomb") {
      await page.locator("#bombPass").click();
      await page.waitForFunction(
        () =>
          document
            .querySelector("#luckResult")
            .textContent.includes("이번 주인공"),
        null,
        { timeout: 9000 },
      );
      assert((await page.locator("#luckResult").innerText()).includes("여울"));
    } else assert((await page.locator("#luckResult").innerText()).length > 2);
    for (const width of [320, 360, 412]) {
      await page.setViewportSize({ width, height: 850 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `overflow ${game} ${width}`,
      );
    }
  }
  await page.locator('[data-game="wheel"]').click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: path.join(dir, "party-luck-desktop.png"),
    fullPage: true,
  });
  await tab("settings");
  await p("preset").click();
  assert.equal(
    await page.locator("#luckTitle").inputValue(),
    "우리의 간식 룰렛",
  );
  assert.equal(
    await page.locator("#luckEntries").inputValue(),
    "떡볶이\n피자\n치킨\n초밥",
  );
  await tab("settings");
  await p("new").click();
  await page.locator("#cupTitle").fill("로그아웃 정리 검사");
  await page.waitForTimeout(400);
  await p("closeEditor").click();
  await page.locator("#logoutButton").click();
  await page.locator("#loginScreen").waitFor({ state: "visible" });
  assert.equal(
    await page.evaluate(async () => {
      const { localDraft } = await import("/party-media.mjs");
      return (await localDraft("editor:a")) === undefined;
    }),
    true,
  );
  assert.equal(
    await page.evaluate(() =>
      fetch("/api/party?cup=" + "a".repeat(64)).then((r) => r.status),
    ),
    401,
  );
  await page.locator("#sharedPassword").fill("Local-worker-test-password-9284");
  await page.locator("#connectButton").click();
  await chooseProfile(page, "a");
  const after = await page.evaluate(() =>
    Promise.all(
      ["archive", "training", "room", "adventure"].map((p) =>
        fetch("/api/" + p).then((r) => r.json()),
      ),
    ),
  );
  assert.equal(after[0].sha, before[0].sha);
  for (let i = 1; i < after.length; i++) {
    delete after[i].now;
    delete before[i].now;
    delete after[i].clock;
    delete before[i].clock;
    assert.deepEqual(after[i], before[i]);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await browser.close();
  server.kill();
  console.log(
    "PASS: 64 uploaded/compressed images; shared edits & immutable run snapshot; failed-response retry; local/cloud/cross-browser resume; 63 native choices; all 8 games; ladder trace and roulette pointer; 320–1440 widths; draft logout cleanup; no external assets or existing-record changes.",
  );
})().catch(async (e) => {
  console.error(e);
  await browser?.close();
  server?.kill();
  process.exit(1);
});
