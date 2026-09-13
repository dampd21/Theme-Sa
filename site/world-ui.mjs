import { randomInt } from "./party-rules.mjs";
import {
  PLACES,
  TIMES,
  CLUES,
  MAIL,
  HIDDEN,
  PETS,
  COLORS,
  SYMBOLS,
  ARTIFACTS,
  GAME_INFO,
  APPRAISALS,
  CUSTOMERS,
  TEAS,
  LIAR,
} from "./world-content.mjs";
import {
  CASE_EVIDENCE,
  CASE_OPTIONS,
  CORRIDORS,
  PLOT,
  progress,
  unlocked,
  nextGoal,
} from "./world-content.mjs";
import {
  gameStep,
  replayGame,
  shadowMask,
  shadowTarget,
  CARDS,
  hints,
} from "./world-games.mjs";
import { townSVG, roomSVG, sealSVG } from "./world-art.mjs";
import { localDraft } from "./party-media.mjs";
import { CASES } from "./adventure-rules.mjs";
export function createWorldUI(H) {
  const { api, getActor, getState, esc, toast, requireActor } = H,
    $ = (id) => document.getElementById(id);
  let data = null,
    seen = "",
    loading = null,
    epoch = 0,
    loadedAt = 0,
    saving = false,
    pending = null,
    error = "",
    notice = "",
    tab = "home",
    play = null,
    finished = null,
    hintLevel = 0,
    draft = null,
    questPlay = null,
    petDraft = null,
    sealDraft = null,
    relayNote = "",
    relayTool = "lantern",
    query = "",
    adventures = null,
    subroom = "",
    localWarning = "",
    archiveLoading = false,
    stepping = false,
    toy = null,
    artifactNote = "";
  const current = () => location.hash.split("/")[0] === "#village";
  const p = () => data?.profile;
  const name = (id) =>
    getState().members.find((x) => x.id === id)?.name || "이전 동료";
  const dirty = () =>
    !!pending ||
    saving ||
    stepping ||
    !!draft ||
    !!petDraft ||
    !!sealDraft ||
    !!relayNote.trim() ||
    !!artifactNote.trim() ||
    !!(
      play &&
      JSON.stringify(play.actions) !== JSON.stringify(p()?.active?.actions)
    );
  const key = () => `world:${seen}`;
  async function remember(clearDraft = false) {
    if (!seen) return;
    const k = key(),
      ep = epoch,
      snapshot = {
        draft: draft ? structuredClone(draft) : null,
        play: play ? structuredClone(play) : null,
      };
    try {
      const old = await localDraft(k);
      if (ep !== epoch) return;
      await localDraft(k, {
        draft: clearDraft ? null : snapshot.draft || old?.draft || null,
        play: snapshot.play,
      });
      localWarning = "이 기기에 초안 보관됨";
    } catch {
      localWarning =
        "기기 초안 저장 실패 · 공동 저장 전에는 새로고침하지 마세요.";
    }
  }
  function cancel() {
    if (saving) return;
    void remember();
    draft = null;
    petDraft = null;
    sealDraft = null;
    toy = null;
    artifactNote = "";
    relayNote = "";
    questPlay = null;
    play = null;
    pending = null;
    finished = null;
    error = "";
  }
  function reset() {
    epoch++;
    data = null;
    loading = null;
    play = null;
    draft = null;
    petDraft = null;
    sealDraft = null;
    toy = null;
    artifactNote = "";
    pending = null;
    questPlay = null;
    relayNote = "";
    error = "";
    notice = "";
    seen = "";
    saving = false;
    stepping = false;
    adventures = null;
    archiveLoading = false;
    delete document.documentElement.dataset.reduceMotion;
  }
  function actorCheck() {
    if (seen !== getActor()) {
      reset();
      seen = getActor();
    }
  }
  async function load(force = false) {
    actorCheck();
    if (!seen) return;
    if (loading) return loading;
    if (data && !force) return data;
    const ep = epoch;
    loading = api("world?actor=" + encodeURIComponent(seen))
      .then(async (v) => {
        if (ep !== epoch) return;
        data = v;
        loadedAt = Date.now();
        if (!play)
          play = v.profile.active ? structuredClone(v.profile.active) : null;
        if (!force) {
          try {
            const local = await localDraft(key());
            if (ep !== epoch) return;
            if (
              local?.play &&
              play &&
              local.play.id === play.id &&
              play.actions.every(
                (a, i) =>
                  JSON.stringify(a) === JSON.stringify(local.play.actions[i]),
              )
            ) {
              replayGame(local.play);
              play = local.play;
            }
          } catch {
            localWarning = "기기 초안을 읽지 못해 공동 기록부터 이어갑니다.";
          }
        }
        error = "";
        return data;
      })
      .catch((e) => {
        if (ep === epoch) {
          error = e.message;
          if (e.status === 401) H.needLogin();
        }
      })
      .finally(() => {
        if (ep === epoch) {
          loading = null;
          if (current()) render();
        }
      });
    return loading;
  }
  async function send(action, extra = {}) {
    if (saving || pending || !requireActor()) return false;
    pending = structuredClone({
      version: 1,
      opId: crypto.randomUUID(),
      memberId: seen,
      issuedAt: (data?.now || Date.now()) + Math.max(0, Date.now() - loadedAt),
      rev: p().rev,
      action,
      ...extra,
    });
    return retry();
  }
  async function retry() {
    if (!pending || saving) return false;
    const body = pending,
      ep = epoch;
    saving = true;
    error = "";
    render();
    try {
      const r = await api("world", "POST", body);
      if (ep !== epoch) return false;
      data = r.data;
      loadedAt = Date.now();
      pending = null;
      notice = "공동 저장 완료 · " + new Date().toLocaleTimeString("ko-KR");
      if (["gameStart", "gameSave", "gameAbandon"].includes(body.action)) {
        if (body.action === "gameSave" && play) {
          const result = replayGame(play);
          if (result.status !== "active") finished = result;
        }
        play = p().active ? structuredClone(p().active) : null;
        hintLevel = 0;
      }
      if (body.action === "questSave") draft = null;
      if (body.action === "pet") petDraft = null;
      if (body.action === "seal") sealDraft = null;
      if (body.action === "relay") relayNote = "";
      await remember(body.action === "questSave");
      return true;
    } catch (e) {
      if (ep === epoch) {
        error = e.message;
        if (e.status === 400) pending = null;
        if (e.status === 401) H.needLogin();
      }
      return false;
    } finally {
      if (ep === epoch) {
        saving = false;
        render();
      }
    }
  }
  const btn = (a, label, attrs = "", cls = "") =>
    `<button type="button" data-world="${a}" ${attrs} class="${cls}">${label}</button>`;
  const art = (id) => ARTIFACTS.find((x) => x[0] === id) || [id, "✦", id];
  function teaser() {
    return `<a class="world-teaser" href="#village"><span>🌌</span><div><small>THE VILLAGE THAT REMEMBERS YOU</small><h3>기록실 밖에도, 우리의 이야기가 있어요.</h3><p>살아 있는 마을 · 수호령 · 7가지 새 게임 · 함께 쓰는 미스터리</p></div><b>이어서 떠나기 ↗</b></a>`;
  }
  function render() {
    if (!current()) return;
    actorCheck();
    if (!data && !loading && !error) void load();
    if (data)
      document.documentElement.dataset.reduceMotion = String(p().prefs.motion);
    $("view").innerHTML =
      `<div class="world-shell"><header class="world-heading"><div><p class="eyebrow">MOONLIGHT VILLAGE · EDITION 09</p><h1>다시 돌아온 당신에게.</h1><p>혼자라도 괜찮아요. 우리들의 흔적은 이곳에 남으니까.</p></div>${btn("settings", "⚙ 편안한 환경")}</header><nav class="world-tabs">${[
        ["home", "🏡 기록실"],
        ["town", "🗺️ 마을"],
        ["mail", "✉️ 우편함"],
        ["atelier", "🦊 동료 · 공방"],
        ["games", "🎮 놀이와 퍼즐"],
        ["together", "🤝 함께"],
        ["quests", "📝 의뢰 제작소"],
        ["journal", "📖 수첩 · 연대기"],
      ]
        .map(
          ([id, label]) =>
            `<button data-wtab="${id}" aria-pressed="${tab === id}">${label}</button>`,
        )
        .join(
          "",
        )}</nav><div class="world-status" role="status">${saving ? "기록을 함께 보관하고 있어요…" : esc(notice)}</div>${error ? `<div class="callout world-error" role="alert">${esc(error)}<div class="head-actions">${pending ? btn("retry", "같은 요청 다시 저장") + btn("reconcile", "최신 기록 확인 · 초안 유지") : btn("reload", "다시 불러오기")}${play ? btn("useRemote", "내 게임 초안을 버리고 공동 지점으로") : ""}</div></div>` : ""}<fieldset id="worldFields" ${saving || stepping || pending ? "disabled" : ""}>${!data ? '<section class="panel">마을 기록을 불러오는 중…</section>' : ({ home: homeHTML, town: townHTML, mail: mailHTML, atelier: atelierHTML, games: gamesHTML, together: togetherHTML, quests: questsHTML, journal: journalHTML, settings: settingsHTML, rooms: roomsHTML }[tab] || homeHTML)()}</fieldset><p class="world-footer">공동 저장과 기기 초안은 별개 · 출석·결제·동시 접속 없이 진행 · 활동 프로필은 본인 인증이 아닙니다.</p></div>`;
    document.querySelectorAll("[data-wtab]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (saving || pending) return;
          if (
            dirty() &&
            !confirm(
              "초안은 이 기기에 보관하고 이동할까요? 부적·수호령 입력과 인계 메모는 먼저 저장해 주세요.",
            )
          )
            return;
          await remember();
          draft = null;
          petDraft = null;
          sealDraft = null;
          relayNote = "";
          questPlay = null;
          tab = b.dataset.wtab;
          if (tab === "journal") void loadAdventures();
          render();
        }),
    );
    document.querySelectorAll("[data-world]").forEach(
      (b) =>
        (b.onclick = () =>
          handle(b.dataset.world, b.dataset).catch((e) => {
            error = e.message;
            toast(e.message, true);
            render();
          })),
    );
    wire();
  }
  function homeHTML() {
    const me = p();
    return `<section class="world-room">${roomSVG(me, data.barrier)}<div class="world-room-caption"><small>A HOUSE THAT REMEMBERS</small><h2>${me.plot.length === 4 ? "돌아갈 집의 문이 열렸어요." : me.clues.length ? "오늘도 당신의 흔적이 남았습니다." : "처음의 발자국을 기다리고 있어요."}</h2><p>${me.clues.length ? "현관의 발자국, 벽의 그림, 선반의 유물은 실제 진행에 따라 달라집니다." : "마을을 조사하면 현관에 발자국이, 편지를 쓰면 액자에 답장이 생겨요."}</p></div></section><section class="panel world-resume"><div><p class="eyebrow">WHERE WE LEFT OFF</p><h2>${esc(nextGoal(me))}</h2><p>마지막 장소: ${PLACES.find((x) => x.id === me.place).name} · ${TIMES[me.time]} / 발견 ${me.clues.length}/24 · 편지 ${me.mail.length}/4</p></div>${btn("continue", "바로 이어 하기 →", "", "primary")}</section><div class="world-grid">${HIDDEN.map((r) => `<section class="panel world-card"><span class="world-icon">${r.icon}</span><h3>${r.name}</h3><p>${r.description}</p><small>${unlocked(me, r.id) ? "새로운 문이 열려 있어요." : `발견·완주·답장 ${r.need}개부터 · 현재 ${progress(me)}`}</small>${btn("room", unlocked(me, r.id) ? "문 열기" : "아직 잠긴 문", `data-id="${r.id}" ${unlocked(me, r.id) ? "" : "disabled"}`)}</section>`).join("")}</div><section class="panel"><h2>🌱 함께 복원한 결계 · ${Math.min(24, data.barrier)}/24</h2><progress max="24" value="${Math.min(24, data.barrier)}"></progress><p>${data.barrier >= 24 ? "강변 축제의 불빛과 기록실의 장식이 모두에게 열렸어요." : data.barrier >= 12 ? "결계의 길이 이어지고 있습니다. 새로운 발견과 게임 완주로 함께 채워요." : "조사·답장·게임 완주처럼 새로운 경험 하나가 빛 하나가 됩니다. 같은 일을 반복해 채우지 않아도 돼요."}</p></section><div class="world-shortcuts"><a href="#party">🏆 사진 월드컵 · 복불복 8종</a><a href="#adventure">🚉 심야 열차 · 뒷문 모험</a><a href="#room">🌿 기존 공용 아지트</a><a href="#training">⚔️ 퇴마 훈련소</a></div>`;
  }
  function townHTML() {
    const me = p(),
      place = PLACES.find((x) => x.id === me.place),
      index = Object.keys(TIMES).indexOf(me.time),
      reply = me.mail.find(
        (x) =>
          x.id ===
          { station: "passenger", theater: "doll", tea: "window" }[place.id],
      );
    return `<section class="world-map">${townSVG(me.time, data.barrier)}<div class="world-map-title"><small>EIGHT PLACES / ONE HOME</small><h2>달빛 마을</h2></div>${PLACES.map((x) => btn("visit", `${x.icon}<span>${x.name}</span>`, `data-id="${x.id}" style="left:${x.x}%;top:${x.y}%"`, "world-map-pin")).join("")}</section><section class="panel"><div class="split"><div><p class="eyebrow">${TIMES[me.time]} / ${place.npc}</p><h2>${place.icon} ${place.name}</h2></div><div class="head-actions">${Object.entries(
      TIMES,
    )
      .map(([t, label]) =>
        btn("time", label, `data-id="${t}" aria-pressed="${t === me.time}"`),
      )
      .join(
        "",
      )}</div></div><p>${place.detail}</p>${me.pet ? `<p class="callout">${PETS[me.pet.kind][0]} ${esc(me.pet.name)}가 함께 걷고 있어요. ${me.plot.length === 4 ? "집의 열쇠가 따뜻하게 빛나는 걸 바라봅니다." : "새로운 단서 곁에서 작은 빛을 흔듭니다."}</p>` : ""}<blockquote>${place.scenes[index]}</blockquote>${reply ? `<div class="callout">${place.npc}: ${MAIL.find((m) => m.id === reply.id).replies[reply.choice]}</div>` : ""}<p class="hint">실제 시각과 무관하게 시간대를 바꿀 수 있어요. 이동하거나 시간대를 바꾸면 그곳의 단서를 공동 저장합니다.</p><div class="head-actions">${btn("explore", "지금 장소 다시 조사")}${btn("npc", "주민과 이야기")}</div>${
      me.prefs.ghost
        ? `<div class="world-traces"><h3>동료가 남긴 희미한 등불</h3>${
            data.traces
              .filter((t) => t.place === place.id && t.time === me.time)
              .slice(-6)
              .map(
                (t) =>
                  `<p>🕯️ ${esc(name(t.owner))}도 이곳에서 잠시 풍경을 바라보았어요.</p>`,
              )
              .join("") ||
            '<p class="hint">아직 이 시간대에 남은 흔적이 없어요. 정답이나 선택은 공개하지 않습니다.</p>'
          }</div>`
        : '<p class="hint">환경 설정에서 ‘흔적 동행’을 켜면 동의한 동료의 방문 흔적을 볼 수 있어요.</p>'
    }</section>`;
  }
  function mailHTML() {
    return `<section class="world-letter-hero"><span>✉️</span><div><p class="eyebrow">LETTERS NEVER EXPIRE</p><h2>도착하지 못했던 마음들.</h2><p>놓친 편지는 사라지지 않아요. 답장을 쓰면 다음 편지가 이어집니다.</p></div></section>${MAIL.map(
      (m) => {
        const answer = p().mail.find((x) => x.id === m.id),
          open = p().mail.length >= m.need;
        return `<article class="panel world-letter"><div class="split"><small>${open ? m.from : "아직 길을 건너오는 편지"}</small><span>${answer ? "답장 완료" : open ? "새 편지" : "앞선 편지에 답장하면 도착"}</span></div><h2>${open ? m.title : "봉인된 편지"}</h2>${open ? `<p class="prose">${m.body}</p>${answer ? `<blockquote>나의 답장: ${m.choices[answer.choice]}<br><br>${m.replies[answer.choice]}</blockquote>` : `<div class="head-actions">${m.choices.map((x, i) => btn("mail", x, `data-id="${m.id}" data-choice="${i}"`)).join("")}</div>`}` : ""}</article>`;
      },
    ).join("")}`;
  }
  function atelierHTML() {
    const me = p(),
      pet = petDraft ||
        me.pet || {
          kind: "fox",
          name: "모루의 친구",
          color: COLORS[0],
          home: "창가",
        },
      seal = sealDraft || me.seal;
    return `<div class="world-two"><section class="panel world-pet"><p class="eyebrow">A SMALL COMPANION</p><div class="world-pet-face" style="--pet-color:${pet.color}">${PETS[pet.kind][0]}</div><h2>${me.pet ? esc(me.pet.name) : "나만의 수호령을 만나 보세요"}</h2><p>${me.pet ? `함께한 인사 ${me.pet.bond}/30 · ${me.pet.home}에서 쉬고 있어요.` : "오래 비워도 굶거나 떠나지 않아요. 능력치 경쟁 없이 함께하는 친구입니다."}</p><div class="world-form"><label>종류<select id="worldPetKind">${Object.entries(
      PETS,
    )
      .map(
        ([id, [icon, title]]) =>
          `<option value="${id}" ${pet.kind === id ? "selected" : ""}>${icon} ${title}</option>`,
      )
      .join(
        "",
      )}</select></label><label>이름<input id="worldPetName" maxlength="30" value="${esc(pet.name)}"></label><label>빛깔<select id="worldPetColor">${COLORS.map((c, i) => `<option value="${c}" ${pet.color === c ? "selected" : ""}>빛깔 ${i + 1}</option>`).join("")}</select></label><label>잠자리<select id="worldPetHome">${["창가", "책상", "다락"].map((x) => `<option ${pet.home === x ? "selected" : ""}>${x}</option>`).join("")}</select></label></div><div class="head-actions">${btn("pet", "수호령 저장", "", "primary")}${me.pet ? btn("care", "쓰다듬고 인사하기") + btn("toyStart", "수호령과 숨은 별 찾기") : ""}</div>${me.pet ? `<blockquote>${me.artifacts.includes("plot") ? "돌아갈 집의 열쇠에서 따뜻한 냄새가 나요!" : me.artifacts.includes("appraisal") ? "우산 아래에서 같이 비를 바라볼까요?" : "오늘도 당신과 함께여서 좋아요."}</blockquote>` : ""}${toy ? `<p>작은 상자 셋 중 별 하나를 찾아 주세요. 결과는 기기 내 작은 놀이이며 XP는 없습니다.</p><div class="head-actions">${[0, 1, 2].map((i) => btn("toyPick", toy.open.includes(i) ? (i === toy.target ? "⭐ 찾았어요!" : "🍃 빈 상자") : "🎁 상자 " + (i + 1), `data-index="${i}" ${toy.done || toy.open.includes(i) ? "disabled" : ""}`)).join("")}</div>` : ""}${me.pet ? `<hr><h3>작은 심부름</h3>${me.pet.mission ? `<p>돌아올 준비: ${new Date(me.pet.mission.ready).toLocaleTimeString("ko-KR")} · 1분 뒤나 다음 방문에 확인하세요.</p>${btn("claim", "돌아온 선물 확인")}` : `<p class="hint">실패나 출석 손해가 없는 짧은 심부름입니다.</p><div class="head-actions">${["강변의 바람", "시장의 지붕", "역의 벤치"].map((x, i) => btn("errand", x, `data-route="${i}"`)).join("")}</div>`}` : ""}</section><section class="panel"><p class="eyebrow">MOONLIGHT ATELIER</p><h2>직접 만드는 부적</h2><div id="worldSealPreview" class="world-seal">${sealSVG(seal)}</div><div class="world-form"><label>부적 이름<input id="worldSealName" maxlength="40" value="${esc(seal.name)}"></label><label>부적에 담은 마음<textarea id="worldSealDescription" maxlength="300">${esc(seal.description || "")}</textarea></label><label>중심 문양<select id="worldSealSymbol">${SYMBOLS.map((x, i) => `<option value="${x}" ${seal.symbol === x ? "selected" : ""}>${["달", "별", "잎", "물결", "눈", "마음"][i]}</option>`).join("")}</select></label><label>색<select id="worldSealColor">${COLORS.map((x, i) => `<option value="${x}" ${seal.color === x ? "selected" : ""}>빛깔 ${i + 1}</option>`).join("")}</select></label><label>장식<select id="worldSealPattern">${[0, 1, 2, 3].map((x) => `<option value="${x}" ${seal.pattern === x ? "selected" : ""}>무늬 ${x + 1}</option>`).join("")}</select></label></div><div class="head-actions">${btn("seal", "부적 저장", "", "primary")}${btn("png", "PNG 내려받기")}</div><label>동료에게 저장된 부적의 사본 보내기<select id="worldGiftTo">${getState()
      .members.filter((x) => x.id !== seen)
      .map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`)
      .join(
        "",
      )}</select></label>${btn("gift", "선물 보내기")}</section></div><section class="panel"><h2>말하는 유물 진열장</h2><p class="hint">획득한 유물 중 최대 세 개를 골라 진열하세요. 두 유물의 조합은 새로운 짧은 이야기를 들려줍니다.</p><div class="world-artifacts">${
      me.artifacts
        .map((id) => {
          const a = art(id);
          return btn(
            "display",
            `${a[1]} ${a[2]}`,
            `data-id="${id}" aria-pressed="${me.display.includes(id)}"`,
          );
        })
        .join("") || "<p>게임과 마을의 이야기를 완주하면 유물이 남아요.</p>"
    }</div><blockquote>${artifactStory(me.display)}</blockquote><details><summary>동료들의 유물 해석 쪽지</summary><label>유물<select id="worldNoteArtifact">${ARTIFACTS.map((a) => `<option value="${a[0]}">${a[1]} ${a[2]}</option>`).join("")}</select></label><label>해석 · 감상<textarea id="worldArtifactNote" maxlength="300">${esc(artifactNote)}</textarea></label>${btn("artifactNote", "쪽지 함께 보관")}${data.artifactNotes.map((n) => `<blockquote><small>${esc(name(n.owner))} · ${art(n.artifact)[2]}</small><p>${esc(n.text)}</p>${n.owner === seen ? btn("artifactNoteDelete", "내 쪽지 삭제", `data-id="${n.id}"`) : ""}</blockquote>`).join("")}</details></section><section class="panel"><h2>동료에게서 온 부적</h2><div class="world-grid">${
      data.gifts
        .filter((g) => g.to === seen)
        .map(
          (g) =>
            `<div><div class="world-seal small">${sealSVG(g.seal)}</div><p>${esc(name(g.from))}의 선물 · ${esc(g.seal.name)}</p><p>${esc(g.seal.description || "")}</p>${btn("giftDelete", "선물함에서 정리", `data-id="${g.id}"`)}</div>`,
        )
        .join("") ||
      '<p class="hint">받은 부적은 이곳에서 감상할 수 있어요.</p>'
    }</div></section>`;
  }
  function artifactStory(ids) {
    if (ids.includes("appraisal") && ids.includes("shop"))
      return "우산이 찻잔을 감쌉니다. “비가 멎지 않아도 함께 앉아 있으면 괜찮아.”";
    if (ids.includes("shadow") && ids.includes("liar"))
      return "촛불이 거울에 닿자 인형의 다른 표정이 나타났습니다. “보이는 것만으로 판단하지 마.”";
    if (ids.includes("stars") && ids.includes("deck"))
      return "별이 부적 위에 길을 그립니다. 이제 누구든 다음 여행을 시작할 수 있어요.";
    if (ids.length >= 2)
      return `${art(ids[0])[2]} 옆에서 ${art(ids[1])[2]}이 작은 빛을 냅니다. 서로 다른 이야기도 같은 선반에 머물 수 있네요.`;
    return ids.length
      ? "아직 짝을 기다리는 작은 이야기가 놓여 있어요."
      : "빈 선반이 다음 귀환을 기다립니다.";
  }
  function roomsHTML() {
    const me = p(),
      r = HIDDEN.find((x) => x.id === subroom);
    if (!r || !unlocked(me, r.id))
      return '<section class="panel">아직 열리지 않은 방이에요.</section>';
    let html = "";
    if (r.id === "greenhouse")
      html = `<div class="world-growth">${["🪴", "🌱", "🌿", "🌿", "🌸"][me.plant]}</div><p>성장 ${me.plant}/4 · 물주기와 돌봄으로 자랍니다. 하루를 놓쳐도 시들지 않아요.</p>${btn("plant", me.plant === 4 ? "활짝 피었어요" : "씨앗 심기 · 물 주기", me.plant === 4 ? "disabled" : "")}`;
    if (r.id === "lost")
      html = `<p>낡은 가방 안에 열차 승차권과 승객을 기다리는 기록이 있습니다. 이 가방의 주인은 누구일까요?</p><div class="head-actions">${["윤", "비연", "루미"].map((x) => btn("lost", x, `data-id="${x}"`)).join("")}</div><p>${me.lost ? "승무원 윤이 가방을 받고 작은 미소를 지었어요." : me.artifacts.includes("appraisal") ? "유물 감정 경험으로 승차권의 주인을 알아볼 수 있어요." : "먼저 유물 감정소를 완주해 물건을 살피는 법을 익혀 주세요."}</p>`;
    if (r.id === "mirror")
      html = `<p>${me.prefs.eerie ? "거울 속 내가 한 박자 늦게 고개를 끄덕입니다. 문은 언제든 나갈 수 있도록 열려 있어요." : "안전한 거울 속에서 다른 답장을 보낸 나의 이야기를 읽어요."}</p>${
        me.mail
          .map((x) => {
            const m = MAIL.find((v) => v.id === x.id);
            return `<details><summary>${m.title} · 고르지 않은 답장</summary><p>${m.choices[1 - x.choice]}</p><blockquote>${m.replies[1 - x.choice]}</blockquote></details>`;
          })
          .join("") || "<p>편지에 답장을 쓰면 거울 속 이야기가 생겨요.</p>"
      }`;
    if (r.id === "radio")
      html = `<p>주파수 암호: 창문의 별 셋, 등불 하나, 네 방향의 길.</p><div class="world-form">${[0, 1, 2].map((i) => `<label>${i + 1}번 주파수<select id="radio-${i}">${[0, 1, 2, 3, 4, 5].map((v) => `<option>${v}</option>`).join("")}</select></label>`).join("")}</div>${btn("radio", "주파수 맞추기")}${me.radio ? "<blockquote>“돌아올 자리는 언제나 남아 있어요.” 먼 곳에서 기다리던 목소리가 들렸습니다.</blockquote>" : ""}`;
    if (r.id === "rainroom")
      html = `<div class="world-growth">☔ 🍵</div><blockquote>우산 요괴: 전에는 비가 오는 날마다 제가 쓸모없어진 줄 알았어요. 이제는 비가 오면 누군가의 곁에 앉을 수 있다는 걸 알아요.</blockquote><p>요괴에게 어울리는 차를 만들어 보고 싶다면 야간 상점으로 가 보세요.</p>${btn("games", "야간 상점과 퍼즐 보러 가기")}`;
    return `<section class="panel"><div class="split"><h2>${r.icon} ${r.name}</h2>${btn("home", "기록실로")}</div>${html}</section>`;
  }
  function gamesHTML() {
    if (play) return playHTML();
    return `${finished ? `<section class="panel world-victory"><span>${finished.status === "won" ? "🏆" : "🌙"}</span><h2>${finished.status === "won" ? "이야기 하나를 완성했어요." : "괜찮아요. 다른 방법으로 다시 해 봐요."}</h2><p>${esc(finished.note || "새 유물과 연대기를 확인해 보세요.")}</p><p>공동 저장 완료 · 기존 훈련 XP와 순위는 바뀌지 않습니다.</p></section>` : ""}<div class="world-grid">${Object.entries(
      GAME_INFO,
    )
      .map(
        ([id, [icon, title, desc]]) =>
          `<section class="panel world-card"><span class="world-icon">${icon}</span><h2>${title}</h2><p>${desc}</p><label>단계<select id="level-${id}">${[0, 1, 2].map((n) => `<option value="${n}">${n + 1}단계 ${p().wins.includes(id + ":" + n) ? "· 완주" : ""}</option>`).join("")}</select></label>${btn("gameStart", "시작하기", `data-id="${id}"`, "primary")}</section>`,
      )
      .join(
        "",
      )}</div><section class="panel"><h2>🏆 기존 놀이도 그대로</h2><div class="world-shortcuts"><a href="#party">사진 월드컵 · 복불복 8종</a><a href="#training">일곱 가지 퇴마 훈련</a><a href="#room">끝말잇기 · 그림 · 공동 미로</a></div></section>`;
  }
  function playHTML() {
    const s = replayGame(play),
      info = GAME_INFO[s.type];
    let html = "";
    if (s.type === "tactics")
      html = `<p>🦊를 움직여 모든 요괴 👻를 결계 ✦ 위로 밀어 주세요. 당길 수 없으므로 모서리를 조심하세요.</p><div class="world-board tactics" style="grid-template-columns:repeat(${s.width},1fr)">${Array.from({ length: s.width * s.width }, (_, i) => `<div class="${s.walls.includes(i) ? "wall" : s.goals.includes(i) ? "goal" : ""}">${s.player === i ? "🦊" : s.ghosts.includes(i) ? "👻" : s.goals.includes(i) ? "✦" : ""}</div>`).join("")}</div><div class="world-dpad">${[
        ["up", "↑"],
        ["left", "←"],
        ["down", "↓"],
        ["right", "→"],
      ]
        .map(([a, label]) =>
          btn("step", label, `data-move="${a}" aria-label="${a}"`),
        )
        .join("")}</div>`;
    if (s.type === "appraisal") {
      const item = APPRAISALS[(s.index + s.level) % 5];
      html = `<div class="world-object">${item.icon}</div><h3>${item.name} · ${s.index + 1}/5</h3><p>남은 판단 ${s.lives}</p><div class="head-actions">${["빛에 비추기", "종소리 들려주기", "표면 관찰하기"].map((x, i) => btn("step", x, `data-inspect="${i}" ${s.inspected.includes(i) ? "disabled" : ""}`)).join("")}</div>${s.inspected.map((i) => `<blockquote>${item.tests[i]}</blockquote>`).join("")}<div class="head-actions">${[
        ["safe", "안전한 물건"],
        ["return", "주인에게 돌려주기"],
        ["seal", "먼저 봉인하기"],
      ]
        .map(([a, label]) =>
          btn(
            "step",
            label,
            `data-judge="${a}" ${s.inspected.length < 3 ? "disabled" : ""}`,
          ),
        )
        .join("")}</div>`;
    }
    if (s.type === "shop") {
      const c = CUSTOMERS[(s.index + s.level) % 5];
      html = `<div class="world-object">${c[0]}</div><h3>${c[1]} · ${s.index + 1}/5</h3><blockquote>${c[2]}</blockquote><p>남은 주문 기회 ${s.lives} · 시간 제한 없음</p><div class="world-artifacts">${TEAS.map((x) => btn("step", "🍵 " + x, `data-tea="${x}"`)).join("")}</div>`;
    }
    if (s.type === "shadow") {
      const actual = shadowMask(s.rots, s.shifts),
        target = shadowTarget(s.level);
      html = `<p>빛이 비추는 세 조각을 돌리고 옮겨 목표 그림자와 같은 칸을 채워 보세요.</p><div class="world-two"><div><h3>목표</h3>${shadowGrid(target)}</div><div><h3>현재</h3>${shadowGrid(actual)}</div></div><div class="world-shadow-controls">${[0, 1, 2].map((i) => `<div><b>조각 ${i + 1}</b><small>회전 ${s.rots[i]} / 이동 ${s.shifts[i]}</small>${btn("step", "↻ 90°", `data-piece="${i}" data-kind="rotate"`)}${btn("step", "→ 한 칸", `data-piece="${i}" data-kind="shift"`)}</div>`).join("")}</div>${btn("step", "그림자 확인", 'data-check="1"', "primary")}`;
    }
    if (s.type === "liar") {
      const q = LIAR[(s.index + s.level) % 3];
      html = `<h3>거짓말하는 방 ${s.index + 1}/3</h3><p>참인 안내문은 정확히 <b>${q.truth}개</b>입니다. 안전한 문은 하나예요. 남은 판단 ${s.lives}.</p>${q.lines.map((x) => `<blockquote>${x}</blockquote>`).join("")}<div class="head-actions">${["왼쪽", "가운데", "오른쪽"].map((x, i) => btn("step", "🚪 " + x, `data-door="${i}"`)).join("")}</div>`;
    }
    if (s.type === "stars") {
      const req = [
          [3, 6, 8],
          [2, 4, 9],
          [1, 7, 8],
        ][s.level],
        points = s.path.map(
          (i) => `${70 + (i % 4) * 100},${60 + Math.floor(i / 4) * 100}`,
        );
      html = `<p>금색 별 ${req.map((x) => x + 1).join("·")}을 모두 지나 12번으로 가세요. 가로·세로 이웃한 별만 연결하며, 지나간 별과 선은 다시 쓸 수 없습니다.</p><div class="world-stars"><svg viewBox="0 0 440 330" aria-hidden="true"><polyline points="${points.join(" ")}" fill="none" stroke="#ecd492" stroke-width="4"/></svg>${Array.from({ length: 12 }, (_, i) => btn("step", `${req.includes(i) ? "✦" : "✧"}<small>${i + 1}</small>`, `data-star="${i}" style="left:${(70 + (i % 4) * 100) / 4.4}%;top:${(60 + Math.floor(i / 4) * 100) / 3.3}%" ${s.path.includes(i) ? "disabled" : ""}`, req.includes(i) ? "required" : "")).join("")}</div>`;
    }
    if (s.type === "deck") {
      html = `<div class="world-deck-stats"><span>🌿 생명 ${s.hp}/16</span><span>길 ${s.battle + 1}/5</span><span>👻 기운 ${Math.max(0, s.enemy)} / 마음 ${Math.max(0, s.resolve)}</span></div>${
        s.reward
          ? `<h3>만남 뒤의 작은 선물</h3><div class="head-actions">${[
              ["rest", "생명 +5"],
              ["sun", "새벽 카드 추가"],
              ["peace", "평온 카드 추가"],
            ]
              .map(([id, label]) => btn("step", label, `data-reward="${id}"`))
              .join("")}</div>`
          : `<blockquote>다음 공격 예고: ${2 + (s.battle % 2)}. 상대의 기운 또는 마음을 0으로 만들면 길이 열립니다.</blockquote><div class="world-hand">${[
              0, 1, 2,
            ]
              .map((i) => {
                const c = CARDS[s.cards[(s.cursor + i) % s.cards.length]];
                return btn(
                  "step",
                  `<span>${c[0]}</span><b>${c[1]}</b><small>${c[2]}</small>`,
                  `data-card="${i}"`,
                );
              })
              .join("")}</div>`
      }`;
    }
    return `<section class="panel world-game"><div class="split"><div><p class="eyebrow">PLAY AT YOUR OWN PACE · ${play.level + 1}</p><h2>${info[0]} ${info[1]}</h2></div>${btn("gameAbandon", "이 게임 종료")}</div>${s.note ? `<div class="callout">${esc(s.note)}</div>` : ""}${html}<div class="world-game-save"><p>${s.steps}/240 행동 · ${esc(localWarning)}<br>다른 기기에서 이어 하려면 공동 저장하세요.</p>${btn("gameSave", "지금 공동 저장", "", "primary")}</div><details ${hintLevel ? "open" : ""}><summary>막혔을 때 · 단계형 힌트</summary>${hintLevel ? `<p>${esc(hints(s)[hintLevel - 1])}</p>` : ""}${btn("hint", hintLevel < 3 ? "힌트 한 단계 더 보기" : "전체 풀이", hintLevel >= 3 ? "disabled" : "")}</details></section>`;
  }
  function shadowGrid(cells) {
    return `<div class="world-board shadow">${Array.from({ length: 16 }, (_, i) => `<div class="${cells.includes(i) ? "lit" : ""}"></div>`).join("")}</div>`;
  }
  function togetherHTML() {
    const r = data.relay,
      c = CORRIDORS[(r.floor - 1) % CORRIDORS.length],
      available = [...new Set([...p().caseFound, ...data.caseFound])],
      assigned = getState().members.findIndex((x) => x.id === seen) % 4;
    return `<section class="panel"><p class="eyebrow">DIFFERENT CLUES, ONE TRUTH</p><h2>서로 다른 단서 · 사라진 편지</h2><p>내 담당 자료: <b>${CASE_EVIDENCE[assigned]?.[0] || CASE_EVIDENCE[0][0]}</b>. 혼자라면 나머지 자료도 직접 조사할 수 있어요. 동료와 함께라면 확인한 자료를 사건판에 올려 주세요.</p><div class="world-grid">${CASE_EVIDENCE.map(([title, body], i) => `<article class="world-evidence"><h3>${title}</h3>${available.includes(i) ? `<p>${body}</p>` : "<p>아직 조사하지 않은 자료</p>"}<div class="head-actions">${btn("caseInspect", "자료 조사", `data-index="${i}" ${p().caseFound.includes(i) ? "disabled" : ""}`)}${btn("caseShare", data.caseFound.includes(i) ? "공유됨" : "사건판에 공유", `data-index="${i}" ${!p().caseFound.includes(i) || data.caseFound.includes(i) ? "disabled" : ""}`)}</div></article>`).join("")}</div><h3>편지는 어디에서 전달됐을까요?</h3><div class="head-actions">${CASE_OPTIONS.map((x, i) => btn("caseSolve", x, `data-answer="${i}" ${available.length < 4 ? "disabled" : ""}`)).join("")}</div><p>${data.caseSolved ? "🔍 공동 사건판에 해결 표시가 남았습니다. 아직인 동료도 자기 자료로 완주할 수 있어요." : "네 자료의 시간과 장소, 종이 섬유를 함께 비교하세요."}</p></section><section class="panel"><p class="eyebrow">LEAVE A LIGHT FOR THE NEXT PERSON</p><h2>이어 달리는 복도 · ${r.floor}번째 방</h2><p>${c[0]}</p><blockquote>${c[1]}</blockquote>${r.tool === c[3] ? '<p class="callout">앞사람의 준비물이 도움이 됐어요. 안내문을 그대로 따르면 안전한 문이 보입니다.</p>' : ""}<label>다음 사람에게 남길 메모<textarea id="worldRelayNote" maxlength="300" rows="3">${esc(relayNote)}</textarea></label><label>남겨 둘 준비물<select id="worldRelayTool">${[
      ["lantern", "기억 등불"],
      ["bell", "작은 종"],
      ["mirror", "손거울"],
      ["compass", "귀환 나침반"],
      ["letter", "빈 편지"],
      ["thread", "붉은 실"],
    ]
      .map(
        ([id, title]) =>
          `<option value="${id}" ${relayTool === id ? "selected" : ""}>${title}</option>`,
      )
      .join(
        "",
      )}</select></label><div class="head-actions">${["왼쪽", "가운데", "오른쪽"].map((x, i) => btn("relay", "🚪 " + x, `data-door="${i}"`)).join("")}</div><p class="hint">동시에 접속할 필요 없어요. 혼자 계속해도 됩니다. 여섯 종류의 작성된 방이 순환하는 절차형 복도이며 무한 AI 생성은 아닙니다.</p><details><summary>앞사람이 남긴 인계 메모</summary>${
      r.history
        .slice()
        .reverse()
        .map(
          (x) =>
            `<blockquote><b>${x.floor}층 · ${esc(name(x.owner))}</b><p>${esc(x.note || "조용히 등불만 남겼습니다.")}</p></blockquote>`,
        )
        .join("") || "<p>첫 번째 흔적을 남겨 주세요.</p>"
    }</details></section><section class="panel"><h2>함께 사는 동료들</h2><div class="world-grid">${data.neighbors.map((n) => `<article class="world-evidence"><h3>${esc(name(n.id))}</h3><p>${n.pet ? PETS[n.pet.kind][0] + " " + esc(n.pet.name) : "아직 수호령을 기다리는 중"}</p><p>${n.display.map((id) => art(id)[1] + " " + art(id)[2]).join(" · ") || "아직 비어 있는 진열장"}</p></article>`).join("")}</div></section>`;
  }
  function questTemplate() {
    return {
      title: "밤의 잃어버린 열쇠",
      place: "tea",
      intro: "찻집의 열쇠가 사라졌어요. 세 흔적을 살펴 주인을 찾아 주세요.",
      clues: [
        "강변의 발자국은 젖지 않았다.",
        "열쇠 고리에 작은 찻잔이 달렸다.",
        "찻집 주인이 빈 주머니를 찾고 있었다.",
      ],
      options: ["찻집 주인", "승무원", "인형"],
      answer: 0,
      success: "열쇠를 돌려받은 찻집 주인이 따뜻한 차를 내어 주었습니다.",
      failure: "세 단서의 공통점을 다시 찾아보세요.",
      hints: [
        "열쇠 고리를 살펴보세요.",
        "찻잔과 빈 주머니를 연결해 보세요.",
        "정답은 찻집 주인입니다.",
      ],
    };
  }
  function questScene(q, self = false) {
    const seenClues = q.seen || [],
      d = q.data;
    return `<section class="panel"><p class="eyebrow">${self ? "PRIVATE PLAYTEST" : "A FRIEND’S SMALL MYSTERY"}</p><h2>${esc(d.title)}</h2><p>${esc(d.intro)}</p><div class="world-grid">${d.clues.map((c, i) => `<div class="world-evidence">${btn(self ? "testInspect" : "questInspect", `🔍 조사 지점 ${i + 1}`, `data-index="${i}"`)}${seenClues.includes(i) ? `<p>${esc(c)}</p>` : ""}</div>`).join("")}</div><div class="head-actions">${d.options.map((x, i) => btn(self ? "testAnswer" : "questAnswer", esc(x), `data-answer="${i}"`)).join("")}</div>${q.done ? `<blockquote>${esc(d.success)}</blockquote>` : ""}<details><summary>단계형 힌트</summary>${d.hints.map((h, i) => `<details><summary>${i + 1}단계 ${i === 2 ? "· 풀이" : ""}</summary><p>${esc(h)}</p></details>`).join("")}</details></section>`;
  }
  function questsHTML() {
    if (draft) {
      const d = draft.data;
      return `<section class="panel"><div class="split"><h2>내가 만드는 작은 의뢰</h2>${btn("closeQuest", "초안 보관하고 닫기")}</div><p class="hint">배경·단서·정답·힌트를 직접 정하세요. 미리 풀어보기에서 세 단서를 읽고 정답을 선택해야 공개할 수 있습니다. 수정하면 테스트 상태가 초기화됩니다.</p><div id="worldQuestForm"><div class="world-form"><label>제목<input id="questTitle" maxlength="80" value="${esc(d.title)}"></label><label>장소<select id="questPlace">${PLACES.map((x) => `<option value="${x.id}" ${x.id === d.place ? "selected" : ""}>${x.name}</option>`).join("")}</select></label></div><label>도입<textarea id="questIntro" maxlength="800" rows="3">${esc(d.intro)}</textarea></label><div class="world-grid">${[0, 1, 2].map((i) => `<div><label>단서 ${i + 1}<textarea id="questClue${i}" maxlength="300">${esc(d.clues[i])}</textarea></label><label>선택지 ${i + 1}<input id="questOption${i}" maxlength="100" value="${esc(d.options[i])}"></label><label>힌트 ${i + 1}<textarea id="questHint${i}" maxlength="300">${esc(d.hints[i])}</textarea></label></div>`).join("")}</div><label>정답<select id="questAnswer">${[0, 1, 2].map((i) => `<option value="${i}" ${d.answer === i ? "selected" : ""}>선택지 ${i + 1}</option>`).join("")}</select></label><label>성공 이야기<textarea id="questSuccess" maxlength="600">${esc(d.success)}</textarea></label><label>다시 생각할 때의 문구<textarea id="questFailure" maxlength="300">${esc(d.failure)}</textarea></label></div><div class="head-actions">${btn("testQuest", "미리 풀어보기")}${btn("publishQuest", draft.test?.done ? "검증 완료 · 모두에게 공개" : "미리 풀어본 뒤 공개", draft.test?.done ? "" : "disabled", "primary")}</div><p class="hint">${esc(localWarning)} · 같은 비밀번호의 동료는 모든 의뢰를 수정할 수 있어요.</p></section>${draft.test ? questScene(draft.test, true) : ""}`;
    }
    if (questPlay)
      return `${btn("closePlay", "의뢰 목록으로")}${questScene(questPlay)}`;
    return `<section class="panel"><p class="eyebrow">WE ARE ALL STORYTELLERS</p><h2>동료가 만드는 의뢰</h2><p>준비된 틀에 이야기를 넣으면 친구가 직접 조사하고 추리하는 짧은 사건이 됩니다. 글은 코드로 실행하지 않습니다.</p><div class="head-actions">${btn("newQuest", "＋ 의뢰 만들기", "", "primary")}${btn("restoreQuest", "이 기기의 초안 복구")}</div></section><div class="world-grid">${data.quests.map((q) => `<section class="panel world-card"><span class="world-icon">${PLACES.find((x) => x.id === q.data.place).icon}</span><h3>${esc(q.data.title)}</h3><p>${esc(q.data.intro.slice(0, 100))}</p><small>${esc(name(q.owner))} · 버전 ${q.rev} · 해결 ${q.plays}회</small><div class="head-actions">${btn("openQuest", "조사하기", `data-id="${q.id}"`, "primary")}${btn("editQuest", "수정", `data-id="${q.id}"`)}${btn("deleteQuest", "삭제", `data-id="${q.id}"`)}</div></section>`).join("") || '<section class="panel">아직 의뢰가 없어요. 첫 의뢰를 만들어 동료에게 건네보세요.</section>'}</div>`;
  }
  async function loadAdventures() {
    if (adventures || archiveLoading) return;
    archiveLoading = true;
    const ep = epoch;
    try {
      const v = await api("adventure?actor=" + encodeURIComponent(seen));
      if (ep === epoch) adventures = v;
    } catch {
      if (ep === epoch) adventures = { runs: [], unavailable: true };
    } finally {
      if (ep === epoch) {
        archiveLoading = false;
        if (current() && tab === "journal") render();
      }
    }
  }
  function journalHTML() {
    const me = p(),
      chapter = PLOT[me.plot.length],
      filtered = me.clues.filter((id) =>
        (
          CLUES[id].title +
          " " +
          PLACES.find((x) => x.id === CLUES[id].place).name
        ).includes(query),
      );
    return `<section class="panel world-book"><p class="eyebrow">THE HOUSE AT THE END OF EVERY LETTER</p><h2>장편 미스터리 · 돌아갈 집</h2><p>열차의 승차권, 도서관의 편지, 인형극장의 빈자리. 서로 다른 사건의 물건들이 하나의 주소를 가리키고 있습니다.</p>${me.plot.map((answer, i) => `<details ${i === me.plot.length - 1 ? "open" : ""}><summary>${PLOT[i].title} · ${PLOT[i].options[answer]}</summary><p>${PLOT[i].text}</p>${i === 3 ? `<blockquote>${["우리는 오래된 의자와 익숙한 창문을 고쳤다. 기억해 온 집이 다시 따뜻해졌다.", "새봄은 자신의 창문을 직접 그렸다. 이전과는 다른 모양의 집에도 같은 온기가 머물렀다.", "현관에 작은 등불을 하나 더 놓았다. 처음 보는 여행자도 돌아올 자리를 찾을 수 있도록."][answer]}</blockquote>` : ""}</details>`).join("")}${chapter ? `<h3>${chapter.title}</h3><p>${chapter.question}</p><div class="world-artifacts">${chapter.need.map((id) => btn("seek", `${me.clues.includes(id) ? "✓" : "🔎"} ${PLACES.find((x) => x.id === CLUES[id].place).name} · ${TIMES[CLUES[id].time]}`, `data-id="${id}"`)).join("")}</div><div class="head-actions">${chapter.options.map((x, i) => btn("plot", x, `data-answer="${i}" ${chapter.need.every((x) => me.clues.includes(x)) ? "" : "disabled"}`)).join("")}</div>` : "<h3>🌸 완결 · 이야기는 끝났지만 집의 문은 열려 있습니다.</h3>"}</section><section class="panel"><h2>통합 모험 수첩</h2><label>단서·장소 검색<input id="worldSearch" value="${esc(query)}" placeholder="주소, 역, 편지…"></label><div id="worldClueList">${clueList(filtered)}</div><h3>인물과 유물의 연결</h3><div class="world-grid">${PLACES.map((x) => `<div class="world-evidence"><b>${x.icon} ${x.npc}</b><p>${x.name} · 단서 ${x.clues.filter((id) => me.clues.includes(id)).length}/3</p><small>${x.detail}</small></div>`).join("")}</div><h3>기존 원정 기록</h3>${adventures?.unavailable ? "<p>기존 원정 기록을 지금 읽지 못했어요. 기존 모험 메뉴에서 확인해 주세요.</p>" : adventures ? adventures.runs.map((r) => `<p><a href="#adventure/${encodeURIComponent(r.id)}">${esc(CASES[r.campaign]?.title || "이전 원정")}</a> · ${r.status === "returned" ? "귀환" : "진행 중"} · 발견 ${r.found.length}개</p>`).join("") || "<p>이전 원정이 없어도 마을의 네 장은 혼자 완결할 수 있어요. 심야 열차·도서관·인형극장에서 더 많은 맥락을 만날 수 있습니다.</p>" : "<p>이전 원정 기록을 읽는 중…</p>"}</section><section class="panel world-chronicle"><div class="split"><div><p class="eyebrow">OUR SHARED CHRONICLE</p><h2>함께 쓴 마을 연대기</h2></div>${btn("exportBook", "연대기 사본 내려받기")}</div><p>기록된 행동을 정해진 문장으로 엮은 책입니다. AI가 실제로 없던 사건을 만들어 쓰지 않습니다.</p>${
      data.events
        .slice()
        .reverse()
        .map(
          (e) =>
            `<article><small>${new Date(e.at).toLocaleDateString("ko-KR")}</small><h3>${esc(name(e.owner))}의 한 페이지</h3><p>${esc(e.text)}</p></article>`,
        )
        .join("") || "<p>첫 번째 이야기를 기다리고 있어요.</p>"
    }</section>`;
  }
  function clueList(ids) {
    return (
      ids
        .map(
          (id) =>
            `<div class="world-clue"><b>${PLACES.find((x) => x.id === CLUES[id].place).name} · ${TIMES[CLUES[id].time]}</b><p>${CLUES[id].title}</p></div>`,
        )
        .join("") ||
      '<p class="hint">발견한 단서가 없거나 검색 결과가 없어요.</p>'
    );
  }
  function settingsHTML() {
    return `<section class="panel"><h2>편안하게 머무는 방법</h2><p>출석 시간이나 소리로만 푸는 퍼즐은 없습니다. 이 확장은 무음으로 설계했고 실제 밤이 아니어도 심야를 선택할 수 있어요.</p><label class="world-check"><input type="checkbox" id="worldMotion" ${p().prefs.motion ? "checked" : ""}> 움직임 줄이기</label><label class="world-check"><input type="checkbox" id="worldEerie" ${p().prefs.eerie ? "checked" : ""}> 거울 다락방의 은근한 소름 문장 허용 · 기본 꺼짐</label><label class="world-check"><input type="checkbox" id="worldGhost" ${p().prefs.ghost ? "checked" : ""}> 내 방문 흔적 공유 및 동료의 흔적 보기 · 기본 꺼짐</label>${btn("prefs", "환경 설정 저장", "", "primary")}<div class="callout">흔적 공유를 끄면 내 방문 흔적 목록도 삭제됩니다. 다른 공유 연대기와 GitHub 이력까지 삭제되는 것은 아닙니다. 활동 프로필은 개인 인증이나 비밀 보장이 아닙니다.</div><h3>저장과 무료 범위</h3><p>별도 유료 AI·이미지·음악 서비스 없이 작성된 이야기와 게임 규칙을 사용합니다. 기존 비공개 GitHub에 별도 파일로 저장하며 무료 사용량과 보관 용량에 한도가 있어요. 원본 사진 월드컵의 용량 안내는 놀이방 설정에서 확인할 수 있습니다.</p><p>초안은 이 브라우저에만 남습니다. 다른 기기에서 이어 하려면 공동 저장을 누르세요. 로그아웃 시 기기 초안은 정리됩니다.</p></section>`;
  }
  function wire() {
    if ($("worldArtifactNote"))
      $("worldArtifactNote").oninput = (e) => (artifactNote = e.target.value);
    if ($("worldRelayNote"))
      $("worldRelayNote").oninput = (e) => (relayNote = e.target.value);
    if ($("worldRelayTool"))
      $("worldRelayTool").onchange = (e) => (relayTool = e.target.value);
    if ($("worldSearch"))
      $("worldSearch").oninput = (e) => {
        query = e.target.value;
        $("worldClueList").innerHTML = clueList(
          p().clues.filter((id) =>
            (
              CLUES[id].title +
              " " +
              PLACES.find((x) => x.id === CLUES[id].place).name
            ).includes(query),
          ),
        );
      };
    for (const id of [
      "worldPetKind",
      "worldPetName",
      "worldPetColor",
      "worldPetHome",
    ])
      if ($(id))
        $(id).oninput = () => {
          petDraft = {
            kind: $("worldPetKind").value,
            name: $("worldPetName").value,
            color: $("worldPetColor").value,
            home: $("worldPetHome").value,
          };
        };
    for (const id of [
      "worldSealName",
      "worldSealDescription",
      "worldSealSymbol",
      "worldSealColor",
      "worldSealPattern",
    ])
      if ($(id))
        $(id).oninput = () => {
          sealDraft = {
            name: $("worldSealName").value,
            description: $("worldSealDescription").value,
            symbol: $("worldSealSymbol").value,
            color: $("worldSealColor").value,
            pattern: Number($("worldSealPattern").value),
          };
          $("worldSealPreview").innerHTML = sealSVG(sealDraft);
        };
    if ($("worldQuestForm"))
      $("worldQuestForm").oninput = () => {
        draft.data = {
          title: $("questTitle").value,
          place: $("questPlace").value,
          intro: $("questIntro").value,
          clues: [0, 1, 2].map((i) => $("questClue" + i).value),
          options: [0, 1, 2].map((i) => $("questOption" + i).value),
          hints: [0, 1, 2].map((i) => $("questHint" + i).value),
          answer: Number($("questAnswer").value),
          success: $("questSuccess").value,
          failure: $("questFailure").value,
        };
        draft.test = null;
        const b = document.querySelector('[data-world="publishQuest"]');
        if (b) {
          b.disabled = true;
          b.textContent = "수정 후 다시 미리 풀어보세요";
        }
        void remember();
      };
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", filename);
    a.hidden = true;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  async function exportPNG() {
    const svg = sealSVG(sealDraft || p().seal),
      image = new Image();
    image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    await image.decode();
    const c = document.createElement("canvas");
    c.width = 720;
    c.height = 1160;
    c.getContext("2d").drawImage(image, 0, 0, c.width, c.height);
    const blob = await new Promise((resolve) => c.toBlob(resolve, "image/png"));
    if (!blob) throw Error("PNG를 만들지 못했어요.");
    download(blob, "moonlight-talisman.png");
  }
  async function handle(a, d = {}) {
    if (a === "retry") return retry();
    if (saving || stepping) return;
    if (a === "reconcile") {
      if (
        !confirm(
          "불확실한 저장 요청의 재시도를 중단하고 최신 상태를 확인할까요? 초안은 유지됩니다.",
        )
      )
        return;
      pending = null;
      await load(true);
      if (
        play &&
        p().active &&
        play.id === p().active.id &&
        !p().active.actions.every(
          (v, i) => JSON.stringify(v) === JSON.stringify(play.actions[i]),
        )
      )
        error =
          "다른 기기의 게임 선택과 달라요. 내 초안을 버릴지는 별도 버튼으로 확인해 주세요.";
      render();
      return;
    }
    if (a === "useRemote") {
      if (
        !confirm("내 미공유 게임 선택을 버리고 공동 저장 지점으로 돌아갈까요?")
      )
        return;
      play = p().active ? structuredClone(p().active) : null;
      error = "";
      await remember();
      render();
      return;
    }
    if (pending) return;
    if (a === "reload") {
      await load(true);
      return;
    }
    if (!requireActor()) return;
    if (["home", "games", "settings"].includes(a)) {
      if (
        (petDraft || sealDraft || relayNote) &&
        !confirm("저장하지 않은 폼 입력을 버리고 이동할까요?")
      )
        return;
      petDraft = null;
      sealDraft = null;
      relayNote = "";
      tab = a;
      render();
      return;
    }
    if (a === "continue") {
      if (p().active) {
        play = structuredClone(p().active);
        tab = "games";
      } else {
        const chapter = PLOT[p().plot.length],
          missing = chapter?.need.find((x) => !p().clues.includes(x));
        if (missing) return handle("seek", { id: missing });
        tab = "journal";
        void loadAdventures();
      }
      render();
    } else if (a === "visit" || a === "time" || a === "explore") {
      const place = a === "visit" ? d.id : p().place,
        time = a === "time" ? d.id : p().time;
      await send("explore", { place, time });
    } else if (a === "seek") {
      const clue = CLUES[d.id];
      tab = "town";
      await send("explore", { place: clue.place, time: clue.time });
    } else if (a === "npc") {
      const place = PLACES.find((x) => x.id === p().place);
      notice = `${place.npc}: ${p().plot.length === 4 ? "새봄이 돌아온 뒤 마을의 불빛이 더 따뜻해졌어요. 다음 여행자에게도 길을 알려 주세요." : p().mail.length ? "당신이 보낸 편지가 다른 누군가의 오늘을 바꾸고 있어요. 같은 장소도 다른 시간에 다시 살펴보세요." : "시간이 달라지면 같은 풍경도 다른 이야기를 들려준답니다. 천천히 머물러 주세요."}`;
      render();
    } else if (a === "mail")
      await send("mail", { mail: d.id, choice: Number(d.choice) });
    else if (a === "room") {
      if (!unlocked(p(), d.id)) return;
      subroom = d.id;
      tab = "rooms";
      render();
    } else if (a === "pet")
      await send(
        "pet",
        petDraft || {
          kind: $("worldPetKind").value,
          name: $("worldPetName").value,
          color: $("worldPetColor").value,
          home: $("worldPetHome").value,
        },
      );
    else if (a === "care" || a === "claim" || a === "plant") await send(a);
    else if (a === "errand") await send("errand", { route: Number(d.route) });
    else if (a === "radio")
      await send("radio", {
        dials: [0, 1, 2].map((i) => Number($("radio-" + i).value)),
      });
    else if (a === "lost") await send("lost", { owner: d.id });
    else if (a === "seal") await send("seal", sealDraft || p().seal);
    else if (a === "png") await exportPNG();
    else if (a === "gift") {
      if (sealDraft) throw Error("부적을 먼저 저장한 뒤 선물하세요.");
      await send("gift", {
        to: $("worldGiftTo").value,
        id: crypto.randomUUID(),
      });
    } else if (a === "giftDelete") await send("giftDelete", { id: d.id });
    else if (a === "display") {
      const items = p().display.includes(d.id)
        ? p().display.filter((x) => x !== d.id)
        : [...p().display, d.id];
      if (items.length > 3)
        throw Error("진열은 세 개까지예요. 하나를 내려놓고 골라 주세요.");
      await send("display", { items });
    } else if (a === "artifactNote") {
      if (
        await send("artifactNote", {
          id: crypto.randomUUID(),
          text: artifactNote,
          artifact: $("worldNoteArtifact").value,
        })
      ) {
        artifactNote = "";
        render();
      }
    } else if (a === "artifactNoteDelete")
      await send("artifactNoteDelete", { id: d.id });
    else if (a === "toyStart") {
      toy = {
        target: randomInt(3),
        open: [],
        done: false,
      };
      render();
    } else if (a === "toyPick") {
      const i = Number(d.index);
      if (!toy || toy.done || toy.open.includes(i)) return;
      toy.open.push(i);
      toy.done = i === toy.target;
      notice = toy.done
        ? "수호령이 꼬리를 흔들며 함께 기뻐합니다!"
        : "다른 상자도 살펴볼까요?";
      render();
    } else if (a === "gameStart") {
      finished = null;
      await send("gameStart", {
        id: crypto.randomUUID(),
        type: d.id,
        level: Number($("level-" + d.id).value),
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
      });
    } else if (a === "gameAbandon") {
      if (
        confirm(
          "공동 저장된 게임도 종료하고 새로 시작할까요? 이미 얻은 유물은 남습니다.",
        )
      ) {
        await send("gameAbandon");
        finished = null;
        render();
      }
    } else if (a === "step") {
      if (!play) return;
      const action = {};
      for (const k of ["move", "judge", "tea", "kind", "reward"])
        if (d[k] !== undefined) action[k] = d[k];
      for (const k of ["inspect", "piece", "door", "star", "card"])
        if (d[k] !== undefined) action[k] = Number(d[k]);
      if (d.check) action.check = true;
      const s = gameStep(replayGame(play), action);
      play.actions.push(action);
      stepping = true;
      render();
      await remember();
      stepping = false;
      if (s.status !== "active")
        await send("gameSave", { id: play.id, actions: play.actions });
      else render();
    } else if (a === "gameSave") {
      if (play) await send("gameSave", { id: play.id, actions: play.actions });
    } else if (a === "hint") {
      hintLevel = Math.min(3, hintLevel + 1);
      render();
    } else if (a === "caseInspect" || a === "caseShare")
      await send(a, { index: Number(d.index) });
    else if (a === "caseSolve" || a === "plot")
      await send(a, { answer: Number(d.answer) });
    else if (a === "relay")
      await send("relay", {
        door: Number(d.door),
        note: relayNote,
        tool: relayTool,
        relayRev: data.relay.rev,
      });
    else if (a === "newQuest") {
      draft = {
        id: crypto.randomUUID(),
        rev: null,
        data: questTemplate(),
        test: null,
      };
      await remember();
      render();
    } else if (a === "restoreQuest") {
      const v = await localDraft(key());
      if (!v?.draft) throw Error("이 기기의 의뢰 초안이 없어요.");
      draft = v.draft;
      draft.test = null;
      render();
    } else if (a === "closeQuest") {
      await remember();
      draft = null;
      render();
    } else if (a === "testQuest") {
      draft.test = { data: structuredClone(draft.data), seen: [], done: false };
      render();
    } else if (a === "testInspect") {
      if (!draft.test.seen.includes(Number(d.index)))
        draft.test.seen.push(Number(d.index));
      render();
    } else if (a === "testAnswer") {
      if (draft.test.seen.length < 3)
        throw Error("세 단서를 모두 읽은 뒤 선택하세요.");
      if (Number(d.answer) !== draft.data.answer)
        throw Error(draft.data.failure);
      draft.test.done = true;
      draft.test.answer = Number(d.answer);
      await remember();
      render();
    } else if (a === "publishQuest") {
      if (!draft.test?.done) throw Error("미리 풀어보기를 완료하세요.");
      await send("questSave", {
        id: draft.id,
        questRev: draft.rev,
        quest: draft.data,
        proof: { seen: draft.test.seen, answer: draft.test.answer },
      });
    } else if (a === "openQuest") {
      const q = data.quests.find((x) => x.id === d.id);
      questPlay = {
        id: q.id,
        rev: q.rev,
        data: structuredClone(q.data),
        seen: [],
        done: false,
      };
      render();
    } else if (a === "closePlay") {
      questPlay = null;
      render();
    } else if (a === "questInspect") {
      if (!questPlay.seen.includes(Number(d.index)))
        questPlay.seen.push(Number(d.index));
      render();
    } else if (a === "questAnswer") {
      if (
        await send("questSolve", {
          id: questPlay.id,
          questRev: questPlay.rev,
          seen: questPlay.seen,
          answer: Number(d.answer),
        })
      ) {
        questPlay.done = true;
        render();
      }
    } else if (a === "editQuest") {
      const q = data.quests.find((x) => x.id === d.id);
      draft = {
        id: q.id,
        rev: q.rev,
        data: structuredClone(q.data),
        test: null,
      };
      render();
    } else if (a === "deleteQuest") {
      const q = data.quests.find((x) => x.id === d.id);
      if (confirm("동료들도 이 의뢰를 더 이상 볼 수 없어요. 삭제할까요?"))
        await send("questDelete", { id: q.id, questRev: q.rev });
    } else if (a === "prefs")
      await send("prefs", {
        prefs: {
          motion: $("worldMotion").checked,
          eerie: $("worldEerie").checked,
          ghost: $("worldGhost").checked,
        },
      });
    else if (a === "exportBook") {
      const book =
        "# 달빛 마을 · 우리들의 연대기\n\n" +
        data.events
          .map(
            (e) =>
              `${new Date(e.at).toLocaleString("ko-KR")} · ${name(e.owner)}\n${e.text}`,
          )
          .join("\n\n");
      download(
        new Blob([book], { type: "text/plain;charset=utf-8" }),
        "moonlight-chronicle.txt",
      );
    }
  }
  document.addEventListener("keydown", (e) => {
    if (
      !current() ||
      tab !== "games" ||
      play?.type !== "tactics" ||
      saving ||
      pending ||
      e.repeat ||
      e.target.closest("input,textarea,select,dialog")
    )
      return;
    const move = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    }[e.key];
    if (move) {
      e.preventDefault();
      void handle("step", { move }).catch((err) => toast(err.message, true));
    }
  });
  return {
    render,
    load,
    teaser,
    cancel,
    reset,
    isDirty: dirty,
    isSaving: () => saving || stepping,
  };
}
