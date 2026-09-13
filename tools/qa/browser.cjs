const { chooseProfile } = require("./profile.cjs");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const shots = path.resolve(__dirname, "../../.cache/qa");
fs.mkdirSync(shots, { recursive: true });
let server;
process.on("exit", () => server?.kill());
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = "http://127.0.0.1:3001";
(async () => {
  if (process.env.THEME_SA_QA_EXTERNAL !== "1")
    await new Promise((resolve, reject) => {
      server = spawn(process.execPath, [path.join(__dirname, "server.mjs")], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      server.stdout.on("data", (b) => {
        if (b.toString().includes("Synthetic extension integration server"))
          resolve();
      });
      server.stderr.on("data", (b) => process.stderr.write(b));
      server.once("exit", (code) =>
        reject(new Error("QA server exited: " + code)),
      );
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
  page.setDefaultTimeout(12000);
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
  for (const width of [320, 360, 412, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Login overflow " + width,
    );
  }
  await page.locator("#sharedPassword").fill("Local-worker-test-password-9284");
  await page.locator("#connectButton").click();
  await page.locator("#application").waitFor({ state: "visible" });
  async function nav(hash) {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForFunction((h) => location.hash === "#" + h, hash);
    await page.waitForTimeout(60);
  }
  async function save() {
    await page.locator("#editorForm button[type=submit]").click();
    await page.locator("#review").waitFor({ state: "visible" });
    await page.locator("#confirmSave").click();
    try {
      await page.locator("#review").waitFor({ state: "hidden" });
    } catch (e) {
      throw new Error(
        "Save failed: " + (await page.locator("#saveError").innerText()),
      );
    }
  }
  async function data() {
    return page.evaluate(() => fetch("/api/archive").then((r) => r.json()));
  }
  await nav("members");
  await page.locator("#profileBootstrap").click();
  await page.locator("[name=name]").fill("가상 팀장");
  await page.locator("[name=codeName]").fill("월영");
  await page.locator("[name=intro]").fill("차분한 결계 담당");
  await page.locator("[name=squad]").fill("결계조");
  await page.locator("[name=position]").fill("탐색");
  await page.locator("#addTalent").click();
  await page.locator("[name=talentName]").fill("정화");
  await page.locator("[name=talentCategory]").selectOption("정화");
  await page.locator("[name=talentEffect]").fill("창작 설정의 빛");
  await save();
  let remote = await data();
  const leader = remote.state.leaderId;
  assert.equal(remote.state.version, 2);
  assert.equal(remote.state.members.length, 1);
  assert.equal(remote.state.members[0].codeName, "월영");
  await chooseProfile(page, leader);
  await page.locator("#actorSelect").selectOption(leader);
  await page.locator("[data-copy-member]").click();
  await page.locator("[name=name]").fill("가상 부팀장");
  await page.locator('[name=roleIds][value="role-deputy"]').check();
  await save();
  remote = await data();
  const deputy = remote.state.members.find((m) => m.id !== leader).id;
  assert.equal(remote.state.leaderId, leader);
  await page.locator(`[data-favorite="${deputy}"]`).click();
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`[data-favorite="${id}"]`)
        ?.getAttribute("aria-pressed") === "true",
    deputy,
  );
  await nav("organization");
  await page.locator("#addRole").click();
  await page.locator("[name=name]").fill("기록관");
  await page.locator("[name=parentId]").selectOption("role-deputy");
  await save();
  assert((await page.locator(".org-tree").innerText()).includes("기록관"));
  await nav("settings");
  await page.locator("#addField").click();
  await page.locator("[name=label]").fill("수호령");
  await save();
  remote = await data();
  const fieldId = remote.state.customFields[0].id;
  await nav("member/" + deputy);
  await page.locator("#detailEdit").click();
  await page.locator(`[name="custom-${fieldId}"]`).fill("가상 여우");
  await page.locator("[name=position]").fill("치료");
  await save();
  assert((await page.locator("#view").innerText()).includes("가상 여우"));
  assert(await page.locator(".radar").count());
  const { CATALOG } = await import(
    pathToFileURL(path.resolve(__dirname, "../../site/catalog.mjs")).href
  );
  for (const [key, spec] of Object.entries(CATALOG)) {
    await nav(key);
    await page.locator("#addRecord").click();
    await page.locator("[name=title]").fill("가상 " + spec.label);
    if (await page.locator("[name=body]").count())
      await page
        .locator("[name=body]")
        .fill("가상 내용 <script>window.pwned=true</script>");
    if (key === "notices") await page.locator("[name=pinned]").check();
    if (key === "events" || key === "timeline")
      await page.locator("[name=date]").fill("2026-09-20");
    if (await page.locator("[name=participants]").count())
      await page.locator(`[name=participants][value="${deputy}"]`).check();
    if (await page.locator("[name=ownerId]").count())
      await page.locator("[name=ownerId]").selectOption(leader);
    if (key === "missions") {
      await page
        .locator("summary")
        .filter({ hasText: "참여자별 역할 설정" })
        .click();
      await page.locator(`[name="assignment-${deputy}"]`).fill("의료 지원");
    }
    if (key === "relationships") {
      await page.locator("[name=fromId]").selectOption(leader);
      await page.locator("[name=toId]").selectOption(deputy);
    }
    if (key === "polls")
      await page.locator("[name=options]").fill("달빛 모임\n숲속 모임");
    if (await page.locator("[name=items]").count())
      await page.locator("[name=items]").fill("장비 점검\n기록 확인");
    await save();
    remote = await data();
    assert.equal(remote.state[key].length, 1, key);
    console.log("Created and saved:", key);
  }
  remote = await data();
  const notice = remote.state.notices[0].id,
    poll = remote.state.polls[0].id,
    checklist = remote.state.checklists[0].id,
    mission = remote.state.missions[0].id;
  await nav("notices/" + notice);
  await page.locator("#acknowledge").click();
  await page.waitForFunction(() =>
    document.querySelector("#acknowledge")?.textContent.includes("취소"),
  );
  await page.locator("#reaction").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#reaction")?.getAttribute("aria-pressed") ===
      "true",
  );
  await page.locator("#commentText").fill("가상 댓글");
  await page.locator("#commentForm button").click();
  await page.locator(".comment").waitFor();
  assert((await page.locator(".comment").innerText()).includes("가상 댓글"));
  await nav("polls/" + poll);
  await page.locator("[data-vote]").first().click();
  await page.locator(".poll-option.selected").waitFor();
  await page.locator("[data-vote]").nth(1).click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".poll-option.selected").length === 1 &&
      document
        .querySelectorAll(".poll-option")[1]
        .classList.contains("selected"),
  );
  assert.equal((await data()).state.polls[0].votes.length, 1);
  await nav("checklists/" + checklist);
  await page.locator("[data-item]").first().click();
  await page.waitForFunction(
    () => document.querySelector("[data-item]")?.checked,
  );
  await nav("missions/" + mission);
  await page.locator("#recordEdit").click();
  await page.locator("[name=status]").selectOption("진행 중");
  await save();
  assert((await data()).state.missions[0].status === "진행 중");
  // Internal wiki references and unsaved editor cancellation.
  remote = await data();
  const worldId = remote.state.world[0].id;
  await nav("world/" + worldId);
  await page.locator("#recordEdit").click();
  await page
    .locator("[name=body]")
    .fill("연결 [[가상 팀 세계관]] <script>window.pwned=true</script>");
  await save();
  assert.equal(
    await page.locator(".wiki-link").getAttribute("href"),
    "#world/" + worldId,
  );
  await nav("member/" + leader);
  await page.locator("#detailEdit").click();
  await page.locator("[name=intro]").fill("저장하지 않고 취소할 문장");
  await page.locator("#editor [data-close]").first().click();
  assert.notEqual(
    (await data()).state.members.find((m) => m.id === leader).intro,
    "저장하지 않고 취소할 문장",
  );

  // Expired-session draft must remain intact, then save with original SHA.
  await nav("member/" + leader);
  await page.locator("#detailEdit").click();
  await page.locator("[name=intro]").fill("로그인 만료 후에도 보존되는 초안");
  await context.clearCookies();
  await page.locator("#editorForm button[type=submit]").click();
  await page.locator("#confirmSave").click();
  await page.locator("#reauth").waitFor({ state: "visible" });
  assert.equal(
    await page.locator("[name=intro]").inputValue(),
    "로그인 만료 후에도 보존되는 초안",
  );
  await page.locator("#reauthPassword").fill("Local-worker-test-password-9284");
  await page
    .locator("#reauthForm button[type=submit], #reauthForm button.primary")
    .click();
  await page.locator("#reauth").waitFor({ state: "hidden" });
  await page.locator("#confirmSave").click();
  await page.locator("#review").waitFor({ state: "hidden" });
  // Another client saves first: never silently overwrite it.
  const ctx2 = await browser.newContext();
  const login2 = await ctx2.request.post(base + "/api/login", {
    headers: { Origin: base },
    data: { password: "Local-worker-test-password-9284" },
  });
  const cookie2 = login2.headers()["set-cookie"].split(";")[0];
  let other = await (
    await ctx2.request.get(base + "/api/archive", {
      headers: { Cookie: cookie2 },
    })
  ).json();
  await page.locator("#detailEdit").click();
  await page.locator("[name=intro]").fill("충돌 시 보존할 초안");
  other.state.teamName = "동시 변경된 팀";
  let rr = await ctx2.request.put(base + "/api/archive", {
    headers: { Origin: base, Cookie: cookie2 },
    data: { state: other.state, sha: other.sha, clientVersion: 2 },
  });
  assert.equal(rr.status(), 200);
  await page.locator("#editorForm button[type=submit]").click();
  await page.locator("#confirmSave").click();
  await page.waitForFunction(() =>
    document.querySelector("#saveError")?.textContent.includes("먼저 저장"),
  );
  assert.equal(
    await page.locator("[name=intro]").inputValue(),
    "충돌 시 보존할 초안",
  );
  await page.locator("#review [data-close]").first().click();
  await page.locator("#editor [data-close]").first().click();
  await page.locator("#refreshButton").click();
  await page.waitForFunction(
    () => document.querySelector("#brandName").textContent === "동시 변경된 팀",
  );
  await nav("member/" + deputy);
  await page.locator("#detailDelete").click();
  await page.locator("#confirmSave").click();
  await page.locator("#review").waitFor({ state: "hidden" });
  await nav("trash");
  assert(await page.locator("[data-restore]").count());
  await page.locator("[data-restore]").click();
  await page.locator("#confirmSave").click();
  await page.locator("#review").waitFor({ state: "hidden" });
  assert.equal((await data()).state.members.length, 2);
  await nav("members");
  await page.evaluate(() => (document.getElementById("toast").hidden = true));
  await page.screenshot({
    path: path.join(shots, "extension-desktop.png"),
    fullPage: true,
  });
  for (const width of [320, 360, 384, 412, 780, 1024, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    for (const hash of [
      "members",
      "organization",
      "events",
      "member/" + leader,
      "polls/" + poll,
      "settings",
      "activity",
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
  await page.setViewportSize({ width: 360, height: 780 });
  await nav("members");
  await page.evaluate(() => (document.getElementById("toast").hidden = true));
  await page.screenshot({
    path: path.join(shots, "extension-s22.png"),
    fullPage: true,
  });
  await nav("organization");
  await page.screenshot({
    path: path.join(shots, "extension-organization-s22.png"),
    fullPage: true,
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#application").waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => document.cookie), "");
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert((await data()).state.activity.length > 20);
  await page.locator("#logoutButton").click();
  await page.locator("#loginScreen").waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => sessionStorage.length), 0);
  console.log(
    "PASS: extensions CRUD, migration, roles/org, custom fields, favorites, detail/radar, all collections, votes, comments, acknowledgements, tasks, reauth drafts, two-client conflicts, trash restore, seven widths, reload, XSS/CSP/token boundary, logout.",
  );
  await ctx2.close();
  await browser.close();
  server?.kill();
})().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
