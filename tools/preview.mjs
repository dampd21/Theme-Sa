// Isolated local preview: synthetic in-memory data only. Never deployed as a Worker asset.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import worker from "../worker/index.mjs";
import { fixture } from "../worker/fixture.mjs";
import { emptyState, normalize } from "../site/model.mjs";
const s = emptyState();
s.teamName = "달빛 원정대 · 미리보기";
s.members = ["preview-a", "preview-b", "preview-c"].map((id, i) => ({
  id,
  name: ["가상 탐험가 · 나래", "가상 기록관 · 여울", "가상 길잡이 · 솔"][i],
  stats: [50, 50, 50, 50, 50, 50],
  abilities: [],
  symbol: "✦",
}));
s.leaderId = "preview-a";
const f = fixture(normalize(s));
f.env.SITE_PASSWORD = "Preview7";
globalThis.fetch = f.fetcher;
const site = new URL("../site/", import.meta.url).pathname.replace(/\/$/, "");
f.env.ASSETS = {
  fetch: async (request) => {
    const pathname = new URL(request.url).pathname,
      filename = path.resolve(
        site,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
    if (!filename.startsWith(site + "/"))
      return new Response("Not found", { status: 404 });
    try {
      let content = await fs.readFile(filename);
      if (filename.endsWith("index.html"))
        content = Buffer.from(
          content
            .toString()
            .replace(
              "우리끼리 정한 비밀번호로 들어오세요.",
              "가상 데이터 미리보기입니다. 비밀번호: <b>Preview7</b><br>운영 기록과 연결되지 않으며 재시작하면 초기화됩니다.",
            ),
        );
      return new Response(content, {
        headers: {
          "Content-Type": filename.endsWith(".html")
            ? "text/html; charset=utf-8"
            : filename.endsWith(".mjs")
              ? "application/javascript; charset=utf-8"
              : filename.endsWith(".css")
                ? "text/css; charset=utf-8"
                : "text/plain",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
};
http
  .createServer(async (req, res) => {
    try {
      const chunks = [];
      let length = 0;
      for await (const c of req) {
        length += c.length;
        if (length > 2000000) {
          res.writeHead(413);
          res.end();
          return;
        }
        chunks.push(c);
      }
      const body = Buffer.concat(chunks),
        host = req.headers.host,
        secure =
          host.endsWith(".e2b.app") ||
          req.headers["x-forwarded-proto"] === "https";
      const result = await worker.fetch(
        new Request((secure ? "https://" : "http://") + host + req.url, {
          method: req.method,
          headers: req.headers,
          ...(body.length ? { body } : {}),
        }),
        f.env,
      );
      const headers = Object.fromEntries(result.headers);
      delete headers["x-frame-options"];
      if (headers["content-security-policy"])
        headers["content-security-policy"] = headers[
          "content-security-policy"
        ].replace(/frame-ancestors[^;]*;?/g, "");
      // Partitioned preview cookies allow the demo inside the host preview iframe; production retains SameSite=Strict.
      if (secure && headers["set-cookie"])
        headers["set-cookie"] =
          headers["set-cookie"].replace("SameSite=Strict", "SameSite=None") +
          "; Partitioned";
      res.writeHead(result.status, headers);
      res.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      res.writeHead(500);
      res.end("Preview error");
    }
  })
  .listen(3000, "0.0.0.0", () =>
    console.log(
      "Edition 09 synthetic preview. Password Preview7. No production data or credentials.",
    ),
  );
