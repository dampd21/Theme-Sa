import {
  ROOM_VERSION,
  WEATHER,
  CASES,
  SOURCES,
  ARTIFACTS,
  INK,
  WORDS,
  sceneFor,
  nextWords,
  zoneCells,
  fixedCell,
  strokePath,
} from "./room-rules.mjs";
export function createRoomUI(H) {
  const { api, getState, getActor, esc, toast, requireActor, refreshView } = H,
    $ = (id) => document.getElementById(id);
  let data = null,
    loaded = 0,
    loadMono = 0,
    loadedActor = "",
    loading = null,
    loadActor = "",
    generation = 0,
    sessionEpoch = 0,
    inflight = false,
    pending = null,
    error = "",
    notice = "",
    fields = {},
    draws = { ink: [], sketch: [] },
    pen = false,
    wordMode = "chain",
    sketchId = "",
    zone = 0,
    mazeDraft = null,
    mazeDirty = false,
    walk = [0],
    windowOpen = false,
    eerie = false;
  try {
    eerie = sessionStorage.getItem("theme-sa-room-eerie") === "1";
  } catch {}
  const name = (id) =>
    getState().members.find((m) => m.id === id)?.name || "이전 팀원";
  const isDirty = () =>
    inflight ||
    !!pending ||
    pen ||
    Object.values(fields).some((v) => v.trim()) ||
    draws.ink.length > 0 ||
    draws.sketch.length > 0 ||
    mazeDirty ||
    walk.length > 1;
  const isSaving = () => inflight;
  const stamp = (v) =>
    new Date(v).toLocaleString("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  function cancel() {
    fields = {};
    draws = { ink: [], sketch: [] };
    pen = false;
    pending = null;
    mazeDraft = null;
    mazeDirty = false;
    walk = [0];
    error = "";
  }
  function reset() {
    generation++;
    sessionEpoch++;
    cancel();
    try {
      sessionStorage.removeItem("theme-sa-room-eerie");
    } catch {}
    eerie = false;
    data = null;
    loaded = 0;
    loading = null;
    loadedActor = "";
    notice = "";
    inflight = false;
  }
  async function load(force = false) {
    const who = getActor();
    if (!force && error && loadedActor === who && Date.now() - loaded < 60000)
      return data;
    if (!force && data && loadedActor === who && Date.now() - loaded < 60000)
      return data;
    if (loading && loadActor === who) return loading;
    const gen = ++generation;
    loadActor = who;
    loading = api("room?actor=" + encodeURIComponent(who))
      .then((v) => {
        if (gen === generation) {
          data = v;
          loaded = Date.now();
          loadMono = performance.now();
          loadedActor = who;
          error = "";
        }
        return v;
      })
      .catch((e) => {
        if (gen === generation) {
          error = e.message;
          loaded = Date.now();
          loadedActor = who;
        }
        return null;
      })
      .finally(() => {
        if (gen === generation) {
          loading = null;
          if (!isDirty()) refreshView();
        }
      });
    return loading;
  }
  let lastTouchAt = -1e9;
  function touchButtons() {
    document.querySelectorAll(".room-root button").forEach((button) => {
      const click = button.onclick;
      if (typeof click !== "function") return;
      let down = null;
      button.onpointerdown = (e) => {
        if (e.pointerType === "touch")
          down = { id: e.pointerId, x: e.clientX, y: e.clientY };
      };
      button.onpointermove = (e) => {
        if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12)
          down = null;
      };
      button.onpointercancel = () => (down = null);
      button.onpointerup = (e) => {
        const start = down;
        down = null;
        if (
          !start ||
          start.id !== e.pointerId ||
          button.disabled ||
          Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12
        )
          return;
        e.preventDefault();
        lastTouchAt = performance.now();
        click.call(button, e);
      };
      button.onclick = (e) => {
        if (
          e.detail > 0 &&
          performance.now() - lastTouchAt < 600 &&
          (e.pointerType === "touch" ||
            !e.pointerType ||
            e.sourceCapabilities?.firesTouchEvents)
        )
          return;
        click.call(button, e);
      };
    });
  }
  function ensure() {
    if (!data || loadedActor !== getActor() || Date.now() - loaded > 60000)
      load();
  }
  function status() {
    const el = $("roomStatus");
    if (!el) return;
    el.innerHTML = inflight
      ? "<span>공유 기록 저장 중… 창을 닫지 말아 주세요.</span>"
      : error
        ? `<strong>저장을 확인해 주세요</strong><p>${esc(error)}</p>${pending ? '<button id="roomRetry">같은 요청으로 다시 저장</button><button id="roomRebase">초안 유지하고 최신 상태 확인</button><button id="roomDiscard">미저장 요청 버리기</button>' : '<button id="roomReload">다시 불러오기</button>'}`
        : notice
          ? esc(notice)
          : "이곳의 작은 변화는 팀 전체에 공유됩니다. 게임 XP·설정 능력치는 바뀌지 않아요.";
    if ($("roomRetry")) $("roomRetry").onclick = () => sendPending();
    if ($("roomRebase"))
      $("roomRebase").onclick = async () => {
        pending = null;
        error = "";
        await load(true);
        render();
      };
    if ($("roomDiscard"))
      $("roomDiscard").onclick = () => {
        if (
          confirm(
            "미저장 요청과 초안을 버릴까요? 서버에 이미 저장된 내용은 취소되지 않습니다.",
          )
        ) {
          cancel();
          load(true);
          render();
        }
      };
    if ($("roomReload")) $("roomReload").onclick = () => load(true);
  }
  async function send(action, extra = {}) {
    if (inflight) return;
    if (pending) {
      toast(
        "먼저 실패한 저장을 재시도하거나 미저장 요청을 정리해 주세요.",
        true,
      );
      return;
    }
    if (!requireActor()) return;
    if (!data) {
      await load(true);
      if (!data) return;
    }
    pending = {
      version: ROOM_VERSION,
      opId: crypto.randomUUID(),
      issuedAt: Math.round(data.clock + performance.now() - loadMono),
      memberId: getActor(),
      action,
      ...structuredClone(extra),
    };
    return sendPending();
  }
  async function sendPending() {
    if (!pending || inflight) return;
    const body = pending,
      epoch = sessionEpoch;
    inflight = true;
    status();
    document
      .querySelectorAll(
        ".room-root button,.room-root input,.room-root select,.room-root textarea",
      )
      .forEach((b) => {
        if (inflight || !b.closest("#roomStatus")) b.disabled = true;
      });
    if ($("actorSelect")) $("actorSelect").disabled = true;
    try {
      const result = await api("room", "POST", body);
      if (epoch !== sessionEpoch) return;
      generation++;
      loading = null;
      data = result.data;
      loaded = Date.now();
      loadMono = performance.now();
      loadedActor = body.memberId;
      notice =
        result.notice +
        (result.replayed ? " (이미 저장된 요청을 확인했어요.)" : "");
      error = "";
      pending = null;
      const clear =
        {
          word: ["wordInput"],
          repair: ["typoAnswer"],
          "item.create": ["itemLabel", "itemClue"],
          "ink.finish": ["inkTitle"],
          "sketch.create": ["sketchDescription"],
        }[body.action] || [];
      for (const k of clear) delete fields[k];
      if (body.action === "ink") draws.ink = [];
      if (body.action.startsWith("sketch.") && body.action !== "sketch.archive")
        draws.sketch = [];
      if (body.action === "maze.edit") {
        mazeDirty = false;
        mazeDraft = null;
      }
      if (body.action === "maze.solve" || body.action === "maze.new")
        walk = [0];
      if (body.action === "maze.new") mazeDraft = null;
    } catch (e) {
      if (epoch === sessionEpoch) {
        error = e.message;
        if (e.status === 400) pending = null;
        if (e.status === 401) H.needLogin();
      }
    } finally {
      if (epoch === sessionEpoch) {
        inflight = false;
        if ($("actorSelect")) $("actorSelect").disabled = false;
        render();
      }
    }
  }
  const tabs = [
    ["", "살아 있는 기록실"],
    ["mystery", "미스터리 수첩"],
    ["words", "낱말 · 분실물"],
    ["art", "함께 그리기"],
    ["maze", "공동 미로"],
  ];
  function section() {
    return location.hash.split("/")[1] || "";
  }
  function rootHeader(key) {
    return `<header class="page-head"><div><p class="eyebrow">THE LIVING ARCHIVE · SEASON 01</p><h1>${esc(tabs.find((t) => t[0] === key)?.[1] || "살아 있는 기록실")}</h1><p>조용한 신비, 함께 푸는 추리, 그리고 우리 손으로 만드는 작은 세계.</p></div></header><nav class="room-tabs" aria-label="아지트 메뉴">${tabs.map(([id, label]) => `<a href="#room${id ? "/" + id : ""}" class="${key === id ? "selected" : ""}">${label}</a>`).join("")}</nav><div id="roomStatus" class="room-status" role="status"></div>`;
  }
  function render() {
    if (!location.hash.startsWith("#room")) {
      if (location.hash === "#dashboard" || !location.hash) refreshView();
      return;
    }
    ensure();
    const key = section();
    $("view").innerHTML =
      '<div class="room-root">' +
      rootHeader(key) +
      (data && loadedActor === getActor()
        ? key === "mystery"
          ? mystery()
          : key === "words"
            ? words()
            : key === "art"
              ? art()
              : key === "maze"
                ? maze()
                : home()
        : '<section class="panel"><h2>기록실에 불을 켜는 중…</h2><p>공유 아지트 기록을 불러옵니다.</p></section>') +
      "</div>";
    status();
    if (data && loadedActor === getActor()) {
      wire(key);
      for (const [id, value] of Object.entries(fields))
        if ($(id)) $(id).value = value;
      document.querySelectorAll(".room-field").forEach((e) =>
        e.addEventListener("input", () => {
          fields[e.id] = e.value;
        }),
      );
    }
    touchButtons();
    if (inflight || pending)
      document
        .querySelectorAll(
          ".room-root button,.room-root input,.room-root select,.room-root textarea",
        )
        .forEach((b) => {
          if (inflight || !b.closest("#roomStatus")) b.disabled = true;
        });
  }
  function teaser() {
    ensure();
    return `<section class="panel room-teaser"><div><p class="eyebrow">A ROOM THAT REMEMBERS US</p><h3>기록실에 작은 변화가 생겼어요</h3><p class="hint">${data ? esc(sceneFor(data.day).anomaly[0]) + " · 사건 " + data.solved.length + "/3 해결" : "창문과 액자, 꼬마 원혼의 이야기를 만나 보세요."}</p></div><a class="primary game-link" href="#room">살아 있는 기록실 →</a></section>`;
  }
  function roomSVG(large = false) {
    const v = sceneFor(data.day),
      weather = data.weather,
      stars = Array.from(
        { length: 20 },
        (_, i) =>
          `<circle cx="${430 + ((i * 67) % 410)}" cy="${40 + ((i * 29) % 200)}" r="${i % 3 === 0 ? 2 : 1}" fill="#d2d5a5" opacity=".65"/>`,
      ).join("");
    const books = Array.from(
      {
        length:
          12 +
          Math.min(
            15,
            Math.floor(data.activity / 4) + getState().members.length,
          ),
      },
      (_, i) =>
        `<rect x="${44 + (i % 14) * 19}" y="${144 + Math.floor(i / 14) * 99 - (i % 4) * 9}" width="13" height="${62 + (i % 4) * 9}" rx="2" fill="${["#42644b", "#a29260", "#58747a", "#725b52"][i % 4]}"/><path d="M${47 + (i % 14) * 19} ${155 + Math.floor(i / 14) * 99 - (i % 4) * 9}v32" stroke="#ced0a1" opacity=".4"/>`,
    ).join("");
    return `<svg viewBox="0 0 900 470" role="img" aria-label="${esc(v.landscape)}이 보이는 기록실" class="room-illustration ${large ? "landscape-large" : ""}"><defs><linearGradient id="roomWall" x2="0" y2="1"><stop stop-color="#243b35"/><stop offset="1" stop-color="#10241e"/></linearGradient><linearGradient id="roomSky" x2="0" y2="1"><stop stop-color="${weather === "sunset" ? "#885b59" : "#172940"}"/><stop offset="1" stop-color="#3c6656"/></linearGradient><radialGradient id="roomGlow"><stop stop-color="#d4c883" stop-opacity=".28"/><stop offset="1" stop-color="#d4c883" stop-opacity="0"/></radialGradient><clipPath id="windowClip"><path d="M479 305V111q0-64 152-64t152 64v194z"/></clipPath></defs><rect width="900" height="470" fill="url(#roomWall)"/><path d="M0 365h900v105H0z" fill="#27382b"/><path d="M0 388h900M0 425h900M0 465h900M110 365L40 470M320 365l-20 105M580 365l20 105M780 365l80 105" stroke="#74805a" opacity=".2"/><rect x="28" y="105" width="302" height="246" rx="6" fill="#182a24" stroke="#637453"/><path d="M35 209h287M35 308h287" stroke="#8d8c60" stroke-width="7"/>${books}<g clip-path="url(#windowClip)"><rect x="475" y="38" width="316" height="275" fill="url(#roomSky)"/>${stars}<circle cx="716" cy="100" r="28" fill="${weather === "sunset" ? "#ebaf83" : "#d2ddba"}"/><path d="M478 229q70-95 153-28t160 5v105H478" fill="#284c43"/><path d="M478 272q83-77 178-12t135-25v80H478" fill="#203f35"/><path d="M622 243q20 10-30 69h94q-30-26-30-51" fill="#75988b" opacity=".55"/>${v.landscape.includes("연못") ? '<ellipse cx="636" cy="282" rx="115" ry="24" fill="#769e92" opacity=".6"/><path d="M560 283h138M590 292h90" stroke="#c7d4b0" opacity=".5"/>' : v.landscape.includes("다리") ? '<path d="M490 282q130-90 275-15M490 265q130-90 275-15" stroke="#b3ad7b" stroke-width="6" fill="none"/><path d="M535 257v-18M580 239v-18M630 233v-18M680 237v-18M725 249v-18" stroke="#b3ad7b" stroke-width="3"/>' : v.landscape.includes("정원") ? Array.from({ length: 8 }, (_, i) => `<circle cx="${515 + i * 32}" cy="${250 + (i % 3) * 14}" r="11" fill="${i % 2 ? "#999e72" : "#8cab81"}"/><path d="M${515 + i * 32} ${259 + (i % 3) * 14}v18" stroke="#566c42"/>`).join("") : Array.from({ length: 6 }, (_, i) => `<path d="M${490 + i * 49} 272l22-75 22 75z" fill="#1b392f"/><path d="M${512 + i * 49} 234v57" stroke="#496246"/>`).join("")}${weather === "rain" ? Array.from({ length: 22 }, (_, i) => `<path d="M${480 + i * 14} ${58 + (i % 4) * 32}l-15 115" stroke="#bdcfbd" opacity=".3"/>`).join("") : ""}${weather === "snow" ? Array.from({ length: 25 }, (_, i) => `<circle cx="${486 + ((i * 37) % 290)}" cy="${70 + ((i * 39) % 230)}" r="3" fill="#dfebda" opacity=".65"/>`).join("") : ""}${weather === "mist" ? '<path d="M480 160h305M480 215h305M480 258h305" stroke="#cfddc4" stroke-width="25" opacity=".12"/>' : ""}</g><path d="M479 305V111q0-64 152-64t152 64v194zM630 49v255M480 174h302" fill="none" stroke="#879674" stroke-width="7"/><path d="M462 310h340" stroke="#a0a27b" stroke-width="12"/><g class="room-picture"><rect x="359" y="113" width="76" height="99" rx="3" fill="#a69460"/><rect x="366" y="120" width="62" height="85" fill="#203d36"/><text x="397" y="176" text-anchor="middle" fill="#cbd7b0" font-size="34">${esc(getState().members[0]?.name?.slice(0, 1) || "✦")}</text></g><ellipse cx="441" cy="383" rx="152" ry="35" fill="#0c1b16" opacity=".45"/><path d="M310 319h254l29 57H281z" fill="#685e3c" stroke="#ab9c67"/><path d="M299 374v66M570 374v66" stroke="#4f4d31" stroke-width="12"/><path d="M354 327h100l22 34H341z" fill="#c7c598"/><text x="401" y="351" fill="#44583c" font-size="21">✦</text><path d="M498 320h34v26h-34z" fill="#98b89c"/><path d="M532 324q19 0 9 15h-9" stroke="#98b89c" fill="none" stroke-width="4"/><path d="M508 304q-9-10 3-18" fill="none" stroke="#bacbad" opacity=".5"/><circle cx="191" cy="332" r="100" fill="url(#roomGlow)"/><path d="M179 322h24v35h-24z" fill="#d3bd73"/><path d="M190 303q-13 16 0 19q13-3 0-19" fill="#efe3a6"/>${Array.from({ length: Math.min(6, 1 + Math.floor(data.activity / 8)) }, (_, i) => `<circle cx="${70 + i * 142}" cy="57" r="8" fill="#e2d199" opacity=".7"/>`).join("")}${weather === "fireflies" ? Array.from({ length: 12 }, (_, i) => `<circle class="room-firefly" cx="${100 + i * 67}" cy="${220 + ((i * 29) % 160)}" r="3" fill="#d0e391"/>`).join("") : ""}</svg>`
      .replace(
        /roomWall|roomSky|roomGlow|windowClip/g,
        (id) => id + (large ? "Large" : ""),
      )
      .replace(
        'viewBox="0 0 900 470"',
        large ? 'viewBox="480 50 300 250"' : 'viewBox="0 0 900 470"',
      );
  }
  function home() {
    const v = sceneFor(data.day),
      clean = data.clean.filter(
        (c) =>
          c.memberId === getActor() &&
          c.at.slice(0, 10) === new Date(data.clock).toISOString().slice(0, 10),
      );
    const todayFinds = data.clean.filter(
      (c) =>
        c.memberId === getActor() &&
        new Date(Date.parse(c.at) + 9 * 3600000).toISOString().slice(0, 10) ===
          data.day,
    ).length;
    return `<div class="room-heading-row"><span class="room-pill">${esc(data.day)} · ${esc(WEATHER.find((w) => w[0] === data.weather)[1])}</span><label class="room-toggle"><input id="eerieToggle" type="checkbox" ${eerie ? "checked" : ""}>은근한 소름 연출</label></div><section class="room-stage ${eerie ? "room-eerie" : ""}">${roomSVG()}<button id="inspectWindow" class="room-hotspot room-window">▥ 창문 살펴보기</button><button id="inspectFrame" class="room-hotspot room-frame">▣ 액자 뒤집어 보기</button><button id="inspectGhost" class="room-ghost" aria-label="꼬마 원혼에게 말 걸기"><span>◉</span><small>말 걸기</small></button><a href="#room/mystery" class="room-hotspot room-drawer">▤ 비밀 서랍 · ${data.solved.length}/3</a>${Array.from({ length: Math.max(0, 3 - todayFinds) }, (_, i) => `<button class="room-dust dust-${i}" data-clean aria-label="먼지 ${i + 1} 정리하기">✧</button>`).join("")}<div class="room-caption">${getState().teamName ? esc(getState().teamName) + "의 " : ""}살아 있는 기록실 <small>기록과 공동 작업이 쌓이면 책과 등불이 늘어납니다.</small></div></section>${windowOpen ? `<section class="panel room-landscape"><div class="split"><h2>창문 너머 · ${esc(v.landscape)}</h2><button id="closeWindow">접기</button></div><p>${eerie ? "창밖 그림자는 조금 늦게 따라 움직입니다. 그래도 이 안의 등불은 따뜻해요." : "유리 너머로 고요한 풍경이 펼쳐집니다. 작은 발자국 하나가 창틀에 남아 있어요."}</p>${roomSVG(true)}</section>` : ""}<div class="room-columns"><section class="panel"><p class="eyebrow">TODAY'S ANOMALY</p><h2>${esc(v.anomaly[0])}</h2><p>${esc(v.anomaly[1])}</p><p class="hint">오늘의 이상 현상은 한국 시간 자정에 바뀝니다. 사건 수첩의 진행은 초기화되지 않아요.</p><label>오늘의 가상 날씨<select id="weatherChoice">${WEATHER.map(([id, n, icon]) => `<option value="${id}" ${data.votes.find((v) => v.memberId === getActor())?.weather === id || (!data.votes.some((v) => v.memberId === getActor()) && data.weather === id) ? "selected" : ""}>${icon} ${n}</option>`).join("")}</select></label><button id="weatherVote">이 날씨에 한 표</button><p class="hint">프로필당 1표, 변경 가능 · ${data.votes.length}개 프로필 참여</p></section><section class="panel"><p class="eyebrow">SMALL DISCOVERIES</p><h2>청소하며 찾은 작은 물건</h2><p>바닥의 반짝이는 먼지를 눌러 보세요. 오늘 ${todayFinds}/3개 발견 · 청소 의무나 미접속 페널티는 없습니다.</p><div class="room-objects">${
      data.clean
        .filter((c) => c.memberId === getActor())
        .slice(-8)
        .reverse()
        .map((c) => `<span>✧ ${ARTIFACTS[c.artifact]}</span>`)
        .join("") || "<span>아직 발견한 물건이 없어요.</span>"
    }</div><p class="hint">작은 물건은 장식·이야기용입니다. 게임 능력치 보상은 없습니다.</p></section></div><section class="panel"><h2>움직이는 액자 선반</h2><div class="room-portraits">${
      getState()
        .members.slice(0, 12)
        .map(
          (m, i) =>
            `<a href="#member/${encodeURIComponent(m.id)}" class="room-portrait" style="--tilt:${i % 2 ? 3 : -3}deg"><strong>${esc(m.name.slice(0, 1))}</strong><span>${esc(m.name)}</span></a>`,
        )
        .join("") ||
      '<p class="hint">팀원을 추가하면 이 선반에도 액자가 놓여요.</p>'
    }</div></section><section class="panel"><h2>기록실에 남은 발자국</h2>${
      data.feed
        .slice(-8)
        .reverse()
        .map(
          (f) =>
            `<div class="room-feed"><span>${f.memberId ? esc(name(f.memberId)) : "수상한 소식"}</span><p>${esc(f.text)}</p><small>${esc(stamp(f.at))}</small></div>`,
        )
        .join("") || '<p class="hint">첫 공동 작업의 흔적을 남겨 보세요.</p>'
    }</section>`;
  }
  function mystery() {
    const n = data.caseId,
      c = CASES[n];
    return `<section class="room-mystery-intro"><p class="eyebrow">THREE ROOMS, ONE STORY</p><h2>이 방은 우리가 남긴 이야기를 기억합니다.</h2><p>아늑한 손님의 흔적 → 함께 푸는 분실 사건 → 열세 번째 액자의 비밀. 갑작스러운 소리나 놀람 연출은 없습니다.</p></section><div class="room-case-steps">${CASES.map((c, i) => `<div class="${i < n ? "solved" : i === n ? "current" : ""}"><small>0${i + 1} · ${c.tone}</small><b>${c.title}</b><span>${i < n ? "해결 완료" : i === n ? "조사 중" : "이전 사건을 먼저 해결하세요"}</span></div>`).join("")}</div>${
      c
        ? `<section class="panel"><p class="eyebrow">CASE 0${n + 1}</p><h2>${c.title}</h2><p>${c.intro}</p><div class="room-clues">${SOURCES.map(
            ([source, label, icon]) => {
              const clue = data.clues.find(
                (v) => v.caseId === n && v.source === source,
              );
              return `<article><span>${icon}</span><h3>${label}의 단서</h3><p>${clue ? esc(clue.text) : "아직 모으지 않은 단서예요."}</p>${clue ? "<small>" + esc(name(clue.memberId)) + " 발견</small>" : `<a href="#room">기록실에서 살펴보기 →</a>`}</article>`;
            },
          ).join(
            "",
          )}</div><h3>비밀 서랍의 답</h3><p class="hint">세 단서를 모으면 결론을 선택할 수 있어요. 틀려도 기록·XP를 잃지 않습니다.</p><div class="room-answer-buttons">${c.choices.map(([id, label]) => `<button data-solve="${id}" ${data.clues.filter((v) => v.caseId === n).length < 3 ? "disabled" : ""}>${label}</button>`).join("")}</div></section>`
        : '<section class="panel room-ending"><span>✧</span><h2>시즌 1의 세 서랍을 모두 열었어요.</h2><p>정답보다 오래 남는 것은 함께 찾은 흔적입니다. 공동 그림과 미로, 다음 날의 작은 변화를 계속 즐겨 보세요.</p></section>'
    }${data.solved.map((s) => `<section class="panel"><p class="eyebrow">해결한 사건 · ${esc(name(s.memberId))}</p><h3>${CASES[s.caseId].title}</h3><p>${esc(s.ending)}</p></section>`).join("")}`;
  }
  function words() {
    const board = data.chains[wordMode];
    return `<div class="room-columns"><section class="panel"><p class="eyebrow">ONE WORD AT A TIME</p><h2>한 단어 이어주기</h2><div class="room-segment"><button id="chainMode" aria-pressed="${wordMode === "chain"}">끝말잇기</button><button id="sentenceMode" aria-pressed="${wordMode === "sentence"}">한 단어 공동 문장</button></div><p class="hint">${wordMode === "chain" ? "작은 낱말집 " + WORDS.length + "개로 즐겨요. 사전 전체 검증이 아닌 제한 낱말 모드이며, 두음법칙은 적용하지 않습니다." : "한 번에 한 단어씩, 서로 이어서 재미있는 문장을 만드세요."} 두 프로필 이상이면 번갈아 참여합니다.</p><div class="room-word-chain">${board.turns.map((t) => `<span><b>${esc(t.word)}</b><small>${esc(name(t.memberId))}</small></span>`).join("") || "<p>첫 단어를 기다리고 있어요.</p>"}</div>${
      wordMode === "chain"
        ? `<div class="room-word-hints">${nextWords(board.turns)
            .slice(0, 12)
            .map((w) => `<button data-word="${w}">${w}</button>`)
            .join(
              "",
            )}</div><details><summary>사용할 수 있는 전체 낱말집</summary><p class="hint">${WORDS.join(" · ")}</p></details>`
        : ""
    }<label>이번에 이을 한 단어<input id="wordInput" class="room-field" maxlength="24" placeholder="한 단어를 입력하세요"></label><div class="room-actions"><button id="wordSend" class="primary">한 단어 잇기</button><button id="wordClose" ${board.turns.length < 6 ? "disabled" : ""}>이 종이 마무리</button></div><p class="hint">24단어 또는 이어갈 낱말이 없으면 자동으로 보관합니다.</p></section><section class="panel"><p class="eyebrow">TALISMAN REPAIR SHOP</p><h2>부적 오타 복구소</h2><p>부적에서 잘못 적힌 낱말 하나를 찾아, 올바른 낱말만 적어 주세요.</p><blockquote class="room-typo">${esc(data.typo.text)}</blockquote><label>복구한 낱말<input id="typoAnswer" class="room-field" maxlength="30" placeholder="예: 봉인"></label><button id="repairSend" class="primary">뜻을 되돌리기</button><p class="hint">복구 ${data.typo.serial}회 · 팀이 함께 진행하는 10문제 순환형 콘텐츠입니다.</p></section></div><section class="panel"><h2>범인은 누구의 물건?</h2><p>실제 분실물이나 개인정보 대신, 캐릭터의 가상 소지품과 단서를 올려 주세요. 주인 외의 프로필이 물건당 3번 추리할 수 있어요.</p><div class="room-columns"><label>가상 물건 이름<input id="itemLabel" class="room-field" maxlength="60" placeholder="귀신을 무서워하는 작은 방울"></label><label>주인을 짐작할 단서<textarea id="itemClue" class="room-field" maxlength="200" placeholder="항상 찻잔 옆에 두고 갑니다."></textarea></label></div><button id="itemCreate">주인 이름 가리고 맡기기</button><p class="room-trust">공용 프로필 선택 방식의 추리 놀이입니다. 화면상 이름 가림은 개인 정보 보안이나 본인 인증을 보장하지 않습니다.</p><div class="room-item-grid">${
      data.items
        .map(
          (i) =>
            `<article class="room-item"><span>⌑</span><h3>${esc(i.label)}</h3><p>${esc(i.clue)}</p>${
              i.solvedBy
                ? `<p class="room-success">주인: ${esc(name(i.ownerId))}<br>${esc(name(i.solvedBy))} 님이 맞혔어요.</p>`
                : i.mine
                  ? '<p class="hint">내가 맡긴 물건 · 다른 프로필의 추리를 기다립니다.</p>'
                  : `<label>누구의 물건일까요?<select id="guess-${i.id}">${getState()
                      .members.map(
                        (m) =>
                          `<option value="${esc(m.id)}">${esc(m.name)}</option>`,
                      )
                      .join(
                        "",
                      )}</select></label><button data-guess="${i.id}">주인 맞히기 (${i.guesses.filter((g) => g.memberId === getActor()).length}/3)</button>`
            }<button class="room-small" data-item-archive="${i.id}">공유 선반에서 정리</button></article>`,
        )
        .join("") || '<p class="hint">아직 맡겨진 물건이 없어요.</p>'
    }</div></section><section class="panel"><h3>함께 이어 쓴 종이들</h3>${
      data.wordHistory
        .slice()
        .reverse()
        .map(
          (r) =>
            `<p class="room-history"><small>${r.mode === "chain" ? "끝말잇기" : "공동 문장"}</small>${r.turns.map((t) => esc(t.word)).join(r.mode === "chain" ? " → " : " ")}</p>`,
        )
        .join("") || '<p class="hint">완성한 종이를 여기에 보관합니다.</p>'
    }</section>`;
  }
  const drawingSVG = (s, label = "함께 그린 그림") =>
    `<svg viewBox="0 0 1000 1000" class="room-art-svg" role="img" aria-label="${esc(label)}"><rect width="1000" height="1000" fill="#172c25"/>${s.map((v) => `<path d="${strokePath(v.points)}" stroke="${v.color}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`).join("")}</svg>`;
  function pad(id, label) {
    return `<div class="room-pad"><canvas id="${id}" width="1000" height="1000" aria-label="${label}. 터치 또는 마우스로 그리기"></canvas><p class="hint">터치·마우스로 그리기 · 두 손가락 확대 대신 페이지의 다른 부분에서 확대해 주세요.</p><div class="room-ink-tools"><label>잉크<select id="${id}Color">${INK.map((c, i) => `<option value="${c}">${["잎빛", "금빛", "물빛", "보랏빛"][i]}</option>`).join("")}</select></label><button data-undo="${id}">내 초안 한 획 지우기</button><button data-clear="${id}">내 초안 모두 지우기</button></div></div>`;
  }
  function art() {
    const d = data.sketches.find((v) => v.id === sketchId);
    return `<section class="panel"><p class="eyebrow">ONE PERSON, ONE STROKE</p><h2>한 사람 한 획 부적</h2><p>한 번에는 한 획, 두 프로필 이상이면 번갈아 그려요. 화면의 초안을 확인한 후 저장합니다. 공유된 획은 초안 지우기로 지워지지 않아요.</p><div class="room-columns"><div>${pad("inkCanvas", "공동 부적")}</div><div><h3>이번 부적 · ${data.talisman.strokes.length}/40획</h3><p>${data.talisman.strokes.length ? "마지막 획: " + esc(name(data.talisman.strokes.at(-1).memberId)) : "아직 첫 획을 기다리고 있어요."}</p><button id="inkSend" class="primary">내 한 획 저장</button><label>완성할 부적 이름<input id="inkTitle" class="room-field" maxlength="50" placeholder="돌아오는 사람들의 부적"></label><button id="inkFinish" ${data.talisman.strokes.length < 3 ? "disabled" : ""}>이름 붙여 전시 · 3획부터</button><p class="hint">최대 40획, 최근 완성작 8개를 전시합니다.</p></div></div><div class="room-art-gallery">${data.talismans
      .slice()
      .reverse()
      .map(
        (t) =>
          `<figure>${drawingSVG(t.strokes)}<figcaption>${esc(t.title)} · ${new Set(t.strokes.map((s) => s.memberId)).size}개 프로필</figcaption></figure>`,
      )
      .join(
        "",
      )}</div></section><section class="panel"><p class="eyebrow">DRAW WHAT YOU HEAR</p><h2>설명만 듣고 그리기</h2><p>출제자는 원본을 그리고 말로 설명합니다. 다른 프로필이 설명만 보고 그린 뒤, 두 그림을 함께 공개합니다. 음성 녹음 없이 글로 설명하는 방식입니다.</p><label>도전 선택<select id="sketchSelect"><option value="">새 설명 그림 출제하기</option>${data.sketches.map((d) => `<option value="${d.id}" ${d.id === sketchId ? "selected" : ""}>${esc(name(d.ownerId))}의 그림 · ${d.response ? "두 그림 공개" : "참여 대기"}</option>`).join("")}</select></label>${d ? `<blockquote class="room-typo">${esc(d.description)}</blockquote>${d.response ? `<div class="room-columns"><figure>${drawingSVG(d.reference)}<figcaption>${esc(name(d.ownerId))}의 원본</figcaption></figure><figure>${drawingSVG(d.response.strokes)}<figcaption>${esc(name(d.response.memberId))}의 해석</figcaption></figure></div>` : d.ownerId === getActor() ? `<p>내 원본은 나에게만 표시합니다. 다른 프로필이 응답할 때까지 기다려 주세요.</p>${drawingSVG(d.reference)}` : pad("sketchCanvas", "설명 듣고 그리는 응답") + '<button id="sketchReply" class="primary">내 그림 제출하고 비교</button>'}<button id="sketchArchive" class="room-small">공유 그림 정리</button>` : `<div class="room-columns">${pad("sketchCanvas", "설명 그림 원본")}<div><label>그림을 말로 설명해 주세요<textarea id="sketchDescription" class="room-field" maxlength="280" placeholder="큰 네모 안에 작은 달이 있고, 아래에는 물결 세 줄이 있어요."></textarea></label><button id="sketchCreate" class="primary">원본 가리고 설명 공개</button></div></div>`}<p class="room-trust">그림은 최대 10획으로 그려요. 사진·외부 파일은 업로드하지 않습니다. 개인 인증이 없으므로 원본 가림도 친구 사이의 놀이 규칙입니다.</p></section>`;
  }
  function mazeSVG(m, path = walk) {
    return `<svg viewBox="0 0 300 300" class="room-maze-map" role="img" aria-label="공동 미로 전체 지도"><rect width="300" height="300" fill="#c7d7b6"/>${m.cells.map((v, i) => `<rect x="${(i % 15) * 20 + 1}" y="${Math.floor(i / 15) * 20 + 1}" width="18" height="18" fill="${v ? "#223e33" : fixedCell(i) ? "#dfcf97" : "#aec1a1"}"/>`).join("")}${path.length > 1 ? `<path d="${path.map((p, i) => (i ? "L" : "M") + ((p % 15) * 20 + 10) + " " + (Math.floor(p / 15) * 20 + 10)).join(" ")}" stroke="#66858b" stroke-width="4" fill="none"/>` : ""}<text x="10" y="15" font-size="14" text-anchor="middle" fill="#23402e">🚪</text><text x="290" y="295" font-size="14" text-anchor="middle" fill="#23402e">🏁</text><circle cx="${(path.at(-1) % 15) * 20 + 10}" cy="${Math.floor(path.at(-1) / 15) * 20 + 10}" r="6" fill="#81516b" stroke="#fff" stroke-width="2"/></svg>`;
  }
  function maze() {
    const m = data.maze,
      owned = m.owners.indexOf(getActor());
    if (owned >= 0) zone = owned;
    if (!mazeDraft || !mazeDirty)
      mazeDraft = zoneCells(zone).map((i) => m.cells[i]);
    return `<section class="panel"><p class="eyebrow">NINE ROOMS, ONE WAY OUT</p><h2>공동 미로 설계실</h2><p>한 프로필이 5×5칸 구역 하나를 맡습니다. 금빛 연결 통로는 유지하고, 길이 끊어지는 설계는 서버가 거절합니다.</p><div class="room-columns"><div id="mazeMap">${mazeSVG(m)}</div><div>${
      m.published
        ? `<h3>공개된 미로 · 함께 탈출하기</h3><p>방향 버튼 또는 방향키·WASD로 이동하세요. 보라색 점이 나의 위치예요.</p><div class="room-dpad"><button data-move="up" aria-label="위로">↑</button><button data-move="left" aria-label="왼쪽">←</button><button data-move="down" aria-label="아래로">↓</button><button data-move="right" aria-label="오른쪽">→</button></div><p id="mazePosition" class="hint">입구에서 출구를 향해 가 보세요.</p><button id="mazeReset">입구로 돌아가기</button><button id="mazeSolve" class="primary">출구 도착 기록하기</button><p class="hint">탈출: ${m.solvers.map((v) => esc(name(v.memberId))).join(" · ") || "아직 없음"}</p><button id="mazeNew" ${m.solvers.length ? "" : "disabled"}>지난 미로 보관하고 새 설계</button>`
        : `<label>설계 구역<select id="mazeZone">${Array.from({ length: 9 }, (_, i) => `<option value="${i}" ${i === zone ? "selected" : ""}>구역 ${i + 1} · ${m.owners[i] ? esc(name(m.owners[i])) : "아직 비어 있음"}</option>`).join("")}</select></label><button id="mazeClaim">이 구역 맡기</button><div id="mazeEditor" class="room-maze-editor">${zoneCells(
            zone,
          )
            .map(
              (index, i) =>
                `<button data-cell="${i}" class="${mazeDraft[i] ? "wall" : ""} ${fixedCell(index) ? "fixed" : ""}" ${fixedCell(index) || m.owners[zone] !== getActor() ? "disabled" : ""} aria-label="구역 ${i + 1}번 칸" aria-pressed="${!!mazeDraft[i]}">${fixedCell(index) ? "길" : mazeDraft[i] ? "벽" : "·"}</button>`,
            )
            .join(
              "",
            )}</div><div class="room-actions"><button id="mazeSave" class="primary" ${m.owners[zone] !== getActor() ? "disabled" : ""}>내 구역 저장</button><button id="mazePublish">설계 잠그고 미로 공개</button></div><p class="hint">2구역 이상 설계 · 벽 8칸 이상이면 공개할 수 있어요. 혼자 있는 팀은 1구역부터 가능합니다.</p>`
    }</div></div></section><section class="panel"><h3>지난 공동 미로</h3><div class="room-art-gallery">${
      data.mazes
        .slice()
        .reverse()
        .map(
          (m) =>
            `<figure>${mazeSVG(m, [0])}<figcaption>${m.solvers.length}개 프로필이 탈출한 미로</figcaption></figure>`,
        )
        .join("") || '<p class="hint">완성한 미로를 최대 5개 보관합니다.</p>'
    }</div></section>`;
  }
  function wire(key) {
    if (key === "") {
      if ($("eerieToggle"))
        $("eerieToggle").onchange = (e) => {
          eerie = e.target.checked;
          try {
            sessionStorage.setItem("theme-sa-room-eerie", eerie ? "1" : "0");
          } catch {}
          render();
        };
      $("weatherVote").onclick = () =>
        send("weather", { weather: $("weatherChoice").value });
      $("inspectWindow").onclick = () => {
        windowOpen = true;
        send("discover", { source: "window", caseId: data.caseId });
      };
      $("inspectFrame").onclick = () =>
        send("discover", { source: "frame", caseId: data.caseId });
      $("inspectGhost").onclick = () =>
        send("discover", { source: "spirit", caseId: data.caseId });
      if ($("closeWindow"))
        $("closeWindow").onclick = () => {
          windowOpen = false;
          render();
        };
      document
        .querySelectorAll("[data-clean]")
        .forEach((b) => (b.onclick = () => send("clean")));
    }
    if (key === "mystery")
      document
        .querySelectorAll("[data-solve]")
        .forEach(
          (b) =>
            (b.onclick = () =>
              send("solve", { caseId: data.caseId, answer: b.dataset.solve })),
        );
    if (key === "words") {
      $("chainMode").onclick = () => {
        wordMode = "chain";
        render();
      };
      $("sentenceMode").onclick = () => {
        wordMode = "sentence";
        render();
      };
      document.querySelectorAll("[data-word]").forEach(
        (b) =>
          (b.onclick = () => {
            fields.wordInput = b.dataset.word;
            $("wordInput").value = b.dataset.word;
          }),
      );
      $("wordSend").onclick = () =>
        send("word", {
          mode: wordMode,
          boardId: data.chains[wordMode].id,
          turn: data.chains[wordMode].turns.length,
          word: $("wordInput").value,
        });
      $("wordInput").onkeydown = (e) => {
        if (e.key === "Enter" && !e.isComposing) $("wordSend").click();
      };
      $("wordClose").onclick = () =>
        send("word.close", {
          mode: wordMode,
          boardId: data.chains[wordMode].id,
        });
      $("repairSend").onclick = () =>
        send("repair", {
          serial: data.typo.serial,
          answer: $("typoAnswer").value,
        });
      $("itemCreate").onclick = () =>
        send("item.create", {
          label: $("itemLabel").value,
          clue: $("itemClue").value,
        });
      document.querySelectorAll("[data-guess]").forEach(
        (b) =>
          (b.onclick = () =>
            send("item.guess", {
              itemId: b.dataset.guess,
              answerId: $("guess-" + b.dataset.guess).value,
            })),
      );
      document.querySelectorAll("[data-item-archive]").forEach(
        (b) =>
          (b.onclick = () => {
            if (
              confirm(
                "이 공유 물건을 선반에서 정리할까요? GitHub 이력은 남습니다.",
              )
            )
              send("item.archive", { itemId: b.dataset.itemArchive });
          }),
      );
    }
    if (key === "art") {
      attachPad("inkCanvas", "ink", data.talisman.strokes, 1);
      $("inkSend").onclick = () => {
        if (!draws.ink.length)
          return toast("초안에 한 획을 그려 주세요.", true);
        send("ink", {
          boardId: data.talisman.id,
          turn: data.talisman.strokes.length,
          stroke: draws.ink[0],
        });
      };
      $("inkFinish").onclick = () => {
        if (draws.ink.length)
          return toast("내 초안을 먼저 저장하거나 지워 주세요.", true);
        send("ink.finish", {
          boardId: data.talisman.id,
          title: $("inkTitle").value,
        });
      };
      $("sketchSelect").onchange = (e) => {
        if (
          draws.sketch.length &&
          !confirm("현재 그림 초안을 버리고 다른 도전을 볼까요?")
        ) {
          e.target.value = sketchId;
          return;
        }
        draws.sketch = [];
        sketchId = e.target.value;
        render();
      };
      if ($("sketchCanvas")) attachPad("sketchCanvas", "sketch", [], 10);
      if ($("sketchCreate"))
        $("sketchCreate").onclick = () =>
          send("sketch.create", {
            description: $("sketchDescription").value,
            strokes: draws.sketch,
          });
      if ($("sketchReply"))
        $("sketchReply").onclick = () =>
          send("sketch.reply", { sketchId, strokes: draws.sketch });
      if ($("sketchArchive"))
        $("sketchArchive").onclick = () => {
          if (confirm("공유 그림을 정리할까요? GitHub 이력은 남습니다."))
            send("sketch.archive", { sketchId });
        };
    }
    if (key === "maze") {
      const m = data.maze;
      if ($("mazeZone"))
        $("mazeZone").onchange = (e) => {
          if (mazeDirty && !confirm("미저장 구역 초안을 버리고 이동할까요?")) {
            e.target.value = zone;
            return;
          }
          zone = +e.target.value;
          mazeDirty = false;
          mazeDraft = zoneCells(zone).map((i) => m.cells[i]);
          render();
        };
      if ($("mazeClaim"))
        $("mazeClaim").onclick = () =>
          send("maze.claim", { mazeId: data.maze.id, zone });
      document.querySelectorAll("[data-cell]").forEach(
        (b) =>
          (b.onclick = () => {
            const i = +b.dataset.cell;
            mazeDraft[i] = mazeDraft[i] ? 0 : 1;
            mazeDirty = true;
            b.classList.toggle("wall", !!mazeDraft[i]);
            b.setAttribute("aria-pressed", String(!!mazeDraft[i]));
            b.textContent = mazeDraft[i] ? "벽" : "·";
            const preview = data.maze.cells.slice();
            zoneCells(zone).forEach((n, i) => (preview[n] = mazeDraft[i]));
            $("mazeMap").innerHTML = mazeSVG({ ...data.maze, cells: preview });
          }),
      );
      if ($("mazeSave"))
        $("mazeSave").onclick = () =>
          send("maze.edit", {
            mazeId: data.maze.id,
            zone,
            zoneRev: data.maze.zoneRev[zone],
            cells: mazeDraft,
          });
      if ($("mazePublish"))
        $("mazePublish").onclick = () => {
          if (mazeDirty) return toast("내 구역을 먼저 저장해 주세요.", true);
          send("maze.publish", { mazeId: data.maze.id });
        };
      document
        .querySelectorAll("[data-move]")
        .forEach((b) => (b.onclick = () => move(b.dataset.move)));
      if ($("mazeReset"))
        $("mazeReset").onclick = () => {
          walk = [0];
          $("mazeMap").innerHTML = mazeSVG(data.maze);
        };
      if ($("mazeSolve"))
        $("mazeSolve").onclick = () =>
          send("maze.solve", { mazeId: data.maze.id, path: walk });
      if ($("mazeNew"))
        $("mazeNew").onclick = () => {
          if (confirm("이 미로를 보관하고 새 미로 설계를 시작할까요?"))
            send("maze.new", { mazeId: data.maze.id });
        };
    }
  }
  function move(direction) {
    if (inflight || pending || !data?.maze.published || section() !== "maze")
      return;
    const p = walk.at(-1),
      next = p + ({ up: -15, down: 15, left: -1, right: 1 }[direction] || 0);
    if (
      next < 0 ||
      next >= 225 ||
      (direction === "left" && p % 15 === 0) ||
      (direction === "right" && p % 15 === 14) ||
      data.maze.cells[next]
    )
      return;
    if (walk.length >= 1200)
      return toast(
        "이동 기록이 길어졌어요. 입구로 돌아가 다시 도전해 주세요.",
        true,
      );
    walk.push(next);
    if ($("mazeMap")) $("mazeMap").innerHTML = mazeSVG(data.maze);
    if ($("mazePosition"))
      $("mazePosition").textContent =
        next === 224
          ? "출구에 도착했어요! 도착 기록을 저장해 주세요."
          : "이동 " +
            (walk.length - 1) +
            "칸 · 현재 " +
            (Math.floor(next / 15) + 1) +
            "행 " +
            ((next % 15) + 1) +
            "열";
  }
  window.addEventListener("keydown", (e) => {
    if (
      !location.hash.startsWith("#room/maze") ||
      e.target.closest("input,textarea,select") ||
      e.ctrlKey ||
      e.metaKey
    )
      return;
    const d = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      w: "up",
      s: "down",
      a: "left",
      d: "right",
    }[e.key];
    if (d && data?.maze.published) {
      e.preventDefault();
      move(d);
    }
  });
  function attachPad(id, key, base, max) {
    const canvas = $(id);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let activeStroke = null;
    function paint() {
      ctx.fillStyle = "#172c25";
      ctx.fillRect(0, 0, 1000, 1000);
      ctx.strokeStyle = "#304e3b";
      ctx.lineWidth = 2;
      for (let i = 100; i < 1000; i += 100) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 1000);
        ctx.moveTo(0, i);
        ctx.lineTo(1000, i);
        ctx.stroke();
      }
      for (const s of [...base, ...draws[key]]) {
        ctx.beginPath();
        s.points.forEach(([x, y], i) =>
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
        );
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 12;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }
    }
    const point = (e) => {
      const r = canvas.getBoundingClientRect();
      return [
        Math.max(
          0,
          Math.min(1000, Math.round(((e.clientX - r.left) / r.width) * 1000)),
        ),
        Math.max(
          0,
          Math.min(1000, Math.round(((e.clientY - r.top) / r.height) * 1000)),
        ),
      ];
    };
    canvas.onpointerdown = (e) => {
      if (inflight || pending || e.button > 0) return;
      if (draws[key].length >= max)
        return toast(
          key === "ink"
            ? "한 번에 한 획만 그려요. 저장하거나 초안을 지워 주세요."
            : "최대 10획으로 그려 주세요.",
          true,
        );
      canvas.setPointerCapture(e.pointerId);
      pen = true;
      activeStroke = { color: $(id + "Color").value, points: [point(e)] };
      draws[key].push(activeStroke);
      paint();
    };
    canvas.onpointermove = (e) => {
      if (!activeStroke || inflight) return;
      const p = point(e),
        last = activeStroke.points.at(-1);
      if (
        Math.hypot(p[0] - last[0], p[1] - last[1]) > 5 &&
        activeStroke.points.length < 2000
      ) {
        activeStroke.points.push(p);
        paint();
      }
    };
    const end = (e) => {
      if (!activeStroke) return;
      const pts = activeStroke.points;
      if (pts.length === 1)
        pts.push([
          Math.min(1000, pts[0][0] + 1),
          Math.min(1000, pts[0][1] + 1),
        ]);
      if (pts.length > 70)
        activeStroke.points = Array.from(
          { length: 70 },
          (_, i) => pts[Math.floor((i * (pts.length - 1)) / 69)],
        );
      activeStroke = null;
      pen = false;
      if (canvas.hasPointerCapture(e.pointerId))
        canvas.releasePointerCapture(e.pointerId);
      paint();
    };
    canvas.onpointerup = end;
    canvas.onpointercancel = end;
    document.querySelector(`[data-undo="${id}"]`).onclick = () => {
      draws[key].pop();
      paint();
    };
    document.querySelector(`[data-clear="${id}"]`).onclick = () => {
      draws[key] = [];
      paint();
    };
    paint();
  }
  return { load, render, teaser, isDirty, isSaving, cancel, reset };
}
