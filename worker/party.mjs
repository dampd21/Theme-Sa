import {
  validateCup,
  validatePreset,
  bracket,
  shuffle,
  SIZES,
  idOK,
  hashOK,
} from "../site/party-rules.mjs";
const enc = new TextEncoder();
const bytes = (s) => enc.encode(s);
const to64 = (b) => {
  let s = "";
  for (let i = 0; i < b.length; i += 8192)
    s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s);
};
const from64 = (text) => {
  const s = atob(text),
    b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
};
const integer = (x, max = 1e15) =>
  Number.isSafeInteger(x) && x >= 0 && x <= max;
const date = (x) => typeof x === "string" && Number.isFinite(Date.parse(x));
export const emptyParty = () => ({
  version: 1,
  cups: [],
  runs: [],
  presets: [],
  receipts: [],
  published: 0,
  updatedAt: null,
});
export function validateParty(s) {
  if (
    !s ||
    s.version !== 1 ||
    !integer(s.published, 240) ||
    (s.updatedAt !== null && !date(s.updatedAt))
  )
    throw Error("party schema");
  for (const [key, max] of [
    ["cups", 24],
    ["runs", 120],
    ["presets", 40],
    ["receipts", 400],
  ])
    if (
      !Array.isArray(s[key]) ||
      s[key].length > max ||
      new Set(s[key].map((x) => x?.id)).size !== s[key].length
    )
      throw Error("party collection");
  for (const c of s.cups)
    if (
      !idOK(c.id) ||
      !idOK(c.owner) ||
      !hashOK(c.hash) ||
      typeof c.title !== "string" ||
      !c.title.trim() ||
      c.title.length > 80 ||
      !integer(c.count, 64) ||
      c.count < 2 ||
      !integer(c.rev) ||
      !date(c.at)
    )
      throw Error("cup metadata");
  for (const r of s.runs) {
    if (
      !idOK(r.id) ||
      !idOK(r.owner) ||
      !idOK(r.cupId) ||
      !hashOK(r.hash) ||
      !integer(r.rev) ||
      !date(r.at) ||
      typeof r.title !== "string" ||
      r.title.length > 80
    )
      throw Error("party run");
    bracket(r.order, r.picks);
  }
  for (const p of s.presets) {
    if (!idOK(p.id) || !idOK(p.owner) || !integer(p.rev))
      throw Error("preset metadata");
    validatePreset(p.config);
  }
  for (const r of s.receipts)
    if (
      !idOK(r.id) ||
      !idOK(r.owner) ||
      !integer(r.expires) ||
      !hashOK(r.digest) ||
      !idOK(r.resultId)
    )
      throw Error("party receipt");
  return s;
}
export const partyView = (s, actor) => ({
  version: 1,
  now: Date.now(),
  updatedAt: s.updatedAt,
  published: s.published,
  cups: s.cups,
  presets: s.presets,
  runs: s.runs.filter((r) => r.owner === actor),
  recent: s.runs
    .filter((r) => r.picks.length === r.order.length - 1)
    .slice(-40)
    .map((r) => ({
      id: r.id,
      owner: r.owner,
      cupId: r.cupId,
      title: r.title,
      at: r.at,
    })),
});
export async function partyRoute(request, env, session, D) {
  const { fail, json, github, privateRepo, filePath, getArchive, readJson } = D;
  let config;
  const repo = async () => (config ||= await privateRepo(env));
  const bad = (m) => fail(400, "PARTY_INPUT", m);
  const changed = () =>
    fail(
      409,
      "PARTY_CHANGED",
      "다른 사람이 먼저 저장했습니다. 내 초안은 유지했어요. 최신 상태를 확인한 뒤 다시 저장하세요.",
    );
  async function read(path, validator, limit = 800000) {
    const c = await repo(),
      route = filePath({ ...c, path: c.path + path });
    const f = await github(
      route + "?ref=" + encodeURIComponent(c.branch) + "&_=" + Date.now(),
      env,
    );
    if (f.missing) return { value: null, sha: null, c, route };
    try {
      if (
        f.type !== "file" ||
        f.encoding !== "base64" ||
        f.size > limit ||
        !/^[a-f0-9]{40,64}$/.test(f.sha || "")
      )
        throw Error();
      const raw = from64(f.content.replace(/\s/g, ""));
      if (raw.length > limit) throw Error();
      return {
        value: validator(
          JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)),
        ),
        sha: f.sha,
        c,
        route,
      };
    } catch {
      fail(
        502,
        "PARTY_CORRUPT",
        "놀이방 기록의 형식 또는 용량을 확인해야 합니다. 기존 파일은 덮어쓰지 않았어요.",
      );
    }
  }
  const cupPath = (hash) => ".party-cups/" + hash + ".json";
  const digest = async (data) =>
    [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", bytes(JSON.stringify(data))),
      ),
    ]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  async function getCup(hash) {
    if (!hashOK(hash)) bad("월드컵 주소를 확인해 주세요.");
    const d = await read(cupPath(hash), validateCup);
    if (!d.value) fail(404, "PARTY_MISSING", "이 월드컵을 찾을 수 없습니다.");
    if ((await digest(d.value)) !== hash)
      fail(502, "PARTY_CORRUPT", "월드컵 원본 검증에 실패했습니다.");
    return d.value;
  }
  if (request.method === "GET") {
    const u = new URL(request.url),
      hash = u.searchParams.get("cup");
    if (hash) return json({ cup: await getCup(hash) });
    return json(
      partyView(
        (await read(".party.json", validateParty)).value || emptyParty(),
        u.searchParams.get("actor") || "",
      ),
    );
  }
  const b = await readJson(request, 780000),
    now = Date.now();
  if (b.version !== 1)
    fail(426, "PARTY_UPDATE", "새 버전으로 새로고침해 주세요.");
  if (
    !idOK(b.memberId) ||
    !idOK(b.opId) ||
    !integer(b.issuedAt) ||
    b.issuedAt > now + 30000 ||
    b.issuedAt + 900000 <= now
  )
    bad("저장 요청이 만료됐어요. 초안을 확인하고 새 요청으로 저장하세요.");
  const archive = await getArchive(env, false, await repo());
  if (!archive.state.members.some((m) => m.id === b.memberId))
    bad("본인의 현재 활동 프로필을 선택해 주세요.");
  const actor = b.memberId,
    requestDigest = await digest(b);
  let definition,
    definitionHash,
    immutableSaved = false;
  if (b.action === "cupSave") {
    try {
      definition = validateCup(b.cup);
    } catch (e) {
      bad(e.message);
    }
    definitionHash = await digest(definition);
  }
  let newRun;
  for (let attempt = 0; attempt < 5; attempt++) {
    const d = await read(".party.json", validateParty),
      s = d.value || emptyParty();
    s.receipts = s.receipts.filter((r) => r.expires > now);
    const receipt = s.receipts.find((r) => r.id === b.opId);
    if (receipt) {
      if (receipt.owner !== actor || receipt.digest !== requestDigest)
        bad("이미 사용된 저장 번호입니다.");
      return json({
        data: partyView(s, actor),
        resultId: receipt.resultId,
        replayed: true,
      });
    }
    if (s.receipts.length >= 400)
      fail(
        429,
        "PARTY_BUSY",
        "최근 저장이 많아요. 잠시 후 같은 요청을 다시 저장해 주세요.",
      );
    let resultId = b.id;
    if (!idOK(resultId)) bad("기록 번호를 확인하세요.");
    const at = new Date(now).toISOString();
    if (b.action === "cupSave") {
      const old = s.cups.find((x) => x.id === b.id);
      if ((old?.rev ?? null) !== b.rev) changed();
      if (!old && s.cups.length >= 24)
        bad(
          "월드컵은 24개까지 공유합니다. 사용하지 않는 월드컵을 목록에서 내린 뒤 추가하세요.",
        );
      if (s.published >= 240)
        bad(
          "이미지 포함 발행 240회 한도입니다. 관리자가 저장소 용량과 이력을 확인해야 합니다.",
        );
      if (!immutableSaved) {
        const existing = await read(cupPath(definitionHash), validateCup);
        if (existing.value) {
          if ((await digest(existing.value)) !== definitionHash)
            fail(502, "PARTY_CORRUPT", "월드컵 파일 검증 실패");
        } else {
          const raw = bytes(JSON.stringify(definition));
          if (raw.length > 760000) bad("월드컵 사진 용량을 줄여 주세요.");
          try {
            const saved = await github(existing.route, env, "PUT", {
              message: "Save immutable party cup definition",
              branch: existing.c.branch,
              content: to64(raw),
            });
            if (!/^[a-f0-9]{40,64}$/.test(saved.content?.sha || ""))
              fail(
                502,
                "PARTY_UNCONFIRMED",
                "사진 저장 응답을 확인하지 못했어요. 같은 요청으로 다시 저장하세요.",
              );
          } catch (e) {
            if (e.status === 409 || e.status === 422) {
              const check = await getCup(definitionHash);
              if ((await digest(check)) !== definitionHash) throw e;
            } else throw e;
          }
        }
        immutableSaved = true;
      }
      const row = {
        id: b.id,
        hash: definitionHash,
        title: definition.title,
        count: definition.candidates.length,
        owner: old?.owner || actor,
        rev: (old?.rev ?? 0) + 1,
        at,
      };
      if (old) s.cups[s.cups.indexOf(old)] = row;
      else s.cups.push(row);
      s.published++;
    } else if (b.action === "cupDelete") {
      const old = s.cups.find((x) => x.id === b.id);
      if (!old) bad("이미 목록에서 내려간 월드컵입니다.");
      if (old.rev !== b.rev) changed();
      s.cups = s.cups.filter((x) => x.id !== b.id);
    } else if (b.action === "start") {
      if (s.runs.some((r) => r.id === b.id))
        bad("이미 시작한 경기 번호입니다.");
      const cup = s.cups.find((x) => x.id === b.cupId);
      if (!cup) bad("목록에 있는 월드컵을 선택하세요.");
      if (!SIZES.includes(b.size) || cup.count < b.size)
        bad("선택한 강수만큼 후보가 필요합니다.");
      if (
        s.runs.filter(
          (r) => r.owner === actor && r.picks.length < r.order.length - 1,
        ).length >= 6
      )
        bad(
          "진행 중인 월드컵은 프로필당 6개까지입니다. 기존 경기를 끝내거나 삭제하세요.",
        );
      if (!newRun) {
        const c = await getCup(cup.hash);
        newRun = {
          id: b.id,
          owner: actor,
          cupId: cup.id,
          hash: cup.hash,
          title: cup.title,
          order: shuffle(c.candidates.map((x) => x.id)).slice(0, b.size),
          picks: [],
          rev: 0,
          at,
        };
      }
      if (s.runs.length >= 120) {
        const index = s.runs.findIndex(
          (r) => r.picks.length === r.order.length - 1,
        );
        if (index < 0) bad("진행 기록이 가득 찼습니다.");
        s.runs.splice(index, 1);
      }
      s.runs.push(newRun);
    } else if (b.action === "checkpoint") {
      const r = s.runs.find((x) => x.id === b.id && x.owner === actor);
      if (!r) bad("본인의 진행 기록을 찾을 수 없습니다.");
      if (r.rev !== b.rev) changed();
      if (
        !Array.isArray(b.picks) ||
        b.picks.length < r.picks.length ||
        r.picks.some((v, i) => v !== b.picks[i])
      )
        bad("저장된 선택을 되돌리거나 변경할 수 없습니다.");
      try {
        bracket(r.order, b.picks);
      } catch (e) {
        bad(e.message);
      }
      r.picks = [...b.picks];
      r.rev++;
      r.at = at;
    } else if (b.action === "runDelete") {
      const r = s.runs.find((x) => x.id === b.id && x.owner === actor);
      if (!r) bad("본인의 경기를 찾을 수 없습니다.");
      if (r.rev !== b.rev) changed();
      s.runs = s.runs.filter((x) => x !== r);
    } else if (b.action === "presetSave") {
      let c;
      try {
        c = validatePreset(b.config);
      } catch (e) {
        bad(e.message);
      }
      const old = s.presets.find((x) => x.id === b.id);
      if ((old?.rev ?? null) !== b.rev) changed();
      if (!old && s.presets.length >= 40) bad("설정은 40개까지 저장합니다.");
      const row = {
        id: b.id,
        owner: old?.owner || actor,
        rev: (old?.rev ?? 0) + 1,
        config: c,
      };
      if (old) s.presets[s.presets.indexOf(old)] = row;
      else s.presets.push(row);
    } else if (b.action === "presetDelete") {
      const old = s.presets.find((x) => x.id === b.id);
      if (!old) bad("이미 삭제된 설정입니다.");
      if (old.rev !== b.rev) changed();
      s.presets = s.presets.filter((x) => x !== old);
    } else bad("지원하지 않는 놀이방 작업입니다.");
    s.updatedAt = at;
    s.receipts.push({
      id: b.opId,
      owner: actor,
      digest: requestDigest,
      resultId,
      expires: now + 900000,
    });
    validateParty(s);
    const raw = bytes(JSON.stringify(s));
    if (raw.length > 780000)
      bad(
        "놀이방 보관 용량이 가득 찼습니다. 이전 경기 또는 설정을 정리해 주세요.",
      );
    try {
      const saved = await github(d.route, env, "PUT", {
        message: "Update shared party room",
        branch: d.c.branch,
        content: to64(raw),
        ...(d.sha ? { sha: d.sha } : {}),
      });
      if (!/^[a-f0-9]{40,64}$/.test(saved.content?.sha || ""))
        fail(
          502,
          "PARTY_UNCONFIRMED",
          "공동 저장 응답을 확인하지 못했어요. 같은 요청으로 다시 저장하세요.",
        );
      return json({ data: partyView(s, actor), resultId });
    } catch (e) {
      if (e.status === 409 || e.status === 422) continue;
      throw e;
    }
  }
  changed();
}
