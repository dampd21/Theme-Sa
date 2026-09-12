import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const html = await readFile("site/index.html", "utf8");
assert(
  html.includes("script-src 'self';") && html.includes("connect-src 'self';"),
  "Same-origin CSP is required.",
);
assert(
  !/<script(?![^>]*src=)[^>]*>/i.test(html),
  "Unhashed inline script is prohibited.",
);
for (const name of await readdir("site")) {
  assert(
    !/^(vault\.json|\.env|\.dev\.vars)|\.(pem|key|map)$/.test(name),
    "Private file in public assets.",
  );
  if (/\.(html|js|mjs|json|css|txt)$/.test(name)) {
    const text = await readFile("site/" + name, "utf8");
    for (const forbidden of [
      "api.github.com",
      "DATA_REPO_TOKEN",
      "SESSION_SECRET",
      "Bearer ",
    ])
      assert(!text.includes(forbidden), "Server-only item in " + name);
    assert(
      !/(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/.test(text),
      "Credential-shaped text in client.",
    );
  }
}
assert(html.includes('id="sharedPassword"'));
console.log(
  "Public assets passed: external same-origin modules, strict CSP, no tokens, no vault or server secret files.",
);
