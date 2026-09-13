import {
  GAMES,
  SIZES,
  bracket,
  validateCup,
  lines,
  idOK,
  checkJPEG,
} from "./party-rules.mjs";
import { thumbnail, localDraft, clearDrafts } from "./party-media.mjs";
import { createLuckUI } from "./luck-ui.mjs";
export function createPartyUI(H) {
  const { api, esc, toast, getActor, getState, requireActor } = H,
    $ = (id) => document.getElementById(id);
  let data = null,
    loading = null,
    seen = "",
    epoch = 0,
    tab = "cups",
    editor = null,
    editorDirty = false,
    run = null,
    cup = null,
    pending = null,
    saving = false,
    processing = false,
    error = "",
    notice = "",
    localStatus = "",
    draftTimer,
    openSerial = 0;
  const cache = new Map();
  const luck = createLuckUI({
    esc,
    toast,
    getState,
    isBlocked: () => saving || !!pending,
    savePreset: async (config) => {
      const ok = await send("presetSave", {
        id: crypto.randomUUID(),
        rev: null,
        config,
      });
      if (!ok)
        throw Error(
          "설정 저장을 완료하지 못했어요. 상단 안내에서 다시 시도해 주세요.",
        );
    },
  });
  const name = (id) =>
    getState().members.find((x) => x.id === id)?.name || "이전 팀원";
  const visible = () => location.hash.split("/")[0] === "#party";
  const runUnsaved = () =>
    !!(
      run &&
      data &&
      JSON.stringify(run.picks) !==
        JSON.stringify(data.runs.find((x) => x.id === run.id)?.picks)
    );
  const isDirty = () =>
    editorDirty ||
    !!pending ||
    saving ||
    processing ||
    luck.isDirty() ||
    runUnsaved();
  function cancel() {
    if (saving || processing) return;
    clearTimeout(draftTimer);
    if (editor) void storeEditor();
    editor = null;
    editorDirty = false;
    run = null;
    cup = null;
    pending = null;
    error = "";
    luck.cancel();
    openSerial++;
  }
  function resetMemory() {
    epoch++;
    openSerial++;
    clearTimeout(draftTimer);
    editor = null;
    run = null;
    cup = null;
    data = null;
    loading = null;
    pending = null;
    saving = false;
    processing = false;
    editorDirty = false;
    error = "";
    notice = "";
    localStatus = "";
    cache.clear();
    luck.reset();
  }
  async function reset() {
    resetMemory();
    seen = "";
    try {
      await clearDrafts();
    } catch {
      toast(
        "이 기기의 초안을 지우지 못했어요. 공용 기기는 브라우저 사이트 데이터도 지워 주세요.",
        true,
      );
    }
  }
  function actorCheck() {
    if (seen !== getActor()) {
      resetMemory();
      seen = getActor();
    }
  }
  async function load(force = false) {
    actorCheck();
    if (!seen) return null;
    if (loading) return loading;
    if (data && !force) return data;
    const ep = epoch;
    loading = api("party?actor=" + encodeURIComponent(seen))
      .then((v) => {
        if (ep === epoch) {
          data = v;
          data._loaded = Date.now();
          error = "";
        }
        return v;
      })
      .catch((e) => {
        if (ep === epoch) {
          error = e.message;
          if (e.status === 401) H.needLogin();
        }
        return null;
      })
      .finally(() => {
        if (ep === epoch) {
          loading = null;
          if (visible() && !isDirty()) render();
        }
      });
    return loading;
  }
  async function definition(hash) {
    if (cache.has(hash)) return cache.get(hash);
    const ep = epoch;
    const v = validateCup((await api("party?cup=" + hash)).cup);
    if (ep === epoch) {
      if (cache.size >= 4) cache.delete(cache.keys().next().value);
      cache.set(hash, v);
    }
    return v;
  }
  async function send(action, extra) {
    if (saving || processing || pending || !requireActor()) return false;
    pending = structuredClone({
      version: 1,
      memberId: seen,
      opId: crypto.randomUUID(),
      issuedAt: data?.now
        ? data.now + (Date.now() - (data._loaded || Date.now()))
        : Date.now(),
      action,
      ...extra,
    });
    // Advance the server clock by elapsed local time, tolerating clock skew.
    pending.issuedAt =
      (data?.now || Date.now()) +
      Math.max(0, Date.now() - (data?._loaded || Date.now()));
    return retry();
  }
  async function retry() {
    if (!pending || saving) return false;
    const ep = epoch,
      body = pending;
    saving = true;
    error = "";
    render();
    try {
      const v = await api("party", "POST", body);
      if (ep !== epoch) return false;
      data = v.data;
      data._loaded = Date.now();
      pending = null;
      notice = "공동 저장 완료 · " + new Date().toLocaleTimeString("ko-KR");
      if (body.action === "cupSave") {
        editor = null;
        editorDirty = false;
        await localDraft("editor:" + seen, null).catch(() => {});
        tab = "cups";
      }
      if (body.action === "checkpoint") {
        run = structuredClone(data.runs.find((x) => x.id === body.id));
        await saveRunLocal();
      }
      if (body.action === "runDelete") {
        await localDraft("run:" + seen + ":" + body.id, null).catch(() => {});
        run = null;
        cup = null;
      }
      if (body.action === "presetSave")
        toast("모두가 불러올 수 있도록 설정을 저장했어요.");
      saving = false;
      if (body.action === "start") await openRun(body.id);
      render();
      return true;
    } catch (e) {
      if (ep === epoch) {
        error = e.message;
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
  async function storeEditor() {
    if (!editor) return;
    try {
      await localDraft("editor:" + seen, editor);
      localStatus = "이 기기에 초안 보관됨 · 공동 저장은 별도";
    } catch {
      localStatus =
        "기기 초안 저장 실패 · 새로고침하지 말고 공동 저장해 주세요.";
    }
  }
  function edited() {
    editorDirty = true;
    localStatus = "초안 보관 중…";
    clearTimeout(draftTimer);
    draftTimer = setTimeout(async () => {
      await storeEditor();
      if ($("partyLocalStatus"))
        $("partyLocalStatus").textContent = localStatus;
    }, 250);
  }
  async function saveRunLocal() {
    if (!run) return;
    try {
      await localDraft("run:" + seen + ":" + run.id, run);
      localStatus = "이 기기에 현재 선택 보관됨";
    } catch {
      localStatus = "기기 보관 실패 · 지금 공동 저장을 눌러 주세요.";
    }
  }
  const act = (a, label, extra = "", cls = "") =>
    `<button type="button" data-party="${a}" ${extra} class="${cls}">${label}</button>`;
  const thumb = (x, large = false) =>
    x?.image
      ? `<img src="${esc(x.image)}" alt="${esc(x.name)}" ${large ? "" : 'loading="lazy"'} decoding="async">`
      : `<span class="party-placeholder" aria-hidden="true">${["🌙", "🍀", "🦊", "🌸", "⭐", "🎐"][Math.abs((x?.id || "a").charCodeAt(0)) % 6]}</span>`;
  function teaser() {
    return `<a href="#party" class="party-teaser"><span>🏆</span><div><small>THE MOONLIGHT SOCIAL CLUB</small><h3>취향은 진지하게, 운명은 가볍게.</h3><p>사진 이상형 월드컵 · 8가지 복불복 놀이</p></div><b>놀러 가기 ↗</b></a>`;
  }
  function render(id) {
    if (!visible()) return;
    actorCheck();
    if (id === "settings" && !editor && !run) tab = "settings";
    if (!data && !loading && seen) void load();
    $("view").innerHTML =
      `<div class="party-shell"><section class="party-hero"><div><p class="eyebrow">THE MOONLIGHT SOCIAL CLUB · EDITION 08</p><h1>오늘 밤,<br><em>마음 가는 대로.</em></h1><p>둘 중 하나의 설렘. 한 번의 뜻밖의 행운.<br>우리끼리 만드는 작은 놀이 축제.</p></div><div class="party-hero-art" aria-hidden="true"><span class="party-orbit orbit-one">☾</span><span class="party-orbit orbit-two">✦</span><span class="party-hero-card">♥<small>YOUR PICK</small></span><span class="party-hero-die">⚄</span></div><span class="party-hero-note">NO STAKES, JUST STORIES.</span></section><nav class="party-tabs" aria-label="놀이방 메뉴">${[
        ["cups", "🏆 이상형 월드컵"],
        ["luck", "🎲 복불복 놀이"],
        ["settings", "⚙ 월드컵 · 놀이 설정"],
      ]
        .map(
          ([k, v]) =>
            `<button data-tab="${k}" aria-pressed="${tab === k}">${v}</button>`,
        )
        .join(
          "",
        )}</nav><div aria-live="polite" class="party-status">${saving ? "공동 저장 중… 잠시만 기다려 주세요." : processing ? "사진을 이 기기에서 압축하는 중…" : esc(notice)}</div>${error ? `<div class="callout party-error" role="alert">${esc(error)}<div class="head-actions">${pending ? act("retry", "같은 요청 다시 저장") + act("resolve", "최신 상태 확인 · 초안 유지") : act("reload", "다시 불러오기") + (run ? act("remoteRun", "공동 기록으로 되돌리기") : "")}</div></div>` : ""}<fieldset id="partyFields" ${saving || processing || pending ? "disabled" : ""}>${!data ? `<section class="panel"><p>${loading ? "놀이방을 불러오고 있어요…" : "로그인 및 활동 프로필을 확인해 주세요."}</p></section>` : editor ? editorHTML() : run && cup ? runHTML() : tab === "cups" ? cupsHTML() : tab === "settings" ? settingsHTML() : '<div id="luckPanel"></div>'}</fieldset><p class="party-footnote">기존 능력치·XP에 영향 없음 · 같은 비밀번호를 아는 동료끼리 공유 · 활동 프로필은 본인 인증이 아닙니다.</p></div>`;
    document.querySelectorAll("[data-tab]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (saving || processing || pending) return;
          if (
            isDirty() &&
            !confirm(
              "미공유 초안은 이 기기에 보관하고 이동할까요? 진행 중인 복불복은 취소됩니다.",
            )
          )
            return;
          if (editor) await storeEditor();
          editor = null;
          editorDirty = false;
          run = null;
          cup = null;
          luck.cancel();
          tab = b.dataset.tab;
          error = "";
          render();
        }),
    );
    document.querySelectorAll("[data-party]").forEach(
      (b) =>
        (b.onclick = () =>
          handle(b.dataset.party, b.dataset).catch((e) => {
            error = e.message;
            toast(e.message, true);
            render();
          })),
    );
    if (editor) wireEditor();
    if (tab === "luck" && !editor && !run) luck.render();
  }
  function cupsHTML() {
    return `<div class="section-title"><div><p class="eyebrow">PICK YOUR FAVORITE</p><h2>우리의 이상형 월드컵</h2></div>${act("new", "＋ 월드컵 만들기", "", "primary")}</div><p class="hint">누구나 이름과 사진으로 만들어요. 후보가 충분하면 64강부터 시작! 후보가 더 많으면 선택 강수만큼 무작위로 추립니다.</p><div class="party-cup-grid">${
      data.cups
        .map(
          (c, i) =>
            `<article class="panel party-cup-card"><div class="party-cover cover-${i % 4}"><span>${["🏆", "🌸", "🍰", "🌌"][i % 4]}</span><small>${String(i + 1).padStart(2, "0")} / WORLD CUP</small></div><div><p class="eyebrow">${c.count} CANDIDATES</p><h3>${esc(c.title)}</h3><p class="hint">${esc(name(c.owner))}의 월드컵 · 누구나 참여</p><label>시작 강수<select id="size-${esc(c.id)}">${SIZES.filter(
              (n) => n <= c.count,
            )
              .map(
                (n) =>
                  `<option value="${n}">${n}강${n < c.count ? " · 무작위 추첨" : ""}</option>`,
              )
              .join(
                "",
              )}</select></label><div class="head-actions">${act("start", "대진 추첨 · 시작", `data-id="${esc(c.id)}"`, "primary")}${act("edit", "설정", `data-id="${esc(c.id)}"`)}</div></div></article>`,
        )
        .join("") ||
      `<section class="panel party-empty"><span>🏆</span><h3>첫 번째 월드컵을 만들어 보세요.</h3><p>음식, 여행지, 캐릭터… 사진이 없어도 이름만으로 시작할 수 있어요.</p>${act("new", "새 월드컵 만들기", "", "primary")}${act("sample", "샘플 · 야식 64강")}</section>`
    }</div><section class="panel"><div class="split"><h2>내 경기 · 이어 하기</h2>${act("reload", "최신 기록")}</div><p class="hint">매 라운드 종료 시 자동 공동 저장됩니다. 중간에도 ‘지금 공동 저장’을 누르면 다른 기기에서 이어 할 수 있어요. 최근 완료 기록부터 정리되며 전체 최대 120경기를 보관합니다.</p>${
      data.runs
        .slice()
        .reverse()
        .map(
          (r) =>
            `<div class="party-list-row"><div><b>${esc(r.title)}</b><small>${r.order.length}강 · ${r.picks.length}/${r.order.length - 1}번 선택 · ${r.picks.length === r.order.length - 1 ? "완료" : "진행 중"}</small></div><div class="head-actions">${act("resume", r.picks.length === r.order.length - 1 ? "결과 보기" : "이어 하기", `data-id="${esc(r.id)}"`)}${act("runDelete", "삭제", `data-id="${esc(r.id)}"`)}</div></div>`,
        )
        .join("") || '<p class="hint">아직 시작한 경기가 없어요.</p>'
    }</section>${
      data.recent.length
        ? `<details class="panel"><summary>동료들의 최근 완주</summary>${data.recent
            .slice()
            .reverse()
            .slice(0, 12)
            .map((r) => `<p>${esc(name(r.owner))} · ${esc(r.title)} 완주</p>`)
            .join(
              "",
            )}<p class="hint">선택 결과는 각 활동 프로필의 경기에서 확인합니다. 개인 인증이나 비밀 투표가 아닙니다.</p></details>`
        : ""
    }`;
  }
  function settingsHTML() {
    return `<section class="panel"><p class="eyebrow">EVERYONE IS A CREATOR</p><h2>누구나 만드는 놀이 설정</h2><p>월드컵은 최대 24개, 복불복 설정은 40개를 함께 보관합니다. 수정·목록 삭제 권한은 모든 동료에게 있어요.</p><div class="head-actions">${act("new", "＋ 새 월드컵", "", "primary")}${act("restore", "이 기기 월드컵 초안 복구")}${act("sample", "야식 64강 샘플 만들기")}</div><div class="callout">사진은 JPG·PNG·WebP, 원본 한 장 10MB 이하. 기기에서 최대 256px·8KB 이하 JPEG로 자동 압축하며 원본과 EXIF는 업로드하지 않습니다. 공개해도 되는 사진이나 당사자가 동의한 사진만 사용하세요. 민감한 사진은 올리지 마세요.</div>${data.cups.map((c) => `<div class="party-list-row"><b>${esc(c.title)} <small>${c.count}개 후보 · 수정 ${c.rev}회</small></b><div class="head-actions">${act("edit", "수정", `data-id="${esc(c.id)}"`)}${act("cupDelete", "목록에서 내리기", `data-id="${esc(c.id)}"`)}</div></div>`).join("")}<p class="hint">새 사진/후보는 새 버전으로 저장됩니다. 진행 중인 대진표에는 시작 당시 사진과 후보가 유지됩니다. 사진 포함 발행 ${data.published}/240회 · 삭제해도 저장소 과거 버전은 즉시 지워지지 않습니다.</p></section><section class="panel"><h2>공유 복불복 설정</h2><p class="hint">불러온 뒤 문구를 자유롭게 바꾸고 ‘이 설정 공유 저장’을 누르면 새 사본으로 저장됩니다.</p>${data.presets.map((p) => `<div class="party-list-row"><div><b>${esc(p.config.title)}</b><small>${GAMES[p.config.game][0]} ${GAMES[p.config.game][1]} · ${esc(name(p.owner))}</small></div><div class="head-actions">${act("preset", "불러오기", `data-id="${esc(p.id)}"`)}${act("presetDelete", "삭제", `data-id="${esc(p.id)}"`)}</div></div>`).join("") || '<p class="hint">복불복 놀이 탭에서 문구를 정하고 공유 저장해 보세요.</p>'}</section><section class="panel"><h2>저장과 무료 사용 안내</h2><p class="hint">추가 이미지 서비스나 유료 API 없이 기존 비공개 GitHub에 보관합니다. 무제한 사진 저장소는 아니며, 무료 요청량·저장소 용량에 제한이 있습니다. 텍스트와 작은 사진을 사용하는 소규모 친구 모임용입니다. 기기 초안은 현재 브라우저에만 보관되며 로그아웃 시 삭제합니다. 공동 저장은 별개입니다.</p></section>`;
  }
  function editorHTML() {
    const c = editor.cup;
    return `<section class="panel party-editor"><div class="split"><div><p class="eyebrow">CREATE A WORLD CUP</p><h2>${editor.rev === null ? "새 월드컵 만들기" : "월드컵 수정"}</h2></div>${act("closeEditor", "닫기")}</div><div class="party-two"><label>월드컵 제목<input id="cupTitle" maxlength="80" value="${esc(c.title)}" placeholder="예: 내 마음속 최고의 야식"></label><label>소개<textarea id="cupDescription" maxlength="500" rows="2">${esc(c.description)}</textarea></label></div><div class="callout">사진은 선택 사항입니다. 64강은 후보 64개가 필요하고 32·16·8·4·2강도 가능합니다. 64개 사진을 한 번에 선택하면 파일명으로 후보를 만들어요. 화질을 줄인 미리보기 사진으로 공유됩니다.</div><div class="party-two"><label>이름 한꺼번에 추가 · 한 줄에 하나<textarea id="cupBulk" rows="4" maxlength="5000" placeholder="떡볶이&#10;피자&#10;초밥"></textarea>${act("bulk", "이름 추가")}</label><label>사진 여러 장으로 후보 추가<input id="cupPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple><small>JPG·PNG·WebP · 한 장 10MB 이하 · 최대 64개 후보</small></label></div><div class="split"><h3 id="cupCount">후보 ${c.candidates.length}/64개</h3>${act("add", "＋ 후보 한 개")}</div><div class="party-candidates">${c.candidates.map((x, i) => `<article class="party-candidate"><div class="party-candidate-image">${thumb(x)}</div><label>${String(i + 1).padStart(2, "0")} · 후보 이름<input data-candidate-name="${x.id}" maxlength="60" value="${esc(x.name)}"></label><label class="party-file">사진 선택<input data-candidate-photo="${x.id}" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="head-actions">${act("removePhoto", "사진 지우기", `data-id="${x.id}"`)}${act("remove", "후보 삭제", `data-id="${x.id}"`)}</div></article>`).join("")}</div><div class="party-editor-bottom"><p id="partyLocalStatus" class="hint">${esc(localStatus || "작성 중 · 공동 저장 전")}</p><div class="head-actions">${act("saveCup", "모두에게 공유 저장", "", "primary")}${act("discardEditor", "이 기기 초안 삭제")}</div><p class="hint">동료도 수정할 수 있어요. 저장 후에도 이전 버전·GitHub 이력에 사진이 남을 수 있습니다.</p></div></section>`;
  }
  function runHTML() {
    const state = bracket(run.order, run.picks),
      find = (id) => cup.candidates.find((x) => x.id === id),
      saved = data.runs.find((x) => x.id === run.id)?.picks.length ?? 0;
    return `<section class="panel party-match"><div class="split"><div><p class="eyebrow">${state.champion ? "YOUR ONE & ONLY" : state.size === 2 ? "THE FINAL" : `ROUND OF ${state.size}`}</p><h2>${esc(run.title)}</h2></div>${act("leaveRun", "목록으로")}</div><p class="hint">${state.champion ? "마지막 한 명이 정해졌어요!" : `${state.size === 2 ? "결승" : state.size + "강"} · ${state.match + 1}/${state.size / 2}번째 대결`} · 총 ${run.picks.length}/${run.order.length - 1}번 선택</p><progress max="${run.order.length - 1}" value="${run.picks.length}" aria-label="월드컵 진행도"></progress>${state.champion ? `<div class="party-champion"><span class="party-crown">👑</span><div class="party-champion-image">${thumb(find(state.champion), true)}</div><p class="eyebrow">MY FAVORITE</p><h2>${esc(find(state.champion).name)}</h2><p>오늘 내 마음의 우승자</p>${act("copyChampion", "우승 결과 복사")}</div>` : `<div class="party-versus">${state.pair.map((id, i) => `<button class="party-pick" data-party="pick" data-id="${id}" aria-label="${esc(find(id).name)} 선택"><div class="party-pick-image">${thumb(find(id), true)}<span class="party-choice-tag">${i ? "B" : "A"}</span></div><strong>${esc(find(id).name)}</strong><small>이 후보 선택하기 ${i ? "→" : "←"}</small></button>`).join('<span class="party-vs" aria-hidden="true">VS</span>')}</div>`}<div class="party-save-line"><div><b>${!runUnsaved() ? "☁ 공동 저장됨" : "● 아직 공동 저장되지 않은 선택이 있어요"}</b><p class="hint">${esc(localStatus)} · 공동 저장 ${saved}번 / 현재 ${run.picks.length}번</p></div>${act("checkpoint", "지금 공동 저장", "", "primary")}</div><details class="party-bracket"><summary>대진표 · 지금까지의 선택 ${run.picks.length}개</summary>${state.history.map((m, i) => `<div class="party-list-row"><small>${m.size === 2 ? "결승" : m.size + "강"} · ${i + 1}</small><span>${m.pair.map((id) => `${id === m.winner ? "👑 " : ""}${esc(find(id).name)}`).join(" vs ")}</span></div>`).join("") || "<p>첫 선택을 기다리고 있어요.</p>"}</details><p class="hint">후보는 시작할 때 무작위 배치합니다. 한 번 선택하면 되돌릴 수 없으며, 다음 라운드로 넘어갈 때 자동 공동 저장됩니다. 변경된 월드컵 설정은 새 경기부터 적용돼요.</p></section>`;
  }
  function wireEditor() {
    $("cupTitle").oninput = (e) => {
      editor.cup.title = e.target.value;
      edited();
    };
    $("cupDescription").oninput = (e) => {
      editor.cup.description = e.target.value;
      edited();
    };
    document.querySelectorAll("[data-candidate-name]").forEach(
      (el) =>
        (el.oninput = () => {
          editor.cup.candidates.find(
            (x) => x.id === el.dataset.candidateName,
          ).name = el.value;
          edited();
        }),
    );
    document
      .querySelectorAll("[data-candidate-photo]")
      .forEach(
        (el) =>
          (el.onchange = () =>
            upload([...el.files], el.dataset.candidatePhoto)),
      );
    $("cupPhotos").onchange = () => upload([...$("cupPhotos").files]);
  }
  async function upload(files, id) {
    if (!files.length || processing || saving) return;
    if (!id && files.length + editor.cup.candidates.length > 64) {
      toast("총 후보가 64개를 넘어요. 사진 개수를 줄여 주세요.", true);
      return;
    }
    processing = true;
    const target = editor,
      ep = epoch;
    render();
    let added = 0,
      failures = [];
    try {
      for (const file of files) {
        try {
          const image = await thumbnail(file);
          if (ep !== epoch || editor !== target) return;
          if (id) target.cup.candidates.find((x) => x.id === id).image = image;
          else
            target.cup.candidates.push({
              id: crypto.randomUUID(),
              name: file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "새 후보",
              image,
            });
          added++;
        } catch (e) {
          failures.push(file.name + ": " + e.message);
        }
      }
      editorDirty = true;
      await storeEditor();
      notice = `사진 ${added}장 압축 완료. 원본은 업로드하지 않았어요.`;
      if (failures.length) error = failures.slice(0, 3).join("\n");
    } finally {
      if (ep === epoch) {
        processing = false;
        render();
      }
    }
  }
  async function openRun(id) {
    const serial = ++openSerial,
      ep = epoch,
      base = data.runs.find((x) => x.id === id);
    if (!base) throw Error("현재 프로필의 경기가 없습니다.");
    notice = "대진표와 사진을 불러오는 중…";
    render();
    const c = await definition(base.hash);
    if (ep !== epoch || serial !== openSerial) return;
    if (!base.order.every((id) => c.candidates.some((x) => x.id === id)))
      throw Error(
        "대진표의 후보와 원본이 맞지 않아요. 관리자에게 알려 주세요.",
      );
    let r = structuredClone(base);
    try {
      const local = await localDraft("run:" + seen + ":" + id);
      if (
        local &&
        local.hash === base.hash &&
        local.owner === seen &&
        JSON.stringify(local.order) === JSON.stringify(base.order) &&
        local.picks.length >= base.picks.length &&
        base.picks.every((p, i) => p === local.picks[i])
      ) {
        bracket(local.order, local.picks);
        r.picks = local.picks;
      }
    } catch {
      toast("이 기기 초안은 읽지 못했어요. 공동 저장 지점부터 엽니다.", true);
    }
    if (ep !== epoch || serial !== openSerial) return;
    cup = c;
    run = r;
    tab = "cups";
    notice = "";
    await saveRunLocal();
    render();
  }
  async function handle(a, d) {
    if (a === "retry") return retry();
    if (a === "resolve") {
      if (
        !confirm(
          "이 요청의 재시도를 멈추고 최신 공동 기록을 확인할까요? 입력과 선택 초안은 유지됩니다.",
        )
      )
        return;
      const old = pending;
      pending = null;
      await load(true);
      if (old?.action === "checkpoint" && run) {
        const latest = data?.runs.find((x) => x.id === run.id);
        if (latest && latest.picks.every((p, i) => p === run.picks[i])) {
          run.rev = latest.rev;
          notice =
            "최신 저장 번호를 반영했어요. 지금 공동 저장을 다시 눌러 주세요.";
        } else if (latest) {
          error =
            "다른 기기와 선택이 달라요. 내 선택 초안을 유지했습니다. 공동 기록으로 되돌리려면 별도 버튼을 눌러 확인해 주세요.";
        } else {
          error = "이 경기는 삭제됐습니다. 새 경기를 시작해 주세요.";
          run = null;
          cup = null;
        }
      }
      render();
      return;
    }
    if (saving || processing || pending) return;
    if (a === "remoteRun") {
      if (
        !confirm(
          "이 기기의 미공유 선택을 버리고 공동 저장된 선택으로 되돌릴까요?",
        )
      )
        return;
      const latest = data.runs.find((x) => x.id === run?.id);
      if (!latest) throw Error("공동 경기가 삭제됐어요.");
      run = structuredClone(latest);
      await saveRunLocal();
      error = "";
      notice = "공동 저장 지점으로 되돌렸어요.";
      render();
      return;
    }
    if (a === "reload") {
      await load(true);
      render();
      return;
    }
    if (!requireActor()) return;
    if (a === "new" || a === "sample") {
      editor = {
        id: crypto.randomUUID(),
        rev: null,
        cup: {
          version: 1,
          title: a === "sample" ? "오늘 밤 최고의 야식 64강" : "",
          description: "",
          candidates: [],
        },
      };
      if (a === "sample")
        editor.cup.candidates =
          "떡볶이,치킨,피자,햄버거,라면,김밥,초밥,만두,순대,타코,쌀국수,우동,돈가스,카레,볶음밥,짜장면,짬뽕,탕수육,마라탕,양꼬치,족발,보쌈,곱창,닭발,부대찌개,김치찌개,된장찌개,삼겹살,갈비,불고기,비빔밥,냉면,막국수,잔치국수,칼국수,수제비,김치전,해물파전,감자전,토스트,샌드위치,핫도그,감자튀김,치즈볼,오므라이스,리조또,파스타,스테이크,샐러드,고구마,옥수수,군밤,붕어빵,호떡,와플,크레페,도넛,크루아상,케이크,아이스크림,빙수,과일,요거트,팝콘"
            .split(",")
            .map((name) => ({ id: crypto.randomUUID(), name, image: "" }));
      run = null;
      cup = null;
      tab = "settings";
      edited();
      render();
    } else if (a === "restore") {
      const v = await localDraft("editor:" + seen);
      if (!v) throw Error("이 프로필의 기기 초안이 없어요.");
      if (
        !idOK(v.id) ||
        !(v.rev === null || Number.isSafeInteger(v.rev)) ||
        typeof v.cup?.title !== "string" ||
        v.cup.title.length > 80 ||
        typeof v.cup.description !== "string" ||
        v.cup.description.length > 500 ||
        !Array.isArray(v.cup.candidates) ||
        v.cup.candidates.length > 64 ||
        !v.cup.candidates.every(
          (x) =>
            idOK(x.id) &&
            typeof x.name === "string" &&
            x.name.length <= 60 &&
            checkJPEG(x.image),
        )
      )
        throw Error("기기 초안 형식이 올바르지 않습니다.");
      editor = v;
      editorDirty = true;
      run = null;
      tab = "settings";
      render();
    } else if (a === "edit") {
      const c = data.cups.find((x) => x.id === d.id);
      const ep = epoch,
        v = await definition(c.hash);
      if (ep !== epoch) return;
      editor = { id: c.id, rev: c.rev, cup: structuredClone(v) };
      run = null;
      tab = "settings";
      editorDirty = false;
      localStatus = "저장된 월드컵을 편집합니다.";
      render();
    } else if (a === "add") {
      if (editor.cup.candidates.length >= 64)
        throw Error("후보는 최대 64개입니다.");
      editor.cup.candidates.push({
        id: crypto.randomUUID(),
        name: "",
        image: "",
      });
      edited();
      render();
    } else if (a === "bulk") {
      const names = lines($("cupBulk").value);
      if (names.length + editor.cup.candidates.length > 64)
        throw Error("추가하면 후보가 64개를 넘어요.");
      editor.cup.candidates.push(
        ...names.map((name) => ({ id: crypto.randomUUID(), name, image: "" })),
      );
      edited();
      render();
    } else if (a === "remove") {
      editor.cup.candidates = editor.cup.candidates.filter(
        (x) => x.id !== d.id,
      );
      edited();
      render();
    } else if (a === "removePhoto") {
      editor.cup.candidates.find((x) => x.id === d.id).image = "";
      edited();
      render();
    } else if (a === "closeEditor") {
      await storeEditor();
      editor = null;
      editorDirty = false;
      render();
    } else if (a === "discardEditor") {
      if (
        !confirm(
          "이 기기의 월드컵 초안을 지울까요? 공동 저장된 월드컵은 유지됩니다.",
        )
      )
        return;
      clearTimeout(draftTimer);
      await localDraft("editor:" + seen, null);
      editor = null;
      editorDirty = false;
      render();
    } else if (a === "saveCup") {
      const c = validateCup(editor.cup);
      const latest = data.cups.find((x) => x.id === editor.id);
      if ((latest?.rev ?? null) !== editor.rev) {
        if (
          !confirm(
            "공동 설정이 달라졌습니다. 현재 초안으로 최신 설정을 교체할까요?",
          )
        )
          return;
        editor.rev = latest?.rev ?? null;
      }
      await send("cupSave", { id: editor.id, rev: editor.rev, cup: c });
    } else if (a === "cupDelete") {
      const c = data.cups.find((x) => x.id === d.id);
      if (
        confirm(
          "모두의 월드컵 목록에서 내릴까요? 기존 경기·사진의 과거 버전은 남습니다.",
        )
      )
        await send("cupDelete", { id: c.id, rev: c.rev });
    } else if (a === "start")
      await send("start", {
        id: crypto.randomUUID(),
        cupId: d.id,
        size: Number($("size-" + d.id).value),
      });
    else if (a === "resume") await openRun(d.id);
    else if (a === "pick") {
      const before = bracket(run.order, run.picks);
      if (!before.pair.includes(d.id)) return;
      run.picks.push(d.id);
      processing = true;
      render();
      await saveRunLocal();
      processing = false;
      const after = bracket(run.order, run.picks);
      if (after.size !== before.size)
        await send("checkpoint", {
          id: run.id,
          rev: run.rev,
          picks: run.picks,
        });
      else render();
    } else if (a === "checkpoint")
      await send("checkpoint", { id: run.id, rev: run.rev, picks: run.picks });
    else if (a === "leaveRun") {
      if (
        isDirty() &&
        !confirm(
          "이 기기에 선택을 보관하고 목록으로 갈까요? 다른 기기에서 이어 하려면 공동 저장이 필요해요.",
        )
      )
        return;
      await saveRunLocal();
      run = null;
      cup = null;
      render();
    } else if (a === "runDelete") {
      const r = data.runs.find((x) => x.id === d.id);
      if (confirm("내 경기 기록을 삭제할까요?"))
        await send("runDelete", { id: r.id, rev: r.rev });
    } else if (a === "copyChampion") {
      const c = cup.candidates.find(
        (x) => x.id === bracket(run.order, run.picks).champion,
      );
      try {
        await navigator.clipboard.writeText(
          `${run.title}\n🏆 나의 우승: ${c.name}\n${run.order.length}강 완주`,
        );
        toast("우승 결과를 복사했어요.");
      } catch {
        toast("복사 권한이 없어요. 우승자 이름을 직접 복사해 주세요.", true);
      }
    } else if (a === "preset") {
      tab = "luck";
      run = null;
      editor = null;
      render();
      luck.setConfig(data.presets.find((x) => x.id === d.id).config);
    } else if (a === "presetDelete") {
      const p = data.presets.find((x) => x.id === d.id);
      if (confirm("공유 설정을 삭제할까요?"))
        await send("presetDelete", { id: p.id, rev: p.rev });
    }
  }
  return {
    render,
    load,
    teaser,
    cancel,
    reset,
    isDirty,
    isSaving: () => saving || processing,
  };
}
