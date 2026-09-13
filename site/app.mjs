import { createWorldUI } from "./world-ui.mjs";
import { createPartyUI } from "./party-ui.mjs";
import { createAdventureUI } from "./adventure-ui.mjs";
import { sealSVG } from "./adventure-art.mjs";
import { createRoomUI } from "./room-ui.mjs";
import { createTrainingUI } from "./training-ui.mjs";
import {
  normalize,
  emptyState,
  differences,
  removeMember,
  restoreMember,
  AVATARS,
  ICONS,
  CATEGORIES,
  STAT_NAMES,
  LABELS,
  GROUPS,
} from "./model.mjs";
import { CATALOG } from "./catalog.mjs";
const $ = (id) => document.getElementById(id),
  esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  uid = () => crypto.randomUUID(),
  clone = (x) => structuredClone(x);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const stamp = (x) =>
  x
    ? new Date(x).toLocaleString("ko-KR", {
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "아직 저장 전";
let state = emptyState(),
  sha = null,
  logged = false,
  busy = false,
  pending = null,
  actor = "",
  editorRead = null,
  editorBaseline = "",
  lastHash = location.hash,
  query = "",
  squadFilter = "",
  statusFilter = "",
  abilityFilter = "",
  sort = "leader",
  calendarMonth = today().slice(0, 7),
  toastTimer,
  epoch = 0;
const sessionKey = "theme-sa-activity-profile";
const trainingUI = createTrainingUI({
  api,
  getState: () => state,
  getActor: () => actor,
  esc,
  toast,
  requireActor,
  needLogin,
  refreshView: () => {
    if (logged && !busy && !pending && !dirty()) render();
  },
});
const roomUI = createRoomUI({
  api,
  getState: () => state,
  getActor: () => actor,
  esc,
  toast,
  requireActor,
  needLogin,
  refreshView: () => {
    if (
      logged &&
      !busy &&
      !pending &&
      !dirty() &&
      ["room", "dashboard"].includes(route().key)
    )
      render();
  },
});
const adventureUI = createAdventureUI({
  api,
  getState: () => state,
  getActor: () => actor,
  esc,
  toast,
  requireActor,
  needLogin,
  refreshView: () => {
    if (logged && !dirty()) render();
  },
});
const partyUI = createPartyUI({
  api,
  getState: () => state,
  getActor: () => actor,
  esc,
  toast,
  requireActor,
  needLogin,
});
const worldUI = createWorldUI({
  api,
  getState: () => state,
  getActor: () => actor,
  esc,
  toast,
  requireActor,
  needLogin,
});
let profileChoice = "";
function profileGate(force = false) {
  if (!logged || (!force && actor && state.members.some((m) => m.id === actor)))
    return;
  const gate = $("profileGate");
  if (gate.open || document.querySelector("dialog[open]")) return;
  profileChoice = "";
  $("profileGateConfirm").disabled = true;
  $("profileGateChoices").innerHTML =
    state.members
      .map(
        (m) =>
          `<button data-profile-choice="${esc(m.id)}" aria-pressed="false">🌿 ${esc(m.name)}${m.id === state.leaderId ? " · 팀장" : ""}</button>`,
      )
      .join("") ||
    '<p>아직 활동 프로필이 없습니다. 먼저 본인의 프로필을 등록해 주세요.</p><button id="profileBootstrap">첫 활동 프로필 등록하기</button>';
  document.querySelectorAll("[data-profile-choice]").forEach(
    (b) =>
      (b.onclick = () => {
        profileChoice = b.dataset.profileChoice;
        document
          .querySelectorAll("[data-profile-choice]")
          .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        $("profileGateConfirm").disabled = false;
      }),
  );
  if ($("profileBootstrap"))
    $("profileBootstrap").onclick = () => {
      gate.close();
      editMember();
    };
  gate.showModal();
}
$("profileGate").addEventListener("cancel", (e) => e.preventDefault());
for (const id of ["editor", "review"])
  $(id).addEventListener("close", () => queueMicrotask(() => profileGate()));
$("profileGateConfirm").onclick = () => {
  if (!state.members.some((m) => m.id === profileChoice)) return;
  actor = profileChoice;
  sessionStorage.setItem(sessionKey, actor);
  $("profileGate").close();
  render();
};
$("profileGateLogout").onclick = () => $("logoutButton").click();
const person = (id) =>
  state.members.find((m) => m.id === id)?.name ||
  state.trash.find((t) => t.id === id)?.member.name ||
  (id ? "이전 팀원" : "미선택");
const avatar = (m) =>
  `<span class="avatar" style="color:${esc(m.color)}" aria-label="${esc(m.avatar)} 아바타">${esc(ICONS[AVATARS.indexOf(m.avatar)] || "✦")}<span class="personal-mark">${esc(/[\u4e00-\u9fff]/.test(m.symbol || "") ? "✦" : m.symbol || "✦")}</span></span>`;
function toast(message, error = false) {
  $("toast").hidden = false;
  $("toast").textContent = message;
  $("toast").style.borderColor = error ? "#b66f60" : "#63855a";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 5500);
}
function saving(on) {
  busy = on;
  for (const control of document.querySelectorAll(
    "#editor input,#editor select,#editor textarea,#reauth input,#commentText,#actorSelect",
  )) {
    if (on && !control.disabled) {
      control.dataset.busyDisabled = "1";
      control.disabled = true;
    } else if (!on && control.dataset.busyDisabled) {
      control.disabled = false;
      delete control.dataset.busyDisabled;
    }
  }
  for (const d of ["editor", "review", "reauth"])
    $(d)
      .querySelectorAll("button")
      .forEach((b) => (b.disabled = on));
  $("connectButton").disabled = on;
  $("saveLabel").textContent = on
    ? "서버에 기록 저장 중…"
    : pending
      ? "저장되지 않은 변경사항이 있어요"
      : state.updatedAt
        ? "저장 완료 · " + stamp(state.updatedAt)
        : "기록실 연결 완료";
}
function dirty() {
  return (
    ($("editor").open && signature() !== editorBaseline) ||
    !!$("commentText")?.value.trim() ||
    trainingUI.isActive() ||
    roomUI.isDirty() ||
    adventureUI.isDirty() ||
    partyUI.isDirty() ||
    worldUI.isDirty()
  );
}
function signature() {
  return JSON.stringify([...new FormData($("editorForm"))]);
}
function closeDialog(id, force = false) {
  if (id === "profileGate" && !force) return;
  if (
    id === "editor" &&
    !force &&
    dirty() &&
    !confirm("아직 저장하지 않은 입력이 있어요. 닫으면 사라집니다. 닫을까요?")
  )
    return;
  $(id).close();
  if (id === "review" && !force) {
    pending = null;
    saving(false);
  }
  if (id === "editor") {
    editorRead = null;
    editorBaseline = "";
    $("editorFields").replaceChildren();
  }
}
for (const d of document.querySelectorAll("dialog")) {
  d.addEventListener("cancel", (e) => {
    e.preventDefault();
    if (!busy) closeDialog(d.id);
  });
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-close]");
  if (b && !busy) closeDialog(b.dataset.close);
});
window.addEventListener("beforeunload", (e) => {
  if (dirty() || pending || busy) {
    e.preventDefault();
    e.returnValue = "";
  }
});
async function api(path, method = "GET", body) {
  const r = await fetch("/api/" + path, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  let j;
  try {
    j = await r.json();
  } catch {
    throw new Error(
      "서버에 연결하지 못했어요. 입력은 유지됩니다. 잠시 후 다시 시도해 주세요.",
    );
  }
  if (!r.ok) {
    const e = new Error(j.error?.message || "요청을 처리하지 못했어요.");
    e.status = r.status;
    e.code = j.error?.code;
    throw e;
  }
  return j;
}
async function enter(fresh = false) {
  let data;
  try {
    data = await api("archive");
  } catch (e) {
    if (e.code !== "ARCHIVE_NOT_INITIALIZED") throw e;
    if (!confirm("아직 기록 파일이 없습니다. 빈 기록실을 만들까요?"))
      throw new Error("기록실 생성을 취소했어요.");
    data = await api("archive", "PUT", {
      state: emptyState(),
      sha: null,
      clientVersion: 2,
      actorId: null,
    });
  }
  state = normalize(data.state);
  sha = data.sha;
  logged = true;
  actor = fresh ? "" : sessionStorage.getItem(sessionKey) || "";
  if (!state.members.some((m) => m.id === actor)) actor = "";
  $("loginScreen").hidden = true;
  $("application").hidden = false;
  render();
}
$("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  if (busy) return;
  saving(true);
  $("loginError").hidden = true;
  const password = $("sharedPassword").value;
  $("sharedPassword").value = "";
  try {
    await api("login", "POST", { password });
    await enter(true);
  } catch (err) {
    $("loginError").textContent = err.message;
    $("loginError").hidden = false;
  } finally {
    saving(false);
  }
};
$("showPassword").onchange = (e) =>
  ($("sharedPassword").type = e.target.checked ? "text" : "password");
$("reauthForm").onsubmit = async (e) => {
  e.preventDefault();
  if (busy) return;
  saving(true);
  const password = $("reauthPassword").value;
  $("reauthPassword").value = "";
  try {
    await api("login", "POST", { password });
    $("reauth").close();
    $("reauthError").textContent = "";
    if (!logged) await enter();
    toast(
      "로그인을 확인했어요. 입력은 그대로예요. 확인하고 저장을 다시 눌러 주세요.",
    );
  } catch (err) {
    $("reauthError").textContent = err.message;
  } finally {
    saving(false);
  }
};
function needLogin() {
  if (!$("reauth").open) $("reauth").showModal();
  $("reauthPassword").focus();
}
$("logoutButton").onclick = async () => {
  if (
    busy ||
    roomUI.isSaving() ||
    adventureUI.isSaving() ||
    partyUI.isSaving() ||
    worldUI.isSaving()
  )
    return;
  if (
    (dirty() || pending) &&
    !confirm("저장하지 않은 내용이 사라져요. 로그아웃할까요?")
  )
    return;
  try {
    await api("logout", "POST", {});
    epoch++;
    logged = false;
    trainingUI.reset();
    roomUI.reset();
    adventureUI.reset();
    worldUI.reset();
    await partyUI.reset();
    state = emptyState();
    sha = null;
    pending = null;
    actor = "";
    sessionStorage.removeItem(sessionKey);
    for (const d of document.querySelectorAll("dialog[open]"))
      closeDialog(d.id, true);
    $("view").replaceChildren();
    $("actorSelect").replaceChildren();
    $("application").hidden = true;
    $("loginScreen").hidden = false;
    $("loginError").hidden = true;
    $("sharedPassword").focus();
    toast("로그아웃했어요.");
  } catch (e) {
    toast(e.message, true);
  }
};
$("menuButton").onclick = () => {
  const open = $("sidebar").classList.toggle("open");
  $("navBackdrop").hidden = !open;
  $("menuButton").setAttribute("aria-expanded", String(open));
};
$("navBackdrop").onclick = () => {
  $("sidebar").classList.remove("open");
  $("navBackdrop").hidden = true;
  $("menuButton").setAttribute("aria-expanded", "false");
};
$("actorSelect").onchange = (e) => {
  if (busy || pending || dirty()) {
    e.target.value = actor;
    toast("작성 중인 저장을 먼저 마쳐 주세요.", true);
    return;
  }
  actor = e.target.value;
  sessionStorage.setItem(sessionKey, actor);
  render();
};
function requireActor() {
  if (actor && state.members.some((m) => m.id === actor)) return true;
  toast(
    "먼저 위쪽에서 활동 프로필을 선택해 주세요. 팀원이 없다면 먼저 추가하세요.",
    true,
  );
  profileGate(true);
  return false;
}
const navSections = [
  [
    "WORKSPACE",
    [
      ["dashboard", "대시보드", "◈"],
      ["members", "팀원 기록실", "◫"],
      ["room", "살아 있는 기록실", "☽"],
      ["adventure", "기록실 너머 · 모험", "🧭"],
      ["village", "달빛 마을 · 새로운 이야기", "🌌"],
      ["party", "월드컵 · 복불복 놀이방", "🏆"],
      ["training", "퇴마 훈련소", "⚔"],
      ["rankings", "훈련 랭킹", "♛"],
      ["organization", "직함 · 조직도", "⌘"],
      ["activity", "최근 활동", "◷"],
      ["trash", "팀원 휴지통", "♲"],
    ],
  ],
  [
    "TOGETHER",
    ["notices", "missions", "events", "polls", "suggestions", "checklists"],
  ],
  [
    "OUR UNIVERSE",
    [
      "cases",
      "bestiary",
      "gear",
      "world",
      "relationships",
      "achievements",
      "timeline",
    ],
  ],
  [
    "SETTINGS",
    [
      ["settings", "팀 설정 · 사용자 항목", "⚙"],
      ["guide", "사용 안내 · 백업", "▤"],
    ],
  ],
];
function route() {
  const [key, id] = location.hash.slice(1).split("/");
  let decoded = null;
  try {
    decoded = id ? decodeURIComponent(id) : null;
  } catch {}
  return { key: key || "dashboard", id: decoded };
}
function render() {
  if (!logged) return;
  $("brandName").textContent = state.teamName;
  document.title = state.teamName + " · 공동 기록실";
  $("actorSelect").innerHTML =
    '<option value="">프로필 선택 (본인 인증 아님)</option>' +
    state.members
      .map(
        (m) =>
          `<option value="${esc(m.id)}">${esc(m.name)}${m.id === state.leaderId ? " · 팀장" : ""}</option>`,
      )
      .join("");
  if (!state.members.some((m) => m.id === actor)) {
    actor = "";
    sessionStorage.removeItem(sessionKey);
  }
  $("actorSelect").value = actor;
  const r = route();
  $("navigation").innerHTML = navSections
    .map(
      ([name, links]) =>
        `<p class="nav-group">${name}</p>` +
        links
          .map((item) => {
            const [key, label, icon] =
              typeof item === "string"
                ? [item, CATALOG[item].label, CATALOG[item].icon]
                : item;
            return `<a href="#${key}" class="${r.key === key || (r.key === "member" && key === "members") ? "active" : ""}"><span>${icon}</span>${label}</a>`;
          })
          .join(""),
    )
    .join("");
  saving(busy);
  queueMicrotask(() => profileGate());
  if (r.key === "dashboard") {
    trainingUI.renderDashboard();
    document
      .querySelector(".dash-hero")
      ?.insertAdjacentHTML(
        "afterend",
        worldUI.teaser() +
          partyUI.teaser() +
          adventureUI.teaser() +
          roomUI.teaser(),
      );
  } else if (r.key === "adventure") adventureUI.render();
  else if (r.key === "village") worldUI.render();
  else if (r.key === "party") partyUI.render(r.id);
  else if (r.key === "room") roomUI.render();
  else if (r.key === "training") trainingUI.renderTraining(r.id);
  else if (r.key === "rankings") trainingUI.renderRanks(r.id);
  else if (r.key === "members") renderMembers();
  else if (r.key === "member") renderMember(r.id);
  else if (r.key === "organization") renderOrg();
  else if (r.key === "activity") renderActivity();
  else if (r.key === "trash") renderTrash();
  else if (r.key === "settings") renderSettings();
  else if (r.key === "guide") renderGuide();
  else if (CATALOG[r.key]) {
    if (r.id) renderRecord(r.key, r.id);
    else renderCollection(r.key);
  } else {
    $("view").innerHTML = heading(
      "페이지를 찾을 수 없어요",
      "메뉴에서 기록실로 돌아가 주세요.",
    );
  }
}
window.addEventListener("hashchange", () => {
  if (
    busy ||
    roomUI.isSaving() ||
    adventureUI.isSaving() ||
    partyUI.isSaving() ||
    worldUI.isSaving()
  ) {
    history.replaceState(null, "", lastHash || "#members");
    toast("저장 중입니다. 잠시만 기다려 주세요.");
    return;
  }
  if (
    dirty() &&
    !confirm("저장하지 않은 입력이 있어요. 이동하면 사라집니다. 이동할까요?")
  ) {
    history.replaceState(null, "", lastHash || "#members");
    return;
  }
  if (trainingUI.isActive()) trainingUI.cancel(false);
  roomUI.cancel();
  adventureUI.cancel();
  partyUI.cancel();
  worldUI.cancel();
  if ($("editor").open) closeDialog("editor", true);
  lastHash = location.hash;
  $("sidebar").classList.remove("open");
  $("navBackdrop").hidden = true;
  $("menuButton").setAttribute("aria-expanded", "false");
  render();
  window.scrollTo({ top: 0 });
});
$("refreshButton").onclick = () => refresh(false);
async function refresh(silent) {
  if (
    !logged ||
    busy ||
    roomUI.isSaving() ||
    adventureUI.isSaving() ||
    partyUI.isSaving() ||
    worldUI.isSaving()
  )
    return;
  if (trainingUI.isActive()) {
    if (silent) return;
    if (!confirm("진행 중인 게임을 중단하고 최신 기록을 불러올까요?")) return;
    trainingUI.cancel(false);
  }
  if (
    silent &&
    (document.hidden ||
      pending ||
      dirty() ||
      document.querySelector("dialog[open]"))
  )
    return;
  if (
    !silent &&
    (dirty() || pending) &&
    !confirm(
      "저장하지 않은 입력을 버리고 최신 기록을 불러올까요? 필요한 내용은 먼저 복사하세요.",
    )
  )
    return;
  if (!silent) {
    roomUI.cancel();
    adventureUI.cancel();
    partyUI.cancel();
    worldUI.cancel();
  }
  if (["room", "dashboard"].includes(route().key)) roomUI.load(!silent);
  if (["adventure", "dashboard"].includes(route().key))
    adventureUI.load(!silent);
  if (route().key === "party") partyUI.load(!silent);
  if (route().key === "village") worldUI.load(!silent);
  trainingUI.load(!silent);
  const currentEpoch = epoch,
    revision = sha;
  try {
    const data = await api("archive");
    if (
      currentEpoch !== epoch ||
      !logged ||
      revision !== sha ||
      roomUI.isDirty() ||
      adventureUI.isDirty() ||
      partyUI.isDirty() ||
      worldUI.isDirty()
    )
      return;
    if (
      silent &&
      (busy || pending || dirty() || document.querySelector("dialog[open]"))
    )
      return;
    if (data.sha !== sha || !silent) {
      state = normalize(data.state);
      sha = data.sha;
      if (!silent) {
        pending = null;
        for (const d of document.querySelectorAll("dialog[open]"))
          closeDialog(d.id, true);
      }
      render();
      if (!silent) toast("최신 기록을 불러왔어요.");
      else toast("팀의 최신 변경사항이 반영됐어요.");
    }
  } catch (e) {
    if (!silent) {
      if (e.status === 401) needLogin();
      else toast(e.message, true);
    }
  }
}
setInterval(() => refresh(true), 30000);
function preview(candidate) {
  if (busy) return;
  try {
    candidate = normalize(candidate);
    const changes = differences(state, candidate);
    if (!changes.length) {
      toast("변경된 내용이 없어요.");
      closeDialog("editor", true);
      return;
    }
    pending = { state: candidate, sha, actorId: actor || null };
    $("diffList").innerHTML = changes
      .map(
        (d) =>
          `<section class="diff-row"><b>${esc(d.label)}</b><div class="diff-values"><div><small>변경 전</small><pre>${esc(humanValue(d.before))}</pre></div><div><small>변경 후</small><pre>${esc(humanValue(d.after))}</pre></div></div></section>`,
      )
      .join("");
    $("saveError").textContent = "";
    if (!$("review").open) $("review").showModal();
    saving(false);
  } catch (e) {
    toast(e.message, true);
  }
}
function humanValue(value) {
  const convert = (v) => {
    if (Array.isArray(v)) return v.map(convert);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [LABELS[k] || k, convert(x)]),
      );
    if (typeof v === "string")
      return (
        [...state.members, ...(pending?.state.members || [])].find(
          (m) => m.id === v,
        )?.name ||
        [...state.roles, ...(pending?.state.roles || [])].find(
          (r) => r.id === v,
        )?.name ||
        v
      );
    return v;
  };
  try {
    return JSON.stringify(convert(JSON.parse(value)), null, 2);
  } catch {
    return convert(value);
  }
}
async function savePending() {
  if (!pending || busy) return;
  saving(true);
  try {
    const result = await api("archive", "PUT", {
      ...pending,
      clientVersion: 2,
    });
    state = normalize(result.state);
    sha = result.sha;
    pending = null;
    for (const d of ["review", "editor"]) closeDialog(d, true);
    const currentRoute = route();
    if (
      currentRoute.key === "member" &&
      !state.members.some((m) => m.id === currentRoute.id)
    )
      history.replaceState(null, "", "#members");
    else if (
      CATALOG[currentRoute.key] &&
      currentRoute.id &&
      !state[currentRoute.key].some((r) => r.id === currentRoute.id)
    )
      history.replaceState(null, "", "#" + currentRoute.key);
    lastHash = location.hash;
    render();
    toast(
      "저장 완료 · " + stamp(state.updatedAt) + "\n팀 전체에 공유되었습니다.",
    );
  } catch (e) {
    $("saveError").textContent = e.message;
    if (e.status === 401) needLogin();
    else if (e.status === 409) {
      $("saveError").textContent +=
        "\n이 화면의 입력은 유지됩니다. 기존 초안을 복사한 뒤 상단 ‘최신 기록’으로 불러와 필요한 변경을 다시 적용하세요. 버전 번호만 바꿔 강제로 덮어쓰지 않습니다.";
    } else if (e.code === "CLIENT_UPDATE_REQUIRED")
      $("saveError").textContent +=
        "\n새로고침하기 전에 입력 내용을 복사해 두세요.";
    toast(e.message, true);
  } finally {
    saving(false);
  }
}
$("confirmSave").onclick = savePending;
async function quick(change) {
  if (busy || pending) {
    toast("작성 중인 저장을 먼저 마쳐 주세요.", true);
    return;
  }
  try {
    const next = clone(state);
    change(next);
    pending = { state: normalize(next), sha, actorId: actor || null };
    await savePending();
    if (pending && !$("review").open) {
      $("diffList").innerHTML =
        "<p>저장되지 않은 변경사항입니다. 다시 저장하거나 최신 기록을 불러와 주세요.</p>";
      $("review").showModal();
    }
  } catch (e) {
    toast(e.message, true);
  }
}
function openEditor(title, fields, read) {
  if (busy) return;
  if (pending) {
    toast(
      "저장하지 않은 변경이 있어요. 확인하고 저장하거나 최신 기록으로 돌아가 주세요.",
      true,
    );
    if (!$("review").open) $("review").showModal();
    return;
  }
  editorRead = read;
  $("editorTitle").textContent = title;
  $("editorFields").innerHTML = fields;
  if (!$("editor").open) $("editor").showModal();
  editorBaseline = signature();
}
$("editorForm").onsubmit = (e) => {
  e.preventDefault();
  if (busy || !editorRead) return;
  try {
    preview(editorRead(new FormData($("editorForm"))));
  } catch (err) {
    toast(err.message, true);
  }
};
function heading(title, desc = "", actions = "") {
  return `<header class="page-head"><div><p class="eyebrow">THE SPIRIT ARCHIVE</p><h1>${esc(title)}</h1><p>${esc(desc)}</p></div>${actions ? `<div class="head-actions">${actions}</div>` : ""}</header>`;
}
function empty(label = "아직 등록된 기록이 없어요") {
  return `<div class="empty"><h3>${esc(label)}</h3><p>첫 번째 기록을 추가해 우리 이야기를 시작해요.</p></div>`;
}
function input(
  name,
  label,
  value = "",
  type = "text",
  required = false,
  max = 200,
) {
  return `<label>${esc(label)}${required ? " *" : ""}<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} ${["date", "color", "number", "range"].includes(type) ? "" : `maxlength="${max}"`}></label>`;
}
function area(name, label, value = "", max = 8000) {
  return `<label>${esc(label)}<textarea name="${esc(name)}" maxlength="${max}">${esc(value)}</textarea></label>`;
}
function select(name, label, values, value = "", required = false) {
  return `<label>${esc(label)}<select name="${esc(name)}" ${required ? "required" : ""}>${values
    .map((v) => {
      const [id, text] = Array.isArray(v) ? v : [v, v];
      return `<option value="${esc(id)}" ${id === value ? "selected" : ""}>${esc(text)}</option>`;
    })
    .join("")}</select></label>`;
}
function check(name, label, on) {
  return `<label class="check"><input type="checkbox" name="${esc(name)}" ${on ? "checked" : ""}>${esc(label)}</label>`;
}
function membersField(name, label, selected = [], exclude = null) {
  return `<label>${esc(label)}</label><div class="multi-select">${
    state.members
      .filter((m) => m.id !== exclude)
      .map(
        (m) =>
          `<label class="check"><input type="checkbox" name="${esc(name)}" value="${esc(m.id)}" ${selected.includes(m.id) ? "checked" : ""}>${esc(m.name)}</label>`,
      )
      .join("") || '<p class="hint">팀원을 먼저 추가해 주세요.</p>'
  }</div>`;
}
function memberOptions() {
  return [["", "미지정"], ...state.members.map((m) => [m.id, m.name])];
}
function badge(text, gold = false) {
  return `<span class="badge${gold ? " gold" : ""}">${esc(text)}</span>`;
}
function roleNames(m) {
  return [
    ...(m.id === state.leaderId
      ? [state.roles.find((r) => r.id === "role-leader")?.name || "팀장"]
      : []),
    ...m.roleIds
      .filter((id) => id !== "role-leader")
      .map((id) => state.roles.find((r) => r.id === id)?.name)
      .filter(Boolean),
  ];
}
function memberCard(m) {
  const fav = state.favorites
    .find((f) => f.actorId === actor)
    ?.memberIds.includes(m.id);
  return `<article class="card" data-member="${esc(m.id)}"><div class="member-top">${avatar(m)}<div class="member-title"><a href="#member/${encodeURIComponent(m.id)}"><h3>${esc(m.name)}</h3></a><small>${esc(m.codeName || "코드네임 미지정")}</small></div><button class="favorite" data-favorite="${esc(m.id)}" aria-label="${esc(m.name)} 즐겨찾기" aria-pressed="${!!fav}">${fav ? "★" : "☆"}</button></div><p class="muted">${esc(m.intro || "아직 한 줄 소개가 없어요.")}</p><div class="badges">${roleNames(
    m,
  )
    .map((x) => badge(x, true))
    .join(
      "",
    )}${badge(m.status)}${badge(m.rank)}${m.squad ? badge(m.squad) : ""}</div><div class="badges">${m.abilities.map((x) => badge(x)).join("")}</div><p class="hint">${esc(m.position || "역할 미입력")}${m.joinedOn ? " · 가입 " + esc(m.joinedOn) : ""}</p><div class="card-actions"><a href="#member/${encodeURIComponent(m.id)}">상세 보기</a><button data-edit-member="${esc(m.id)}">수정</button><button data-copy-member="${esc(m.id)}">복제</button></div></article>`;
}
function wireMembers() {
  document.querySelectorAll("[data-member]").forEach(
    (card) =>
      (card.onclick = (e) => {
        if (!e.target.closest("a,button,input"))
          location.hash = "member/" + encodeURIComponent(card.dataset.member);
      }),
  );
  document
    .querySelectorAll("[data-edit-member]")
    .forEach((b) => (b.onclick = () => editMember(b.dataset.editMember)));
  document
    .querySelectorAll("[data-copy-member]")
    .forEach((b) => (b.onclick = () => editMember(b.dataset.copyMember, true)));
  document.querySelectorAll("[data-favorite]").forEach(
    (b) =>
      (b.onclick = () => {
        if (!requireActor()) return;
        quick((s) => {
          let f = s.favorites.find((x) => x.actorId === actor);
          if (!f) {
            f = { actorId: actor, memberIds: [] };
            s.favorites.push(f);
          }
          const id = b.dataset.favorite;
          f.memberIds = f.memberIds.includes(id)
            ? f.memberIds.filter((x) => x !== id)
            : [...f.memberIds, id];
        });
      }),
  );
}
function renderMembers() {
  const pinned = state.notices.filter((n) => n.pinned);
  $("view").innerHTML =
    heading(
      "팀원 기록실",
      "각자의 특별함을, 하나의 기록으로.",
      '<button class="primary" id="addMember">＋ 팀원 추가</button>',
    ) +
    pinned
      .map(
        (n) =>
          `<div class="notice-banner"><small>고정 공지</small><b>${esc(n.title)}</b><a href="#notices/${encodeURIComponent(n.id)}">보기 →</a></div>`,
      )
      .join("") +
    `<section class="hero"><p class="eyebrow">CONNECTED BY COURAGE</p><h2>보이지 않는 세계,<br><em>함께 마주하는 ${esc(state.teamName)}.</em></h2><p>기록하고, 함께하고, 우리만의 이야기를 쌓아요.</p></section><div class="stats-row"><div class="stat"><small>함께하는 팀원</small><b>${state.members.length}명</b></div><div class="stat"><small>진행 중인 임무</small><b>${state.missions.filter((m) => m.status === "진행 중").length}개</b></div><div class="stat"><small>활동 중</small><b>${state.members.filter((m) => m.status === "활동 중").length}명</b></div></div><div class="section-title"><h2>우리 팀원들</h2><a href="#organization" class="muted small">조직도 보기 →</a></div><div class="toolbar"><input id="search" type="search" aria-label="팀원 검색" placeholder="이름, 코드네임, 학교, 능력 검색" value="${esc(query)}"><select id="squadFilter" aria-label="소속 조 필터"><option value="">전체 조</option>${[...new Set(state.members.map((m) => m.squad).filter(Boolean))].map((v) => `<option ${v === squadFilter ? "selected" : ""}>${esc(v)}</option>`).join("")}</select><select id="statusFilter" aria-label="활동 상태 필터"><option value="">전체 상태</option>${["활동 중", "휴식 중", "임무 중", "장기 부재"].map((v) => `<option ${v === statusFilter ? "selected" : ""}>${v}</option>`).join("")}</select><select id="abilityFilter" aria-label="능력 분류 필터"><option value="">모든 능력</option>${CATEGORIES.map((v) => `<option ${v === abilityFilter ? "selected" : ""}>${v}</option>`).join("")}</select><select id="sort" aria-label="정렬">${[
      ["leader", "팀장 우선"],
      ["name", "이름순"],
      ["recent", "최근 등록순"],
    ]
      .map(
        ([v, t]) =>
          `<option value="${v}" ${v === sort ? "selected" : ""}>${t}</option>`,
      )
      .join("")}</select></div><div id="memberCards"></div>`;
  $("addMember").onclick = () => editMember();
  $("search").oninput = (e) => {
    query = e.target.value;
    drawMemberCards();
  };
  for (const id of ["squadFilter", "statusFilter", "abilityFilter", "sort"])
    $(id).onchange = (e) => {
      if (id === "squadFilter") squadFilter = e.target.value;
      if (id === "statusFilter") statusFilter = e.target.value;
      if (id === "abilityFilter") abilityFilter = e.target.value;
      if (id === "sort") sort = e.target.value;
      drawMemberCards();
    };
  drawMemberCards();
}
function drawMemberCards() {
  const fav = state.favorites.find((f) => f.actorId === actor)?.memberIds || [];
  const filtered = state.members.filter(
    (m) =>
      (!query ||
        [m.name, m.codeName, m.school, m.squad, m.position, ...m.abilities]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase())) &&
      (!squadFilter || m.squad === squadFilter) &&
      (!statusFilter || m.status === statusFilter) &&
      (!abilityFilter || m.talents.some((t) => t.category === abilityFilter)),
  );
  filtered.sort(
    (a, b) =>
      Number(fav.includes(b.id)) - Number(fav.includes(a.id)) ||
      (sort === "name"
        ? a.name.localeCompare(b.name, "ko")
        : sort === "recent"
          ? (b.createdAt || "").localeCompare(a.createdAt || "")
          : Number(b.id === state.leaderId) - Number(a.id === state.leaderId) ||
            a.name.localeCompare(b.name, "ko")),
  );
  $("memberCards").innerHTML = filtered.length
    ? `<div class="cards">${filtered.map(memberCard).join("")}</div>`
    : empty(
        state.members.length
          ? "검색 조건에 맞는 팀원이 없어요"
          : "아직 팀원이 없어요",
      );
  wireMembers();
}
function talentRow(t = {}) {
  return `<div class="talent-row"><button type="button" class="remove-talent">삭제</button><div class="form-grid">${input("talentName", "능력 이름", t.name || "", "text", true, 30)}${select("talentCategory", "분류", CATEGORIES, t.category || "기타")}${area("talentEffect", "효과", t.effect || "", 500)}${area("talentCondition", "사용 조건", t.condition || "", 500)}${area("talentWeakness", "약점", t.weakness || "", 500)}${area("talentCaution", "주의사항", t.caution || "", 500)}</div></div>`;
}
function wireTalents() {
  document
    .querySelectorAll(".remove-talent")
    .forEach((b) => (b.onclick = () => b.closest(".talent-row").remove()));
}
function editMember(id = null, copy = false) {
  const original = state.members.find((m) => m.id === id);
  const m = original
    ? clone(original)
    : {
        id: uid(),
        name: "",
        abilities: [],
        roleIds: [],
        custom: [],
        stats: [50, 50, 50, 50, 50, 50],
        talents: [],
        joinedOn: today(),
        avatar: "부적",
        color: "#b8dfb3",
        symbol: "✦",
        status: "활동 중",
        rank: "수습",
      };
  if (copy) {
    m.id = uid();
    m.name = (m.name + " 복사").slice(0, 30);
    m.joinedOn = today();
    m.createdAt = null;
  }
  const talents = m.abilities.map(
    (name) =>
      m.talents.find((t) => t.name === name) || { name, category: "기타" },
  );
  for (const t of m.talents)
    if (!talents.some((x) => x.name === t.name)) talents.push(t);
  const fields = `<p class="hint">필수 항목은 이름뿐입니다. 아바타는 제공되는 그림·문양 중 선택하며 사진 업로드는 하지 않아요.</p><div class="form-grid">${input("name", "이름", m.name, "text", true, 30)}${input("codeName", "별명 · 코드네임", m.codeName, "text", false, 40)}<div class="full">${input("intro", "한 줄 소개", m.intro, "text", false, 160)}</div>${select("avatar", "아바타", AVATARS, m.avatar)}${input("symbol", "개인 문양", m.symbol, "text", false, 10)}${input("color", "상징색", m.color, "color")}${input("rank", "퇴마사 등급 (창작 설정)", m.rank, "text", false, 30)}${input("squad", "소속 조 · 분대", m.squad, "text", false, 40)}${input("position", "팀 내 역할", m.position, "text", false, 40)}${select("status", "활동 상태", ["활동 중", "휴식 중", "임무 중", "장기 부재"], m.status)}${input("joinedOn", "가입일", m.joinedOn, "date")}</div><div class="form-section"><h3>직함 부여</h3><div class="multi-select">${state.roles
    .filter((r) => r.id !== "role-leader")
    .map(
      (r) =>
        `<label class="check"><input type="checkbox" name="roleIds" value="${esc(r.id)}" ${m.roleIds.includes(r.id) ? "checked" : ""}>${esc(r.name)}</label>`,
    )
    .join(
      "",
    )}</div>${check("isLeader", "이 팀원을 팀장으로 지정하기", !copy && (m.id === state.leaderId || state.members.length === 0))}<p class="hint">한 사람에게 여러 직함을 줄 수 있어요. 직함의 상하 관계는 ‘직함 · 조직도’에서 설정합니다.</p></div><details><summary>기본 정보 · 메모</summary><div class="form-grid">${select("gender", "성별", ["", "여자", "남자", "기타", "비공개"], m.gender || "")}${input("age", "나이", m.age, "number")}${input("birthYear", "출생 연도", m.birthYear, "number")}${input("school", "학교", m.school, "text", false, 70)}${input("grade", "학년", m.grade, "number")}${input("classroom", "반", m.classroom, "text", false, 15)}</div>${area("memo", "우리만의 메모", m.memo, 1500)}<p class="hint">상세 집주소는 적지 마세요. 삭제해도 GitHub 과거 이력에 남을 수 있어요.</p>${input("address", "동네 · 가상 장소 (선택)", m.address, "text", false, 200)}</details><div class="form-section"><h3>특별한 능력</h3><p class="hint">최대 12개. 현실의 능력 판정이 아닌 창작 설정입니다.</p><div id="talentRows">${talents.map(talentRow).join("")}</div><button type="button" id="addTalent">＋ 능력 추가</button></div><div class="form-section"><h3>능력치 (설정용)</h3><div class="form-grid">${STAT_NAMES.map((n, i) => `<label>${n} <output>${m.stats[i]}</output><input type="range" name="stat${i}" min="0" max="100" value="${m.stats[i]}"></label>`).join("")}</div></div>${state.customFields.length ? '<div class="form-section"><h3>사용자 정의 항목</h3>' + state.customFields.map((f) => input("custom-" + f.id, f.label, m.custom.find((v) => v.id === f.id)?.value || "", "text", false, 300)).join("") + "</div>" : ""}`;
  openEditor(
    copy ? "팀원 기록 복제" : original ? "팀원 기록 수정" : "새로운 팀원 기록",
    fields,
    (fd) => {
      const next = clone(state);
      const saved = { ...m };
      for (const key of [
        "name",
        "codeName",
        "intro",
        "avatar",
        "symbol",
        "color",
        "rank",
        "squad",
        "position",
        "status",
        "joinedOn",
        "gender",
        "age",
        "birthYear",
        "school",
        "grade",
        "classroom",
        "memo",
        "address",
      ])
        saved[key] = String(fd.get(key) || "").trim();
      saved.createdAt =
        original && !copy ? original.createdAt : new Date().toISOString();
      saved.roleIds = fd.getAll("roleIds");
      saved.stats = STAT_NAMES.map((_, i) => +fd.get("stat" + i));
      saved.custom = state.customFields.map((f) => ({
        id: f.id,
        value: String(fd.get("custom-" + f.id) || ""),
      }));
      saved.talents = [...$("talentRows").children].map((row) =>
        Object.fromEntries(
          [
            "name",
            "category",
            "effect",
            "condition",
            "weakness",
            "caution",
          ].map((k) => [
            k,
            row
              .querySelector(
                '[name="talent' + k[0].toUpperCase() + k.slice(1) + '"]',
              )
              .value.trim(),
          ]),
        ),
      );
      saved.abilities = saved.talents.map((t) => t.name);
      if (original && !copy)
        next.members[next.members.findIndex((x) => x.id === saved.id)] = saved;
      else next.members.push(saved);
      if (fd.has("isLeader") || !next.leaderId) next.leaderId = saved.id;
      return next;
    },
  );
  if (!$("editor").open || !$("addTalent")) return;
  $("addTalent").onclick = () => {
    if ($("talentRows").children.length >= 12)
      return toast("능력은 최대 12개까지 추가할 수 있어요.", true);
    $("talentRows").insertAdjacentHTML("beforeend", talentRow());
    wireTalents();
  };
  wireTalents();
  document
    .querySelectorAll("#editor input[type=range]")
    .forEach(
      (i) =>
        (i.oninput = () =>
          (i.parentElement.querySelector("output").textContent = i.value)),
    );
}
function detailItem(label, value) {
  return `<div class="detail-item"><small>${esc(label)}</small><div>${esc(value || "미입력")}</div></div>`;
}
function radar(m) {
  const center = 150,
    radius = 91,
    points = (values) =>
      values
        .map((v, i) => {
          const a = (Math.PI / 3) * i - Math.PI / 2;
          return `${center + Math.cos(a) * radius * v},${center + Math.sin(a) * radius * v}`;
        })
        .join(" ");
  return `<svg viewBox="0 0 300 300" class="radar" role="img" aria-label="${esc(STAT_NAMES.map((n, i) => n + " " + m.stats[i]).join(", "))}">${[0.25, 0.5, 0.75, 1].map((r) => `<polygon points="${points(Array(6).fill(r))}" fill="none" stroke="#426047"/>`).join("")}${STAT_NAMES.map(
    (n, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      return `<line x1="150" y1="150" x2="${150 + Math.cos(a) * 91}" y2="${150 + Math.sin(a) * 91}" stroke="#36563f"/><text x="${150 + Math.cos(a) * 122}" y="${154 + Math.sin(a) * 122}" text-anchor="middle" fill="#b8cdb0" font-size="10">${n}</text>`;
    },
  ).join(
    "",
  )}<polygon points="${points(m.stats.map((v) => v / 100))}" fill="${esc(m.color)}" fill-opacity=".22" stroke="${esc(m.color)}" stroke-width="2"/></svg>`;
}
function renderMember(id) {
  const m = state.members.find((x) => x.id === id);
  if (!m) {
    $("view").innerHTML =
      heading("팀원을 찾을 수 없어요") +
      empty("삭제된 팀원은 휴지통을 확인하세요");
    return;
  }
  const days = m.joinedOn
    ? Math.floor((Date.parse(today()) - Date.parse(m.joinedOn)) / 86400000) + 1
    : 0;
  $("view").innerHTML =
    heading(
      "팀원 상세 기록",
      "프로필, 능력, 칭호와 활동 내역을 한곳에서 확인해요.",
      `<button id="detailEdit" class="primary">기록 수정</button><button id="detailCopy">복제</button><button id="detailDelete" class="danger">휴지통으로</button>`,
    ) +
    `<div class="detail-layout"><div><section class="panel"><div class="detail-profile">${avatar(m)}<div><p class="eyebrow">${esc(m.codeName || "MEMBER DOSSIER")}</p><h1>${esc(m.name)}</h1><p class="muted">${esc(m.intro)}</p><div class="badges">${roleNames(
      m,
    )
      .map((x) => badge(x, true))
      .join(
        "",
      )}${badge(m.rank)}${badge(m.status)}</div></div></div><div class="details-grid">${detailItem("소속 조", m.squad)}${detailItem("역할", m.position)}${detailItem("가입일", m.joinedOn)}${detailItem("함께한 날", days > 0 ? days + "일째" : "아직 미입력")}${detailItem("성별", m.gender)}${detailItem("나이 · 출생 연도", [m.age ? m.age + "세" : "", m.birthYear ? m.birthYear + "년" : ""].filter(Boolean).join(" · "))}${detailItem("학교", m.school)}${detailItem("학년 · 반", [m.grade ? m.grade + "학년" : "", m.classroom ? m.classroom + "반" : ""].join(" "))}${detailItem("개인 문양", /[\u4e00-\u9fff]/.test(m.symbol || "") ? "✦" : m.symbol)}${state.customFields.map((f) => detailItem(f.label, m.custom.find((v) => v.id === f.id)?.value)).join("")}</div><h3>우리만의 메모</h3><p class="prose">${esc(m.memo || "아직 메모가 없어요.")}</p></section><div class="section-title"><h2>능력 기록</h2></div>${
      m.abilities
        .map((name) => {
          const t = m.talents.find((t) => t.name === name);
          return `<section class="panel" style="margin-bottom:12px"><div class="split"><h3>${esc(name)}</h3>${badge(t?.category || "기타")}</div>${t ? ["effect", "condition", "weakness", "caution"].map((k, i) => (t[k] ? `<div class="list-row"><small>${["효과", "사용 조건", "약점", "주의사항"][i]}</small><p class="prose">${esc(t[k])}</p></div>` : "")).join("") : '<p class="hint">능력 상세를 추가해 보세요.</p>'}</section>`;
        })
        .join("") || empty("등록된 능력이 없어요")
    }</div><div><section class="panel"><h3>설정상 능력치</h3>${radar(m)}<p class="hint">팀의 창작 설정을 시각화한 그래프입니다.</p></section><section class="panel" style="margin-top:20px"><h3>업적 · 칭호</h3>${
      state.achievements
        .filter((a) => a.participants.includes(id))
        .map(
          (a) =>
            `<a class="list-row" style="display:block" href="#achievements/${encodeURIComponent(a.id)}">${esc(a.category || "✦")} ${esc(a.title)}</a>`,
        )
        .join("") || '<p class="hint">아직 부여된 칭호가 없어요.</p>'
    }</section><section class="panel" style="margin-top:20px"><h3>최근 활동</h3>${activityRows(
      state.activity
        .filter((a) => a.memberIds.includes(id) || a.actorId === id)
        .slice(-20)
        .reverse(),
    )}</section></div></div>`;
  $("view").insertAdjacentHTML("beforeend", trainingUI.profilePanel(id));
  trainingUI.wireReload();
  $("detailEdit").onclick = () => editMember(id);
  $("detailCopy").onclick = () => editMember(id, true);
  $("detailDelete").onclick = () => {
    const next = clone(state);
    try {
      removeMember(next, id);
      preview(next);
    } catch (e) {
      toast(e.message, true);
    }
  };
}
function renderOrg() {
  const branch = (id, depth = 0) => {
    const r = state.roles.find((x) => x.id === id);
    if (!r) return "";
    const people =
      id === "role-leader"
        ? state.members.filter((m) => m.id === state.leaderId)
        : state.members.filter((m) => m.roleIds.includes(id));
    const children = state.roles.filter((x) => x.parentId === id);
    return `<div class="org-node ${depth === 0 ? "root" : ""}"><div class="split"><div><small>LEVEL ${depth + 1}</small><h3>${esc(r.name)}</h3></div><button data-edit-role="${esc(id)}">설정</button></div><div class="org-people">${people.map((m) => `<a href="#member/${encodeURIComponent(m.id)}">${esc(m.name)}</a>`).join("") || '<span class="hint">아직 배치된 팀원이 없어요.</span>'}</div></div>${children.length ? `<div class="org-branch">${children.map((c) => branch(c.id, depth + 1)).join("")}</div>` : ""}`;
  };
  $("view").innerHTML =
    heading(
      "직함 · 조직도",
      "가족 관계가 아닌 조직의 상하 관계입니다. 한 직함에 여러 사람, 한 사람에게 여러 직함을 부여할 수 있어요.",
      '<button class="primary" id="addRole">＋ 직함 만들기</button><button id="chooseLeader">팀장 선택 · 변경</button>',
    ) +
    '<div class="callout">직함마다 상위 직함을 정하세요. 팀원에게 직함을 부여하려면 팀원 수정 화면을 이용하세요. 직함은 표시용이며 접근 권한을 나누지는 않습니다.</div><section class="panel org-tree">' +
    branch("role-leader") +
    "</section>";
  $("addRole").onclick = () => editRole();
  $("chooseLeader").onclick = () => {
    if (!state.members.length) return toast("팀원을 먼저 추가해 주세요.", true);
    openEditor(
      "팀장 선택",
      select(
        "leaderId",
        "팀장",
        state.members.map((m) => [m.id, m.name]),
        state.leaderId,
      ),
      (fd) => ({ ...clone(state), leaderId: fd.get("leaderId") }),
    );
  };
  document
    .querySelectorAll("[data-edit-role]")
    .forEach((b) => (b.onclick = () => editRole(b.dataset.editRole)));
}
function editRole(id) {
  const role = state.roles.find((r) => r.id === id) || {
    id: uid(),
    name: "",
    parentId: "role-leader",
  };
  const descendants = new Set([role.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of state.roles)
      if (descendants.has(r.parentId) && !descendants.has(r.id)) {
        descendants.add(r.id);
        changed = true;
      }
  }
  openEditor(
    id ? "직함 수정" : "직함 만들기",
    input("name", "직함 이름", role.name, "text", true, 40) +
      (role.id === "role-leader"
        ? '<p class="hint">팀장 직함은 항상 최상위입니다.</p>'
        : select(
            "parentId",
            "상위 직함",
            state.roles
              .filter((r) => !descendants.has(r.id))
              .map((r) => [r.id, r.name]),
            role.parentId,
            true,
          )) +
      `<p class="hint">담당자는 팀원 프로필의 ‘직함 부여’에서 선택하세요.</p>${id && id !== "role-leader" ? '<button type="button" id="removeRole" class="danger">이 직함 삭제</button>' : ""}`,
    (fd) => {
      const s = clone(state),
        r = {
          id: role.id,
          name: fd.get("name"),
          parentId: role.id === "role-leader" ? null : fd.get("parentId"),
        };
      if (id) s.roles[s.roles.findIndex((x) => x.id === id)] = r;
      else s.roles.push(r);
      return s;
    },
  );
  if ($("removeRole"))
    $("removeRole").onclick = () => {
      const s = clone(state);
      s.roles = s.roles.filter((r) => r.id !== id);
      for (const r of s.roles)
        if (r.parentId === id) r.parentId = role.parentId;
      for (const m of s.members) m.roleIds = m.roleIds.filter((x) => x !== id);
      preview(s);
    };
}
function activityRows(items) {
  return (
    items
      .map(
        (a) =>
          `<div class="list-row"><small>${esc(stamp(a.at))} · ${esc(person(a.actorId))} (선택 이름)</small><p>${esc(a.label)}</p></div>`,
      )
      .join("") || '<p class="hint">기록을 저장하면 최근 활동이 쌓여요.</p>'
  );
}
function renderActivity() {
  $("view").innerHTML =
    heading(
      "최근 활동 내역",
      "최근 300건을 시간순으로 보관합니다. 선택 이름은 본인 인증된 작성자가 아닙니다.",
    ) +
    '<section class="panel">' +
    activityRows([...state.activity].reverse()) +
    "</section>";
}
function renderTrash() {
  $("view").innerHTML =
    heading(
      "팀원 휴지통",
      "삭제 후 30일 동안 복구할 수 있어요. 복구는 프로필만 복원하며 이전 팀장 지정·삭제된 관계 연결은 복원하지 않습니다.",
    ) +
    '<p class="callout">보관 기간이 끝난 기록은 화면에서 숨기고 다음 저장 시 현재 파일에서 제거합니다. GitHub 과거 커밋과 이전 백업까지 삭제되는 것은 아닙니다.</p>' +
    (state.trash.filter((t) => Date.parse(t.expiresAt) > Date.now()).length
      ? `<div class="cards">${state.trash
          .filter((t) => Date.parse(t.expiresAt) > Date.now())
          .map(
            (t) =>
              `<article class="card"><div class="member-top">${avatar(t.member)}<h3>${esc(t.member.name)}</h3></div><p class="hint">삭제: ${esc(stamp(t.deletedAt))}<br>복구 가능: ${esc(stamp(t.expiresAt))}까지</p><div class="card-actions"><button class="primary" data-restore="${esc(t.id)}">팀원 복구</button><button class="danger" data-purge="${esc(t.id)}">휴지통에서 제거</button></div></article>`,
          )
          .join("")}</div>`
      : empty("휴지통이 비어 있어요"));
  document.querySelectorAll("[data-restore]").forEach(
    (b) =>
      (b.onclick = () => {
        try {
          const s = clone(state);
          restoreMember(s, b.dataset.restore);
          preview(s);
        } catch (e) {
          toast(e.message, true);
        }
      }),
  );
  document.querySelectorAll("[data-purge]").forEach(
    (b) =>
      (b.onclick = () => {
        if (
          confirm(
            "현재 휴지통에서 제거하면 이 화면에서 복구할 수 없어요. GitHub 과거 이력은 남습니다. 제거할까요?",
          )
        ) {
          const s = clone(state);
          s.trash = s.trash.filter((t) => t.id !== b.dataset.purge);
          preview(s);
        }
      }),
  );
}
function renderSettings() {
  $("view").innerHTML =
    heading(
      "팀 설정 · 사용자 항목",
      "설정 변경은 모든 팀원에게 적용됩니다. 공용 비밀번호를 아는 사람은 같은 편집 권한을 가집니다.",
    ) +
    `<div class="tools-grid"><section class="panel"><h2>우리 팀의 이름</h2><p class="prose" style="margin:20px 0">${esc(state.teamName)}</p><button id="renameTeam" class="primary">팀명 바꾸기</button></section><section class="panel"><div class="split"><h2>사용자 정의 항목</h2><button id="addField">＋ 항목 추가</button></div><p class="hint">상징 동물·주무기·수호령처럼 필요한 프로필 항목을 직접 만들어요. 최대 30개.</p>${state.customFields.map((f) => `<div class="list-row split"><b>${esc(f.label)}</b><button data-field="${esc(f.id)}">수정</button></div>`).join("") || '<p class="hint">아직 추가한 항목이 없어요.</p>'}</section></div><div class="callout">프로필의 학교·주소 등 개인정보는 필요한 범위에서 동의를 받고 기록하세요. 직함은 표시용이고 별도 관리자 인증 기능은 아닙니다.</div>`;
  $("view").insertAdjacentHTML(
    "afterbegin",
    `<section class="panel"><h2>🏆 월드컵 · 복불복 설정</h2><p class="hint">누구나 사진·이름으로 64강 월드컵을 만들고 놀이 문구를 공유할 수 있어요.</p><a href="#party/settings" class="button">월드컵 · 놀이 설정 열기 →</a></section>`,
  );
  $("renameTeam").onclick = () =>
    openEditor(
      "우리 팀 이름",
      input("teamName", "팀명", state.teamName, "text", true, 30),
      (fd) => ({ ...clone(state), teamName: fd.get("teamName") }),
    );
  $("addField").onclick = () => editCustomField();
  document
    .querySelectorAll("[data-field]")
    .forEach((b) => (b.onclick = () => editCustomField(b.dataset.field)));
}
function editCustomField(id) {
  const f = state.customFields.find((x) => x.id === id) || {
    id: uid(),
    label: "",
  };
  openEditor(
    id ? "항목 수정" : "사용자 항목 추가",
    input("label", "항목 이름", f.label, "text", true, 40) +
      (id
        ? '<p class="hint">항목을 삭제하면 모든 현재 팀원의 해당 값도 제거됩니다.</p><button type="button" id="deleteField" class="danger">항목 삭제</button>'
        : ""),
    (fd) => {
      const s = clone(state);
      if (id) s.customFields.find((x) => x.id === id).label = fd.get("label");
      else s.customFields.push({ ...f, label: fd.get("label") });
      return s;
    },
  );
  if ($("deleteField"))
    $("deleteField").onclick = () => {
      const s = clone(state);
      s.customFields = s.customFields.filter((x) => x.id !== id);
      for (const m of s.members) m.custom = m.custom.filter((x) => x.id !== id);
      preview(s);
    };
}
function defaultRecord(key) {
  const now = new Date().toISOString();
  return {
    id: uid(),
    title: "",
    body: "",
    status:
      CATALOG[key].fields.find((f) => f[0] === "status")?.[3]?.[0] || "준비 중",
    category:
      CATALOG[key].fields.find(
        (f) => f[0] === "category" && f[2] === "select",
      )?.[3]?.[0] || "",
    date: "",
    endDate: "",
    location: "",
    ownerId: null,
    participants: [],
    assignments: [],
    pinned: false,
    createdAt: now,
    updatedAt: now,
    actorId: actor || null,
    acknowledged: [],
    reactions: [],
    comments: [],
    options: [],
    votes: [],
    items: [],
    fromId: null,
    toId: null,
    relation: "사제",
    investigation: "",
    resolution: "",
    result: "",
    weakness: "",
    condition: "",
  };
}
function recordField(r, [name, label, type, extra]) {
  const value = r[name];
  if (type === "text")
    return input(
      name,
      label,
      value,
      "text",
      extra === true,
      name === "title" ? 100 : name === "location" ? 150 : 200,
    );
  if (type === "textarea")
    return area(
      name,
      label,
      value,
      name === "body"
        ? 8000
        : ["weakness", "condition"].includes(name)
          ? 1000
          : 4000,
    );
  if (type === "date") return input(name, label, value, "date", extra === true);
  if (type === "select") return select(name, label, extra, value);
  if (type === "check") return check(name, label, value);
  if (type === "member")
    return select(name, label, memberOptions(), value || "", extra === true);
  if (type === "members") return membersField(name, label, value);
  if (type === "assignments")
    return `<details><summary>참여자별 역할 설정</summary><p class="hint">위에서 선택한 참여자에게만 역할이 저장됩니다.</p>${state.members.map((m) => input("assignment-" + m.id, m.name, value.find((x) => x.memberId === m.id)?.role || "", "text", false, 50)).join("")}</details>`;
  if (type === "items" || type === "options")
    return area(
      name,
      label,
      value.map((x) => (type === "items" ? x.text : x.label)).join("\n"),
      type === "items" ? 20000 : 2500,
    );
  return "";
}
function editRecord(key, id = null) {
  const existing = state[key].find((r) => r.id === id),
    r = clone(existing || defaultRecord(key));
  openEditor(
    CATALOG[key].label + (id ? " 수정" : " 추가"),
    CATALOG[key].fields.map((f) => recordField(r, f)).join("") +
      (key === "world"
        ? '<p class="hint">[[문서 제목]]처럼 쓰면 같은 제목의 세계관 문서로 연결됩니다.</p>'
        : ""),
    (fd) => {
      const next = clone(state),
        saved = { ...r, updatedAt: new Date().toISOString() };
      for (const [name, , type] of CATALOG[key].fields) {
        if (type === "members") saved[name] = fd.getAll(name);
        else if (type === "member") saved[name] = fd.get(name) || null;
        else if (type === "check") saved[name] = fd.has(name);
        else if (type === "assignments")
          saved.assignments = fd.getAll("participants").map((memberId) => ({
            memberId,
            role: String(fd.get("assignment-" + memberId) || "").trim(),
          }));
        else if (type === "options" || type === "items") {
          const lines = String(fd.get(name) || "")
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean);
          if (
            type === "options" &&
            (lines.length < 2 ||
              lines.length > 20 ||
              new Set(lines).size !== lines.length)
          )
            throw new Error("투표 선택지는 서로 다른 2~20개를 입력하세요.");
          saved[name] = lines.map((text, index) => {
            const old =
              r[name].find(
                (x, i) => (type === "options" ? x.label : x.text) === text,
              ) ||
              (!r[name].some(
                (x) => (type === "options" ? x.label : x.text) === text,
              ) &&
              r[name][index] &&
              (type === "options"
                ? r[name][index].label
                : r[name][index].text) === text
                ? r[name][index]
                : null);
            return type === "options"
              ? { id: old?.id || uid(), label: text }
              : { id: old?.id || uid(), text, done: old?.done || false };
          });
          if (type === "options")
            saved.votes = r.votes.filter((v) =>
              saved.options.some((o) => o.id === v.optionId),
            );
        } else saved[name] = String(fd.get(name) || "").trim();
      }
      if (id) next[key][next[key].findIndex((x) => x.id === id)] = saved;
      else next[key].push(saved);
      return next;
    },
  );
}
function recordCard(key, r) {
  return `<article class="card"><div class="record-meta">${r.pinned ? badge("고정", true) : ""}${r.category ? badge(r.category) : ""}${["missions", "cases", "polls", "suggestions", "gear"].includes(key) ? badge(r.status) : ""}${r.date ? `<span>${esc(r.date)}</span>` : ""}</div><a href="#${key}/${encodeURIComponent(r.id)}"><h3>${esc(r.title)}</h3></a><p class="muted" style="margin-top:10px">${esc((r.body || "내용을 확인해 보세요.").slice(0, 140))}${r.body.length > 140 ? "…" : ""}</p><div class="record-meta">${r.ownerId ? `<span>담당 · ${esc(person(r.ownerId))}</span>` : ""}${r.participants.length ? `<span>참여 ${r.participants.length}명</span>` : ""}</div>${r.items.length ? `<p class="hint">☑ ${r.items.filter((x) => x.done).length} / ${r.items.length} 완료</p>` : ""}<div class="card-actions"><a href="#${key}/${encodeURIComponent(r.id)}">자세히 보기</a><button data-edit-record="${esc(r.id)}">수정</button><span class="hint">♡ ${r.reactions.length} · 댓글 ${r.comments.length}</span></div></article>`;
}
function wireRecordList(key) {
  document
    .querySelectorAll("[data-edit-record]")
    .forEach((b) => (b.onclick = () => editRecord(key, b.dataset.editRecord)));
}
function renderCollection(key) {
  const spec = CATALOG[key];
  let records = [...state[key]].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      (b.updatedAt || "").localeCompare(a.updatedAt || ""),
  );
  $("view").innerHTML =
    heading(
      spec.label,
      spec.desc,
      `<button id="addRecord" class="primary">＋ ${key === "events" ? "일정" : key === "missions" ? "임무" : "기록"} 추가</button>`,
    ) +
    (key === "events"
      ? calendarHTML()
      : key === "relationships"
        ? relationshipHTML()
        : key === "timeline"
          ? timelineHTML()
          : key === "missions"
            ? `<div class="kanban">${["준비 중", "진행 중", "완료"]
                .map(
                  (status) =>
                    `<section class="kanban-column"><h3>${status} · ${records.filter((r) => r.status === status).length}</h3>${
                      records
                        .filter((r) => r.status === status)
                        .map((r) => recordCard(key, r))
                        .join("") || '<p class="hint">등록된 임무가 없어요.</p>'
                    }</section>`,
                )
                .join("")}</div>`
            : records.length
              ? `<div class="cards">${records.map((r) => recordCard(key, r)).join("")}</div>`
              : empty());
  $("addRecord").onclick = () => editRecord(key);
  wireRecordList(key);
  if (key === "events") {
    for (const [id, delta] of [
      ["prevMonth", -1],
      ["nextMonth", 1],
    ])
      $(id).onclick = () => {
        const [y, m] = calendarMonth.split("-").map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        calendarMonth =
          d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
        renderCollection("events");
      };
  }
}
function calendarHTML() {
  const [year, month] = calendarMonth.split("-").map(Number),
    start = new Date(year, month - 1, 1).getDay(),
    days = new Date(year, month, 0).getDate();
  const anniversaries = [];
  for (const m of state.members) {
    if (!m.joinedOn) continue;
    const joined = new Date(m.joinedOn + "T00:00:00Z");
    for (const offset of [99, 365]) {
      const anniversary = new Date(joined);
      if (offset === 365)
        anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
      else anniversary.setUTCDate(anniversary.getUTCDate() + 99);
      const date = anniversary.toISOString().slice(0, 10);
      anniversaries.push({
        date,
        title: m.name + " · " + (offset === 99 ? "가입 100일" : "가입 1주년"),
        id: m.id,
      });
    }
  }
  let cells = Array.from({ length: start }, () => '<div class="blank"></div>');
  for (let day = 1; day <= days; day++) {
    const date = calendarMonth + "-" + String(day).padStart(2, "0");
    const events = state.events.filter(
      (e) => e.date && e.date <= date && (e.endDate || e.date) >= date,
    );
    cells.push(
      `<div class="${date === today() ? "today" : ""}"><b>${day}</b>${events.map((e) => `<a href="#events/${encodeURIComponent(e.id)}" title="${esc(e.title)}">${esc(e.title)}</a>`).join("")}${anniversaries
        .filter((a) => a.date === date)
        .map(
          (a) =>
            `<a href="#member/${encodeURIComponent(a.id)}" title="${esc(a.title)}">✧ ${esc(a.title)}</a>`,
        )
        .join("")}</div>`,
    );
  }
  const upcoming = state.events
    .filter((e) => (e.endDate || e.date) >= today())
    .sort((a, b) => a.date.localeCompare(b.date));
  return `<div class="calendar-head"><button id="prevMonth" aria-label="이전 달">←</button><h2>${year}년 ${month}월</h2><button id="nextMonth" aria-label="다음 달">→</button></div><div class="calendar">${["일", "월", "화", "수", "목", "금", "토"].map((d) => `<div class="weekday">${d}</div>`).join("")}${cells.join("")}</div><div class="section-title"><h2>다가오는 일정</h2></div>${upcoming.length ? `<div class="cards">${upcoming.map((r) => recordCard("events", r)).join("")}</div>` : empty("다가오는 일정이 없어요")}<details><summary>전체 일정 (${state.events.length})</summary>${state.events.map((e) => `<a class="list-row" style="display:block" href="#events/${encodeURIComponent(e.id)}">${esc(e.date)} · ${esc(e.title)}</a>`).join("")}</details>`;
}
function relationshipHTML() {
  const ids = [
      ...new Set(state.relationships.flatMap((r) => [r.fromId, r.toId])),
    ],
    n = ids.length;
  const members = ids
    .map((id) => state.members.find((m) => m.id === id))
    .filter(Boolean);
  if (!n) return empty("아직 연결한 관계가 없어요");
  if (n > 40)
    return (
      '<p class="callout">관계 인물이 40명을 넘으면 가독성을 위해 연결 목록으로 표시합니다.</p>' +
      `<div class="cards">${state.relationships.map((r) => recordCard("relationships", r)).join("")}</div>`
    );
  const width = 800,
    height = Math.max(520, n * 25),
    cx = width / 2,
    cy = height / 2,
    rx = 270,
    ry = height / 2 - 70;
  const point = (id) => {
    const i = ids.indexOf(id),
      a = (2 * Math.PI * i) / n - Math.PI / 2;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
  };
  return `<div class="relationship-map"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="인물 간 관계 연결도">${state.relationships
    .map((r) => {
      const a = point(r.fromId),
        b = point(r.toId);
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#627e58"/><text x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 5}" fill="#d6c698" font-size="11" text-anchor="middle">${esc(r.relation)}</text>`;
    })
    .join("")}${members
    .map((m) => {
      const p = point(m.id);
      return `<a href="#member/${encodeURIComponent(m.id)}"><rect x="${p.x - 55}" y="${p.y - 23}" width="110" height="46" rx="10" fill="#233b28" stroke="${esc(m.color)}"/><text x="${p.x}" y="${p.y + 5}" text-anchor="middle" fill="#e6eddf" font-size="12">${esc(m.name.length > 9 ? m.name.slice(0, 9) + "…" : m.name)}</text></a>`;
    })
    .join(
      "",
    )}</svg></div><div class="cards">${state.relationships.map((r) => recordCard("relationships", r)).join("")}</div>`;
}
function timelineHTML() {
  const joins = state.members
    .filter((m) => m.joinedOn)
    .map((m) => ({
      id: "join-" + m.id,
      date: m.joinedOn,
      title: m.name + " · 팀 합류",
      body: m.intro || "",
      category: "팀원 합류",
      autoMemberId: m.id,
    }));
  const dated = [...state.timeline, ...joins]
    .filter((r) => r.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const undated = state.timeline.filter((r) => !r.date);
  return dated.length || undated.length
    ? `<p class="hint">팀원의 가입일도 연표에 자동으로 표시됩니다. 가입일은 팀원 프로필에서 수정하세요.</p><div class="timeline">${dated.map((r) => `<article class="list-row"><small>${esc(r.date)} · ${esc(r.category)}</small><h3><a href="#${r.autoMemberId ? "member" : "timeline"}/${encodeURIComponent(r.autoMemberId || r.id)}">${esc(r.title)}</a></h3><p class="prose">${esc(r.body)}</p>${r.autoMemberId ? "" : `<button data-edit-record="${esc(r.id)}">수정</button>`}</article>`).join("")}</div>${undated.length ? '<h2>날짜 미지정</h2><div class="cards">' + undated.map((r) => recordCard("timeline", r)).join("") + "</div>" : ""}`
    : empty("아직 연표 기록이 없어요");
}
function wikiText(text) {
  return String(text)
    .split(/(\[\[[^\]\n]{1,100}\]\])/g)
    .map((part) => {
      if (part.startsWith("[[") && part.endsWith("]]")) {
        const title = part.slice(2, -2),
          doc = state.world.find((d) => d.title === title);
        if (doc)
          return `<a class="wiki-link" href="#world/${encodeURIComponent(doc.id)}">${esc(title)}</a>`;
      }
      return esc(part);
    })
    .join("");
}
function renderRecord(key, id) {
  const r = state[key].find((r) => r.id === id);
  if (!r) {
    $("view").innerHTML = heading(
      "기록을 찾을 수 없어요",
      "삭제되었거나 다른 기록으로 이동했을 수 있어요.",
    );
    return;
  }
  const spec = CATALOG[key];
  const acknowledged = r.acknowledged.includes(actor),
    liked = r.reactions.includes(actor);
  let content = "";
  for (const [name, label, type] of spec.fields) {
    if (
      ["title", "body", "pinned", "items", "options", "assignments"].includes(
        name,
      )
    )
      continue;
    const value = r[name];
    if (!value || (Array.isArray(value) && !value.length)) continue;
    let text =
      type === "member"
        ? person(value)
        : type === "members"
          ? value.map(person).join(", ")
          : value;
    content +=
      type === "textarea"
        ? `<div class="list-row"><h3>${esc(label)}</h3><p class="prose">${esc(text)}</p></div>`
        : detailItem(label, text);
  }
  const tasks = r.items.length
    ? `<section class="form-section"><h3>체크리스트 · ${r.items.filter((i) => i.done).length}/${r.items.length}</h3>${r.items.map((i) => `<label class="check checklist-item ${i.done ? "done" : ""}"><input type="checkbox" data-item="${esc(i.id)}" ${i.done ? "checked" : ""}><span>${esc(i.text)}</span></label>`).join("")}</section>`
    : "";
  const votes =
    key === "polls"
      ? `<section class="form-section"><h3>${r.status === "마감" ? "마감된 투표" : "투표하기"}</h3><p class="hint">프로필별 한 표 · 다시 선택하면 변경됩니다. 총 ${r.votes.length}표. 다른 사람 프로필도 선택할 수 있으므로 엄격한 1인 1표가 아닙니다.</p>${r.options
          .map((o) => {
            const count = r.votes.filter((v) => v.optionId === o.id).length,
              selected = r.votes.some(
                (v) => v.actorId === actor && v.optionId === o.id,
              );
            return `<button class="poll-option ${selected ? "selected" : ""}" data-vote="${esc(o.id)}" ${r.status === "마감" ? "disabled" : ""}><span>${selected ? "✓ " : ""}${esc(o.label)}</span><b>${count}표</b></button><div class="poll-bar"><i style="width:${r.votes.length ? (100 * count) / r.votes.length : 0}%"></i></div>`;
          })
          .join(
            "",
          )}${r.status !== "마감" && r.votes.some((v) => v.actorId === actor) ? '<button id="cancelVote" style="margin-top:15px">내 선택 취소</button>' : ""}</section>`
      : "";
  $("view").innerHTML =
    heading(
      r.title,
      spec.label,
      `<button id="recordEdit" class="primary">기록 수정</button><button id="recordDelete" class="danger">기록 삭제</button>`,
    ) +
    `<section class="panel"><p class="hint">${esc(stamp(r.updatedAt))} · 최초 작성 ${esc(person(r.actorId))} (선택 이름)</p><div class="badges">${r.pinned ? badge("고정 공지", true) : ""}</div><div class="prose">${key === "world" ? wikiText(r.body) : esc(r.body)}</div><div class="details-grid">${content}</div>${r.assignments.length ? `<div class="list-row"><h3>참여 역할</h3>${r.assignments.map((a) => `<p>${esc(person(a.memberId))} · ${esc(a.role || "미지정")}</p>`).join("")}</div>` : ""}${tasks}${votes}${key === "notices" ? `<div class="form-section"><button id="acknowledge" class="${acknowledged ? "" : "primary"}">${acknowledged ? "✓ 확인 취소" : "확인했어요"}</button><p class="hint">확인한 프로필 ${r.acknowledged.length}명: ${esc(r.acknowledged.map(person).join(", ") || "아직 없음")}</p></div>` : ""}<div class="form-section"><button id="reaction" aria-pressed="${liked}">${liked ? "♥" : "♡"} 공감 ${r.reactions.length}</button><p class="hint">공감한 프로필: ${esc(r.reactions.map(person).join(", ") || "아직 없음")}</p></div><section class="comments"><h3>댓글 ${r.comments.length}</h3><p class="hint">선택한 프로필 이름으로 공유됩니다. 본인 인증이 아니며, 공용 편집자는 댓글을 삭제할 수 있어요.</p>${r.comments.map((c) => `<article class="comment"><div class="split"><small>${esc(person(c.actorId))} · ${esc(stamp(c.at))}</small><button data-delete-comment="${esc(c.id)}">삭제</button></div><p>${esc(c.text)}</p></article>`).join("")}<form id="commentForm"><label class="visually-hidden" for="commentText">댓글 내용</label><textarea id="commentText" maxlength="1000" required placeholder="함께 나누고 싶은 이야기를 적어 주세요."></textarea><button class="primary">댓글 저장</button></form></section></section>`;
  const change = (fn) =>
    quick((s) => {
      const row = s[key].find((x) => x.id === id);
      fn(row);
      row.updatedAt = new Date().toISOString();
    });
  $("recordEdit").onclick = () => editRecord(key, id);
  $("recordDelete").onclick = () => {
    if (
      confirm(
        "이 기록과 댓글·반응이 현재 기록에서 삭제됩니다. 팀원 휴지통에는 들어가지 않습니다. 삭제할까요?",
      )
    ) {
      const s = clone(state);
      s[key] = s[key].filter((x) => x.id !== id);
      preview(s);
    }
  };
  if ($("acknowledge"))
    $("acknowledge").onclick = () => {
      if (requireActor())
        change(
          (row) =>
            (row.acknowledged = acknowledged
              ? row.acknowledged.filter((x) => x !== actor)
              : [...row.acknowledged, actor]),
        );
    };
  $("reaction").onclick = () => {
    if (requireActor())
      change(
        (row) =>
          (row.reactions = liked
            ? row.reactions.filter((x) => x !== actor)
            : [...row.reactions, actor]),
      );
  };
  $("commentForm").onsubmit = (e) => {
    e.preventDefault();
    if (!requireActor()) return;
    const text = $("commentText").value.trim();
    if (text)
      change((row) => {
        if (row.comments.length >= 100)
          throw new Error("댓글은 기록당 100개까지 보관해요.");
        row.comments.push({
          id: uid(),
          actorId: actor,
          text,
          at: new Date().toISOString(),
        });
      });
  };
  document.querySelectorAll("[data-delete-comment]").forEach(
    (b) =>
      (b.onclick = () => {
        if (confirm("이 댓글을 삭제할까요?"))
          change(
            (row) =>
              (row.comments = row.comments.filter(
                (c) => c.id !== b.dataset.deleteComment,
              )),
          );
      }),
  );
  document.querySelectorAll("[data-item]").forEach(
    (b) =>
      (b.onchange = () => {
        const done = b.checked;
        b.checked = !done;
        change(
          (row) => (row.items.find((i) => i.id === b.dataset.item).done = done),
        );
      }),
  );
  document.querySelectorAll("[data-vote]").forEach(
    (b) =>
      (b.onclick = () => {
        if (!requireActor()) return;
        change((row) => {
          if (row.status === "마감") throw new Error("마감된 투표입니다.");
          row.votes = [
            ...row.votes.filter((v) => v.actorId !== actor),
            { actorId: actor, optionId: b.dataset.vote },
          ];
        });
      }),
  );
  if ($("cancelVote"))
    $("cancelVote").onclick = () =>
      change(
        (row) => (row.votes = row.votes.filter((v) => v.actorId !== actor)),
      );
}
function renderGuide() {
  $("view").innerHTML =
    heading(
      "사용 안내 · 백업",
      "일반 저장은 입력창의 ‘기록 저장하기’를 사용하세요. 파일 백업은 선택 사항입니다.",
    ) +
    `<section class="panel"><h2>기록 저장 순서</h2><div class="list-row"><b>01 · 내용을 작성해요</b><p>팀원 추가 또는 기록 수정에서 정보를 입력합니다. 입력만으로는 저장되지 않습니다.</p></div><div class="list-row"><b>02 · 수정 전후를 확인해요</b><p>‘기록 저장하기’를 누르면 바뀐 내용이 표시됩니다. ‘확인하고 저장’을 누르면 팀 전체에 반영됩니다.</p></div><div class="list-row"><b>03 · 저장 완료를 확인해요</b><p>상단에 ‘저장 완료 · 시간’이 표시됩니다. 단순히 화면을 닫거나 파일을 내려받는 것은 공동 기록 저장이 아닙니다.</p></div><div class="list-row"><b>04 · 작성 중에는 새로고침하지 않아요</b><p>입력은 화면 메모리에 있습니다. 로그인이 만료되면 입력을 유지한 채 다시 로그인할 수 있어요. 기기 종료나 강제 새로고침은 입력을 잃게 할 수 있습니다.</p></div><div class="list-row"><b>05 · 충돌 시 먼저 확인해요</b><p>다른 사람이 먼저 저장하면 덮어쓰지 않고 중단합니다. 내 초안을 복사해 두고 ‘최신 기록’으로 불러온 후 필요한 부분을 다시 적용하세요.</p></div><div class="callout">활동 프로필은 이름 선택일 뿐 본인 인증이 아닙니다. 부팀장·치료사 등 직함도 접근 권한과 무관합니다. 같은 비밀번호를 아는 사람은 전체 기록을 편집할 수 있어요.</div><h2>훈련소 사용하기</h2><p class="hint">상단 활동 프로필을 선택하고 <a href="#training">퇴마 훈련소</a>에서 게임을 시작하세요. 여섯 훈련 능력치는 기존 설정 능력치와 별개로 0부터 30까지 성장합니다. 게임 결과는 종료 후 자동 저장됩니다. 첫 5회 기본 XP, 다음 5회 절반, 이후 기록 도전만 가능합니다. 생존전은 공정/성장 모드로 나뉘며 XP는 주지 않습니다. 프로필 상세에서 게임별 랭크를, <a href="#rankings">훈련 랭킹</a>에서 주간·역대·조작별 순위를 확인하세요. 공동 봉인은 서로 다른 세 프로필이 완성하면 보상을 함께 받습니다.</p><div class="callout">게임 중 탭 이동·화면 끄기는 도전을 중단합니다. 저장 실패 시 같은 결과로 다시 저장하세요. 강제 새로고침이나 배포 후에는 미저장 결과를 잃을 수 있어요. 훈련은 친구 사이의 신뢰 기반 기록이며 본인 인증·완벽한 부정행위 방지는 제공하지 않습니다.</div><h2>선택 사항 · 파일 백업</h2><p class="hint">백업에는 개인정보가 포함될 수 있어요. 공개하지 마세요. 전체 복원은 팀의 현재 기록을 교체합니다. 이 버튼의 백업·복원에는 별도 훈련 XP·랭킹이 포함되지 않습니다. 훈련은 관리자가 비공개 GitHub의 별도 파일과 이력으로 관리합니다.</p><div class="head-actions" style="margin-top:15px"><button id="exportArchive">기록 사본 내려받기</button><button id="importArchive">백업 파일 복원</button><input type="file" id="backupInput" accept=".json,application/json" hidden></div><div class="callout">v1 기록은 읽을 때 확장 형식으로 호환됩니다. 첫 확장 저장 전에 원본 파일을 같은 비공개 GitHub 저장소에 별도 보관합니다. 휴지통 제거는 GitHub 이력·백업의 삭제가 아닙니다.</div><h2>보관 한도</h2><p class="hint">현재 팀원 300명, 직함 50개, 사용자 항목 30개, 각 기록 종류 200개, 기록별 댓글 100개, 최근 활동 300건, 전체 JSON 900KB입니다. 프로필은 제공 아바타를 사용합니다. 놀이방 월드컵 사진은 별도 용량 제한 안에서 업로드할 수 있습니다. 사진·대용량 문서·실시간 채팅을 위한 저장소는 아닙니다.</p></section>`;
  $("exportArchive").onclick = () => {
    if (
      !confirm(
        "개인정보가 포함된 전체 기록 사본을 이 기기에 내려받을까요? 공유 기기라면 저장하지 마세요.",
      )
    )
      return;
    const blob = new Blob([JSON.stringify(state, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "팀-기록-백업-" + today() + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $("importArchive").onclick = () => $("backupInput").click();
  $("backupInput").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 900000)
        throw new Error("900KB 이하의 JSON 파일만 지원합니다.");
      const incoming = normalize(JSON.parse(await file.text()));
      if (
        confirm(
          "백업 파일로 팀 전체 기록을 교체합니다. 현재 기록을 먼저 백업하는 것을 권장합니다. 계속할까요?",
        )
      )
        preview(incoming);
    } catch (err) {
      toast(err.message, true);
    } finally {
      e.target.value = "";
    }
  };
}
// Cosmetic deterrence only. Server authentication, not these handlers, protects records.
document.addEventListener("contextmenu", (e) => {
  if (!e.target.closest("input,textarea")) e.preventDefault();
});
document.addEventListener("keydown", (e) => {
  if (
    e.key === "F12" ||
    ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") ||
    ((e.ctrlKey || e.metaKey) &&
      e.shiftKey &&
      ["i", "j", "c"].includes(e.key.toLowerCase()))
  )
    e.preventDefault();
});
(async () => {
  try {
    const info = await api("session");
    if (info.authenticated) await enter();
  } catch (e) {
    $("loginError").textContent = e.message;
    $("loginError").hidden = false;
  }
})();
