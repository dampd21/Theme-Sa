import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import worker from "../../worker/index.mjs";
import { fixture } from "../../worker/fixture.mjs";
const f = fixture({
  version: 1,
  teamName: "퇴마사",
  leaderId: null,
  members: [],
  updatedAt: null,
});
globalThis.fetch = f.fetcher;
const site = new URL("../../site/", import.meta.url).pathname.replace(
  /\/$/,
  "",
);
f.env.ASSETS = {
  fetch: async (request) => {
    let pathname = decodeURIComponent(new URL(request.url).pathname);
    if (pathname === "/") pathname = "/index.html";
    const file = path.resolve(site, "." + pathname);
    if (!file.startsWith(site + "/"))
      return new Response("Not found", { status: 404 });
    try {
      return new Response(await fs.readFile(file), {
        headers: {
          "Content-Type": file.endsWith(".html")
            ? "text/html; charset=utf-8"
            : /\.(mjs|js)$/.test(file)
              ? "application/javascript; charset=utf-8"
              : file.endsWith(".css")
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
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const r = new Request("http://" + req.headers.host + req.url, {
        method: req.method,
        headers: req.headers,
        ...(body.length ? { body } : {}),
      });
      const result = await worker.fetch(r, f.env);
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      res.writeHead(500);
      res.end("Synthetic harness error");
    }
  })
  .listen(3001, "127.0.0.1", () =>
    console.log(
      "Synthetic extension integration server on 127.0.0.1:3001. No real data or credentials.",
    ),
  );
