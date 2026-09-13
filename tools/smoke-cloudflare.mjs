// Runs inside the authenticated CI job. Never prints passwords, cookies, keys or records.
import { readFile, appendFile } from "node:fs/promises";
import { join } from "node:path";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function verifyLiveScreens(url, cookie, memberId) {
  const { chromium } = await import("playwright");
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    const equal = cookie.indexOf("=");
    await context.addCookies([
      {
        name: cookie.slice(0, equal),
        value: cookie.slice(equal + 1),
        domain: new URL(url).hostname,
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Strict",
      },
    ]);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    let errors = 0,
      mutations = 0;
    page.on("pageerror", () => errors++);
    page.on("dialog", (d) => d.dismiss());
    await page.route("**/api/**", (route) => {
      if (route.request().method() !== "GET") {
        mutations++;
        return route.abort();
      }
      return route.continue();
    });
    await page.goto(url + "/#dashboard", { waitUntil: "networkidle" });
    await page.locator("#application").waitFor({ state: "visible" });
    await page.locator(".dash-hero").waitFor();
    await page.locator("#profileGate").waitFor({ state: "visible" });
    if (!memberId) {
      await page.locator("#profileBootstrap").waitFor();
      return;
    }
    const profile = page
      .locator("[data-profile-choice]")
      .filter({ hasText: "" });
    await profile.evaluateAll((buttons, id) => {
      const button = buttons.find((b) => b.dataset.profileChoice === id);
      if (!button) throw Error("Missing activity profile");
      button.click();
    }, memberId);
    await page.locator("#profileGateConfirm").click();
    await page.locator("#profileGate").waitFor({ state: "hidden" });
    for (const width of [1440, 360]) {
      await page.setViewportSize({ width, height: 850 });
      for (const hash of [
        "dashboard",
        "training",
        "rankings",
        "adventure",
        "party",
        "party/settings",
        "room",
        "room/mystery",
        "room/words",
        "room/art",
        "room/maze",
        ...(memberId ? ["member/" + encodeURIComponent(memberId)] : []),
      ]) {
        await page.evaluate((h) => (location.hash = h), hash);
        const selector = hash.startsWith("party")
          ? ".party-cup-grid, #partyFields .panel"
          : hash === "adventure"
            ? ".adv-missions"
            : hash.startsWith("room")
              ? {
                  room: ".room-stage",
                  "room/mystery": ".room-case-steps",
                  "room/words": "#wordInput",
                  "room/art": "#inkCanvas",
                  "room/maze": "#mazeMap",
                }[hash]
              : hash === "dashboard"
                ? ".dash-hero"
                : hash === "training"
                  ? ".game-grid"
                  : hash === "rankings"
                    ? ".ranking-toolbar"
                    : ".training-profile";
        await page.locator(selector).first().waitFor();
        if (
          hash === "training" &&
          (await page.locator(".game-card").count()) !== 7
        )
          throw new Error();
        if (
          !(await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ))
        )
          throw new Error();
      }
    }
    if (errors || mutations) throw new Error();
  } catch {
    throw new Error(
      "Read-only live dashboard/training/ranking screen check failed. No record contents were logged.",
    );
  } finally {
    if (browser) await browser.close();
  }
}

async function main() {
  const log = await readFile(
    join(process.env.RUNNER_TEMP, "theme-sa-deploy.log"),
    "utf8",
  );
  const urls =
    log.match(/https:\/\/theme-sa\.[a-z0-9-]+\.workers\.dev\b/g) || [];
  const url = urls.at(-1);
  if (!url)
    throw new Error(
      "Worker deployed, but its workers.dev URL could not be detected. Check the deployment log.",
    );
  let ready = false;
  for (let i = 0; i < 6; i++) {
    try {
      const response = await fetch(url + "/", {
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (
        response.ok &&
        (await response.text()).includes('id="sharedPassword"')
      ) {
        ready = true;
        break;
      }
    } catch {
      /* brief workers.dev propagation delay */
    }
    await delay(5000);
  }
  if (!ready)
    throw new Error(
      "Worker deployed, but homepage readiness could not be verified.",
    );
  await delay(20000); // Allow new assets, code and session secrets to reach the API edge.
  const request = async (path, method = "GET", body, cookie) => {
    const response = await fetch(url + path, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { Origin: url, "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
    let json;
    try {
      json = await response.json();
    } catch {
      throw new Error("Live API returned a non-JSON response.");
    }
    return { response, json };
  };
  const anonymous = await request("/api/archive");
  if (anonymous.response.status !== 401)
    throw new Error("Anonymous archive access did not return 401.");
  if ((await request("/api/training")).response.status !== 401)
    throw new Error("Anonymous training access did not return 401.");
  if ((await request("/api/room")).response.status !== 401)
    throw new Error("Anonymous room access was not denied.");
  if ((await request("/api/party")).response.status !== 401)
    throw new Error("Anonymous party access was not denied.");
  if ((await request("/api/adventure")).response.status !== 401)
    throw new Error("Anonymous adventure access was not denied.");
  let cookie = "",
    login;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await delay(15000);
    login = await request("/api/login", "POST", {
      password: process.env.SITE_PASSWORD,
    });
    if (!login.response.ok || !login.json.authenticated)
      throw new Error(
        "Live password login check failed (HTTP " +
          login.response.status +
          ").",
      );
    const setCookie =
      login.response.headers
        .getSetCookie()
        .find((value) => value.startsWith("__Host-theme_sa=")) || "";
    for (const expected of [
      "__Host-theme_sa=",
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
    ])
      if (!setCookie.includes(expected))
        throw new Error("Required session cookie protection was not found.");
    cookie = setCookie.split(";")[0];
    const restored = await request("/api/session", "GET", undefined, cookie);
    if (restored.response.ok && restored.json.authenticated) break;
    if (attempt === 2)
      throw new Error(
        "Live session restoration remained inconsistent after propagation grace (HTTP " +
          restored.response.status +
          ").",
      );
    console.log(
      "New deployment session is not consistent yet; waiting before a fresh read-only verification session.",
    );
  }
  let archiveStatus = "verified";
  try {
    const session = await request("/api/session", "GET", undefined, cookie);
    if (!session.response.ok || !session.json.authenticated)
      throw new Error("Live session restoration check failed.");
    const archive = await request("/api/archive", "GET", undefined, cookie);
    if (
      archive.response.status === 404 &&
      archive.json.error?.code === "ARCHIVE_NOT_INITIALIZED"
    )
      archiveStatus = "not initialized; create the first archive in the UI";
    else if (
      !archive.response.ok ||
      archive.json.state?.version !== 2 ||
      !Array.isArray(archive.json.state?.members)
    )
      throw new Error(
        "Live private archive read failed (HTTP " +
          archive.response.status +
          ", " +
          (/^[A-Z_]{1,60}$/.test(archive.json.error?.code || "")
            ? archive.json.error.code
            : "unexpected response") +
          ").",
      );
    const training = await request("/api/training", "GET", undefined, cookie);
    if (
      !training.response.ok ||
      training.json.rules !== 1 ||
      !Array.isArray(training.json.profiles) ||
      !Array.isArray(training.json.relays) ||
      "receipts" in training.json
    )
      throw new Error(
        "Live protected training read failed (HTTP " +
          training.response.status +
          ", " +
          (/^[A-Z_]{1,60}$/.test(training.json.error?.code || "")
            ? training.json.error.code
            : "unexpected response") +
          ").",
      );
    const room = await request("/api/room", "GET", undefined, cookie);
    if (
      !room.response.ok ||
      room.json.version !== 1 ||
      !Array.isArray(room.json.clues) ||
      "receipts" in room.json
    )
      throw new Error(
        "Live protected room read failed (HTTP " +
          room.response.status +
          ", " +
          (/^[A-Z_]{1,60}$/.test(room.json.error?.code || "")
            ? room.json.error.code
            : "unexpected response") +
          ").",
      );
    const party = await request("/api/party", "GET", undefined, cookie);
    if (
      !party.response.ok ||
      party.json.version !== 1 ||
      !Array.isArray(party.json.cups) ||
      !Array.isArray(party.json.presets) ||
      "receipts" in party.json
    )
      throw new Error(
        "Live protected party read failed. No production data was changed.",
      );
    const adventure = await request("/api/adventure", "GET", undefined, cookie);
    if (
      !adventure.response.ok ||
      adventure.json.version !== 1 ||
      !Array.isArray(adventure.json.runs) ||
      "receipts" in adventure.json
    )
      throw new Error(
        "Live protected adventure read failed (HTTP " +
          adventure.response.status +
          ").",
      );
    for (const payload of [
      login.json,
      session.json,
      archive.json,
      training.json,
      room.json,
      adventure.json,
      party.json,
    ])
      if (
        process.env.DATA_REPO_TOKEN &&
        JSON.stringify(payload).includes(process.env.DATA_REPO_TOKEN)
      )
        throw new Error(
          "Server credential unexpectedly appeared in an API response.",
        );
    if (archiveStatus === "verified")
      await verifyLiveScreens(url, cookie, archive.json.state.members[0]?.id);
    // Read-only smoke check: never create, edit or delete production team records in CI.
  } finally {
    await request("/api/logout", "POST", {}, cookie);
  }
  const summary = `## Cloudflare 홈페이지\n\n[기록실 열기](${url}/)\n\n- 실제 홈페이지, 비밀번호 로그인, 보호된 쿠키와 세션 확인 완료\n- 비로그인 기록·훈련 접근 차단 및 보호된 훈련 읽기 확인\n- 비공개 기록 읽기: ${archiveStatus}\n- 운영 기록을 수정하지 않는 점검입니다. 첫 저장은 홈페이지에서 확인하세요.\n- 새 배포는 이전 로그인 세션을 만료시킵니다.\n- 새 주소가 확인되기 전에는 기존 GitHub Pages를 삭제하지 마세요.\n`;
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log("LIVE_SITE_URL=" + url + "/");
  console.log(
    "Live password login, session cookie, anonymous denial archive/training/room reads and read-only desktop/mobile dashboard and room screens checked. No production records were modified.",
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
