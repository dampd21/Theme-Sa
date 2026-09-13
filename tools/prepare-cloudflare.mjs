import { validateParty } from "../worker/party.mjs";
import { validateAdventure } from "../worker/adventure.mjs";
import { validateRoom } from "../worker/room.mjs";
// CI-only preparation. All actual secrets are written outside the repository.
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalize } from "../site/model.mjs";
import { validateTrainingStore } from "../worker/training.mjs";

async function main() {
  const required = [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "SITE_PASSWORD",
    "DATA_REPO_TOKEN",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length)
    throw new Error(
      "Setup needed: configure " +
        missing.join(", ") +
        " in GitHub Actions settings. No Cloudflare deployment was made.",
    );
  if (!/^[a-f0-9]{32}$/i.test(process.env.CLOUDFLARE_ACCOUNT_ID))
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID must be your 32-character account ID.",
    );
  if (/^(ghp_|github_pat_)/.test(process.env.CLOUDFLARE_API_TOKEN))
    throw new Error(
      "CLOUDFLARE_API_TOKEN must be a Cloudflare token, not a GitHub token.",
    );
  const password = process.env.SITE_PASSWORD,
    token = process.env.DATA_REPO_TOKEN;
  if (password.trim().length < 5 || password.length > 200)
    throw new Error(
      "SITE_PASSWORD must be 5–200 characters. Longer, unique passwords are recommended.",
    );
  if (!/^github_pat_[A-Za-z0-9_]{20,}$/.test(token) || token.length > 255)
    throw new Error(
      "DATA_REPO_TOKEN must be a dedicated Fine-grained token for the private data repository.",
    );
  if (!process.env.RUNNER_TEMP)
    throw new Error(
      "RUNNER_TEMP is required so runtime secrets stay outside the repository.",
    );
  const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
  for (const key of [
    "ARCHIVE_OWNER",
    "ARCHIVE_REPO",
    "ARCHIVE_BRANCH",
    "ARCHIVE_PATH",
  ])
    if (process.env[key]?.trim()) config.vars[key] = process.env[key].trim();
  const {
    ARCHIVE_OWNER: owner,
    ARCHIVE_REPO: repo,
    ARCHIVE_BRANCH: branch,
    ARCHIVE_PATH: path,
  } = config.vars;
  if (
    !/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(owner) ||
    !/^[A-Za-z0-9_.-]{1,100}$/.test(repo) ||
    [".", ".."].includes(repo)
  )
    throw new Error("Archive repository coordinates are invalid.");
  if (
    !branch ||
    branch.length > 150 ||
    /[\s?#\\]/.test(branch) ||
    branch.includes("..")
  )
    throw new Error("ARCHIVE_BRANCH is invalid.");
  if (
    !path.endsWith(".json") ||
    path.length > 200 ||
    path.split("/").some((x) => !x || x === "." || x === "..") ||
    /[\x00-\x1f?#\\]/.test(path)
  )
    throw new Error("ARCHIVE_PATH is invalid.");
  const response = await fetch(
    "https://api.github.com/repos/" +
      encodeURIComponent(owner) +
      "/" +
      encodeURIComponent(repo),
    {
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw new Error(
      "GitHub data repository access check failed (HTTP " +
        response.status +
        "). Check DATA_REPO_TOKEN.",
    );
  const data = await response.json();
  if (
    !data.private ||
    data.full_name?.toLowerCase() !== (owner + "/" + repo).toLowerCase()
  )
    throw new Error(
      "The configured data repository must be the expected PRIVATE repository.",
    );
  // Read/validate the real record before updating code; preserve exact bytes privately.
  // No records or credential values are logged or written into source/artifacts.
  const apiRoot =
    "https://api.github.com/repos/" +
    encodeURIComponent(owner) +
    "/" +
    encodeURIComponent(repo);
  const git = async (route, method = "GET", body) =>
    fetch(apiRoot + route, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
  const contentPath =
    "/contents/" + path.split("/").map(encodeURIComponent).join("/");
  const current = await git(contentPath + "?ref=" + encodeURIComponent(branch));
  if (current.status === 404) {
    const branchCheck = await git("/branches/" + encodeURIComponent(branch));
    if (!branchCheck.ok)
      throw new Error(
        "Archive branch access could not be verified. No deployment made.",
      );
    console.log(
      "No current archive file; first initialization remains a user action.",
    );
  } else {
    if (!current.ok)
      throw new Error(
        "Current private archive could not be read (HTTP " +
          current.status +
          "). No deployment made.",
      );
    const file = await current.json();
    if (
      file.type !== "file" ||
      file.encoding !== "base64" ||
      file.size > 900000 ||
      !/^[a-f0-9]{40,64}$/.test(file.sha || "")
    )
      throw new Error(
        "Current archive format is unsupported. No deployment made.",
      );
    let original;
    try {
      original = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          Buffer.from(file.content, "base64"),
        ),
      );
      normalize(original);
    } catch {
      throw new Error(
        "Current archive does not pass the new schema compatibility check. Original data is unchanged; no deployment made.",
      );
    }
    const suffix = original.version === 1 ? ".pre-v2-" : ".before-update-";
    const backupPath = contentPath + suffix + file.sha + ".json";
    const existing = await git(
      backupPath + "?ref=" + encodeURIComponent(branch),
    );
    if (existing.status === 404) {
      const result = await git(backupPath, "PUT", {
        message: "Back up private archive before extension deployment",
        content: file.content.replace(/\s/g, ""),
        branch,
      });
      if (!result.ok)
        throw new Error(
          "Private pre-deployment backup failed (HTTP " +
            result.status +
            "). Check Contents write permission; no deployment made.",
        );
      const saved = await result.json();
      if (saved.content?.sha !== file.sha)
        throw new Error(
          "Private backup verification failed. No deployment made.",
        );
    } else if (!existing.ok || (await existing.json()).sha !== file.sha)
      throw new Error(
        "Existing private backup does not match the current record. No deployment made.",
      );
    console.log(
      "Existing archive is compatible. Exact private backup verified; current team data was not edited.",
    );
  }
  // Training records are independent: never initialize or reset them during deployment.
  const trainingPath = contentPath + ".training.json";
  const trainingResponse = await git(
    trainingPath + "?ref=" + encodeURIComponent(branch),
  );
  if (trainingResponse.status === 404)
    console.log(
      "No training file yet; first successful result will create it. No training data was initialized.",
    );
  else {
    if (!trainingResponse.ok)
      throw new Error("Private training read failed; no deployment made.");
    const file = await trainingResponse.json();
    try {
      if (
        file.type !== "file" ||
        file.encoding !== "base64" ||
        file.size > 900000 ||
        !/^[a-f0-9]{40,64}$/.test(file.sha || "")
      )
        throw new Error();
      const bytes = Buffer.from(file.content, "base64");
      if (bytes.length > 900000) throw new Error();
      validateTrainingStore(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      );
    } catch {
      throw new Error(
        "Training schema compatibility check failed. Existing training data is unchanged; no deployment made.",
      );
    }
    const backup = trainingPath + ".before-update-" + file.sha + ".json";
    const existing = await git(backup + "?ref=" + encodeURIComponent(branch));
    if (existing.status === 404) {
      const saved = await git(backup, "PUT", {
        message: "Back up private training before deployment",
        content: file.content.replace(/\s/g, ""),
        branch,
      });
      if (!saved.ok || (await saved.json()).content?.sha !== file.sha)
        throw new Error(
          "Exact private training backup failed; no deployment made.",
        );
    } else if (!existing.ok || (await existing.json()).sha !== file.sha)
      throw new Error("Private training backup mismatch; no deployment made.");
    console.log(
      "Existing training schema and exact private backup verified. Training records were not edited.",
    );
  }
  // Room records are independent: never initialize or reset them during deployment.
  const roomPath = contentPath + ".room.json";
  const roomResponse = await git(
    roomPath + "?ref=" + encodeURIComponent(branch),
  );
  if (roomResponse.status === 404)
    console.log(
      "No room file yet; first shared interaction will create it. No room data was initialized.",
    );
  else {
    if (!roomResponse.ok)
      throw new Error("Private room read failed; no deployment made.");
    const file = await roomResponse.json();
    try {
      if (
        file.type !== "file" ||
        file.encoding !== "base64" ||
        file.size > 800000 ||
        !/^[a-f0-9]{40,64}$/.test(file.sha || "")
      )
        throw new Error();
      const bytes = Buffer.from(file.content, "base64");
      if (bytes.length > 800000) throw new Error();
      validateRoom(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      );
    } catch {
      throw new Error(
        "Room schema compatibility check failed. Existing room data is unchanged; no deployment made.",
      );
    }
    const backup = roomPath + ".before-update-" + file.sha + ".json";
    const existing = await git(backup + "?ref=" + encodeURIComponent(branch));
    if (existing.status === 404) {
      const saved = await git(backup, "PUT", {
        message: "Back up private room before deployment",
        content: file.content.replace(/\s/g, ""),
        branch,
      });
      if (!saved.ok || (await saved.json()).content?.sha !== file.sha)
        throw new Error(
          "Exact private room backup failed; no deployment made.",
        );
    } else if (!existing.ok || (await existing.json()).sha !== file.sha)
      throw new Error("Private room backup mismatch; no deployment made.");
    console.log(
      "Existing room schema and exact private backup verified. Room records were not edited.",
    );
  }
  // Adventure records are independent: never initialize or reset them during deployment.
  const adventurePath = contentPath + ".adventure.json";
  const adventureResponse = await git(
    adventurePath + "?ref=" + encodeURIComponent(branch),
  );
  if (adventureResponse.status === 404)
    console.log(
      "No adventure file yet; first shared interaction will create it. No adventure data was initialized.",
    );
  else {
    if (!adventureResponse.ok)
      throw new Error("Private adventure read failed; no deployment made.");
    const file = await adventureResponse.json();
    try {
      if (
        file.type !== "file" ||
        file.encoding !== "base64" ||
        file.size > 800000 ||
        !/^[a-f0-9]{40,64}$/.test(file.sha || "")
      )
        throw new Error();
      const bytes = Buffer.from(file.content, "base64");
      if (bytes.length > 800000) throw new Error();
      validateAdventure(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      );
    } catch {
      throw new Error(
        "Adventure schema compatibility check failed. Existing adventure data is unchanged; no deployment made.",
      );
    }
    const backup = adventurePath + ".before-update-" + file.sha + ".json";
    const existing = await git(backup + "?ref=" + encodeURIComponent(branch));
    if (existing.status === 404) {
      const saved = await git(backup, "PUT", {
        message: "Back up private adventure before deployment",
        content: file.content.replace(/\s/g, ""),
        branch,
      });
      if (!saved.ok || (await saved.json()).content?.sha !== file.sha)
        throw new Error(
          "Exact private adventure backup failed; no deployment made.",
        );
    } else if (!existing.ok || (await existing.json()).sha !== file.sha)
      throw new Error("Private adventure backup mismatch; no deployment made.");
    console.log(
      "Existing adventure schema and exact private backup verified. Adventure records were not edited.",
    );
  }
  const partyPath = contentPath + ".party.json";
  const partyResponse = await git(
    partyPath + "?ref=" + encodeURIComponent(branch),
  );
  if (partyResponse.status === 404)
    console.log(
      "No party file yet; read-only deployment does not initialize cups or games.",
    );
  else {
    if (!partyResponse.ok)
      throw new Error("Private party read failed; no deployment made.");
    const file = await partyResponse.json();
    try {
      if (
        file.type !== "file" ||
        file.encoding !== "base64" ||
        file.size > 800000 ||
        !/^[a-f0-9]{40,64}$/.test(file.sha || "")
      )
        throw new Error();
      const bytes = Buffer.from(file.content.replace(/\s/g, ""), "base64");
      if (bytes.length > 800000) throw new Error();
      validateParty(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      );
    } catch {
      throw new Error(
        "Party schema compatibility failed. Existing records are unchanged; no deployment made.",
      );
    }
    const backup = partyPath + ".before-update-" + file.sha + ".json";
    const old = await git(backup + "?ref=" + encodeURIComponent(branch));
    if (old.status === 404) {
      const saved = await git(backup, "PUT", {
        message: "Back up private party before deployment",
        content: file.content.replace(/\s/g, ""),
        branch,
      });
      if (!saved.ok || (await saved.json()).content?.sha !== file.sha)
        throw new Error(
          "Exact private party backup failed; no deployment made.",
        );
    } else if (!old.ok || (await old.json()).sha !== file.sha)
      throw new Error("Private party backup mismatch; no deployment made.");
    console.log(
      "Existing party schema and exact private backup verified. Immutable photo definitions were not edited.",
    );
  }
  await writeFile(
    "wrangler.jsonc",
    JSON.stringify(config, null, 2) + "\n",
    "utf8",
  );
  const secrets = {
    SITE_PASSWORD: password,
    DATA_REPO_TOKEN: token,
    SESSION_SECRET: randomBytes(48).toString("base64url"),
  };
  await writeFile(
    join(process.env.RUNNER_TEMP, "theme-sa-runtime-secrets.json"),
    JSON.stringify(secrets),
    { encoding: "utf8", mode: 0o600 },
  );
  // New signing material intentionally expires prior sessions on a new deployment.
  console.log(
    "Cloudflare runtime settings prepared. Secret values are not printed or copied into public assets.",
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
