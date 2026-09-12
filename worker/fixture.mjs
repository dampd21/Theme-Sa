// Synthetic integration fixture. Never used by the production Worker.
import { createHash } from "node:crypto";
import { emptyState } from "../site/model.mjs";
export function fixture(initial = emptyState()) {
  const env = {
    SITE_PASSWORD: "Local-worker-test-password-9284",
    DATA_REPO_TOKEN: "github_pat_" + "m".repeat(48),
    SESSION_SECRET: "test-session-secret-" + "r".repeat(48),
    ARCHIVE_OWNER: "test-owner",
    ARCHIVE_REPO: "private-data",
    ARCHIVE_BRANCH: "main",
    ARCHIVE_PATH: "data/team.json",
    SESSION_HOURS: "12",
    LOGIN_RATE_LIMITER: { limit: async () => ({ success: true }) },
    API_RATE_LIMITER: { limit: async () => ({ success: true }) },
  };
  const files = new Map(),
    calls = [];
  let readOnly = false,
    privateRepo = true;
  const put = (path, content) => {
    const sha = createHash("sha1").update(content).digest("hex");
    files.set(path, { sha, content });
    return sha;
  };
  if (initial) put("data/team.json", JSON.stringify(initial, null, 2) + "\n");
  const response = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  const fetcher = async (url, options = {}) => {
    const u = new URL(url);
    if (
      u.hostname !== "api.github.com" ||
      options.headers.Authorization !== "Bearer " + env.DATA_REPO_TOKEN ||
      options.redirect !== "manual"
    )
      throw new Error("Unexpected upstream request");
    calls.push({ path: u.pathname, method: options.method || "GET" });
    if (u.pathname === "/repos/test-owner/private-data")
      return response({
        private: privateRepo,
        full_name: "test-owner/private-data",
      });
    if (u.pathname.includes("/branches/")) return response({ name: "main" });
    const prefix = "/repos/test-owner/private-data/contents/";
    if (!u.pathname.startsWith(prefix)) return response({}, 404);
    const path = decodeURIComponent(u.pathname.slice(prefix.length)),
      old = files.get(path);
    if (options.method === "PUT") {
      if (readOnly) return response({}, 403);
      const data = JSON.parse(options.body);
      if ((old && data.sha !== old.sha) || (!old && data.sha))
        return response({}, 409);
      return response({
        content: {
          sha: put(path, Buffer.from(data.content, "base64").toString("utf8")),
        },
      });
    }
    if (!old) return response({}, 404);
    return response({
      type: "file",
      encoding: "base64",
      sha: old.sha,
      size: Buffer.byteLength(old.content),
      content: Buffer.from(old.content).toString("base64"),
    });
  };
  return {
    env,
    files,
    calls,
    fetcher,
    put,
    setReadOnly: (v) => (readOnly = v),
    setPrivate: (v) => (privateRepo = v),
    get state() {
      const f = files.get("data/team.json");
      return f ? JSON.parse(f.content) : null;
    },
  };
}
