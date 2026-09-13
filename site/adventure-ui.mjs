import {
  CASES,
  GEAR,
  nodes,
  exits,
  accessible,
  clueId,
  caseProgress,
  puzzleOptions,
} from "./adventure-rules.mjs";
import { sceneSVG, moruSVG } from "./adventure-art.mjs";
export function createAdventureUI(H) {
  const { api, getState, getActor, esc, toast, requireActor } = H,
    $ = (id) => document.getElementById(id);
  let data = null,
    loading = null,
    loaded = 0,
    loadedActor = "",
    generation = 0,
    epoch = 0,
    inflight = false,
    pending = null,
    error = "",
    notice = "",
    note = "",
    launch = null,
    gear = ["lantern", "letter", "compass"],
    mode = "solo";
  const name = (id) =>
    getState().members.find((m) => m.id === id)?.name || "이전 팀원";
  const isDirty = () => !!pending || inflight || !!note.trim() || !!launch;
  function cancel() {
    if (inflight) return;
    pending = null;
    note = "";
    launch = null;
    error = "";
  }
  function reset() {
    epoch++;
    generation++;
    inflight = false;
    cancel();
    data = null;
    loading = null;
    loaded = 0;
    loadedActor = "";
    notice = "";
  }
  async function load(force = false) {
    const actor = getActor();
    if (!force && loadedActor === actor && Date.now() - loaded < 15000)
      return data;
    if (loading) return loading;
    const gen = ++generation;
    loading = api("adventure?actor=" + encodeURIComponent(actor))
      .then((v) => {
        if (gen === generation) {
          data = v;
          loaded = Date.now();
          loadedActor = actor;
          error = "";
        }
        return v;
      })
      .catch((e) => {
        if (gen === generation) {
          error = e.message;
          loaded = Date.now();
          loadedActor = actor;
        }
        return null;
      })
      .finally(() => {
        if (gen === generation) {
          loading = null;
          if (!isDirty() && location.hash.startsWith("#adventure")) render();
        }
      });
    return loading;
  }
  async function send(action, extra = {}) {
    if (inflight) return;
    if (!requireActor()) return;
    if (pending) {
      toast("실패한 저장을 먼저 확인해 주세요.", true);
      return;
    }
    pending = structuredClone({
      version: 1,
      memberId: getActor(),
      opId: crypto.randomUUID(),
      issuedAt: (data?.now || Date.now()) + Math.max(0, Date.now() - loaded),
      action,
      ...extra,
    });
    await retry();
  }
  async function retry() {
    if (!pending || inflight) return;
    const body = pending,
      ep = epoch;
    inflight = true;
    error = "";
    render();
    try {
      const result = await api("adventure", "POST", body);
      if (ep !== epoch) return;
      generation++;
      loading = null;
      data = result.data;
      loaded = Date.now();
      loadedActor = getActor();
      pending = null;
      notice = result.notice;
      note = "";
      launch = null;
      if (body.action === "create")
        location.hash = "adventure/" + encodeURIComponent(result.runId);
      if (body.action === "archive") location.hash = "adventure";
    } catch (e) {
      if (ep === epoch) {
        error = e.message;
        if (e.status === 400) pending = null;
        if (e.status === 401) H.needLogin();
      }
    } finally {
      if (ep === epoch) {
        inflight = false;
        render();
      }
    }
  }
  const action = (a, label, extra = "", disabled = false) =>
    `<button data-adv="${a}" ${extra} ${disabled ? "disabled" : ""}>${label}</button>`;
  function hero() {
    return `<section class="adv-hero">${sceneSVG("train", "advHero")}<div class="adv-hero-copy"><p class="eyebrow">NIGHTLINE EXPEDITIONS · SEASON 01</p><h1>기록실 너머,<br><em>아직 끝나지 않은 이야기.</em></h1><p>혼자 떠나도 괜찮아요.<br>동료가 있다면, 다른 길에서 같은 진실을 만나세요.</p><button data-adv="missions" class="primary">원정 고르기 ↓</button></div><span class="adv-ticket">DEPARTURE 00:13<br>RETURN — YOUR CHOICE</span></section>`;
  }
  function launcher() {
    return launch
      ? `<section class="panel adv-launch" id="advLaunch"><div class="split"><h2>${esc(CASES[launch]?.title || "공동 원정 합류")}</h2>${action("cancel", "접기")}</div><p>준비물 세 개를 고르세요. 도구가 없어도 모든 사건을 해결할 수 있지만, 알맞은 도구는 길잡이의 상세 힌트를 바로 열어 줍니다.</p>${CASES[launch] ? '<label>원정 방식<select id="advMode"><option value="solo" ' + (mode === "solo" ? "selected" : "") + '>혼자 떠나기 · 내 프로필의 진행</option><option value="shared" ' + (mode === "shared" ? "selected" : "") + ">함께 떠나기 · 동료가 나중에 합류 가능</option></select></label>" : ""}<div class="adv-gear">${GEAR.map(([id, icon, title, desc]) => `<button data-gear="${id}" aria-pressed="${gear.includes(id)}"><span>${icon}</span><b>${title}</b><small>${desc}</small></button>`).join("")}</div><p class="hint">${gear.length}/3개 선택 · 설정 능력치와 훈련 XP는 변하지 않습니다.</p>${action(CASES[launch] ? "create" : "join", "준비 완료 · 출발하기 →", 'class="primary"', gear.length !== 3)}</section>`
      : "";
  }
  function runCard(r) {
    const c = CASES[r.campaign],
      mine = r.party.some((p) => p.memberId === getActor());
    return `<article class="panel adv-run-card"><div class="split"><span class="adv-badge">${r.mode === "solo" ? "개인" : "공동"} 원정 · ${r.status === "active" ? "진행 중" : "귀환"}</span><small>${r.party.length}개 프로필</small></div><h3>${c.icon} ${esc(c.title)}</h3><p>${r.status === "returned" ? esc(r.ending === "abort" ? "안전한 조기 귀환" : c.endings.find((e) => e[0] === r.ending)?.[1]) : `단서 ${r.found.length}/${c.stages.length * 2} · 장치 ${r.solved.length}/${c.stages.length}`}</p><progress max="100" value="${caseProgress(r)}" aria-label="탐험 진행률"></progress><div class="adv-actions"><a class="game-link" href="#adventure/${encodeURIComponent(r.id)}">${r.status === "returned" ? "탐험 기록 보기" : mine ? "원정 이어하기 →" : "원정 살펴보기 →"}</a></div></article>`;
  }
  function lobby() {
    const runs = data?.runs || [],
      active = runs.filter((r) => r.status === "active"),
      done = runs.filter((r) => r.status === "returned");
    return (
      hero() +
      launcher() +
      `<section id="advMissions" class="adv-section"><p class="eyebrow">CHOOSE YOUR DEPARTURE</p><h2>이번에는 어떤 문을 열까요?</h2><div class="adv-missions">${Object.values(
        CASES,
      )
        .map(
          (c) =>
            `<article class="panel adv-mission ${c.type === "train" ? "featured" : ""}">${sceneSVG(c.type === "train" ? "train" : c.scene, "card-" + c.id)}<div><span class="adv-badge">${c.type === "train" ? "중심 원정 · 세 역의 연결 사건" : "뒷문 탐험 · 짧은 독립 사건"}</span><h3>${esc(c.title)}</h3><p>${esc(c.subtitle)}</p><small>${c.minutes}</small>${action("launch", "준비하고 떠나기 →", `data-campaign="${c.id}"`)}</div></article>`,
        )
        .join(
          "",
        )}</div></section><section class="adv-section"><div class="split"><h2>이어갈 수 있는 원정</h2>${action("refresh", "최신 원정 확인 ↻")}</div><p class="hint">공동 원정은 서로 다른 시간에 이어갈 수 있어요. 관찰과 단서는 공유되고 각자의 위치는 별도로 유지됩니다.</p><div class="adv-grid">${active.map(runCard).join("") || '<p class="panel">아직 출발한 원정이 없어요. 첫 승차권을 골라 보세요.</p>'}</div></section><section class="adv-section"><h2>귀환자의 전시관</h2><div class="adv-grid">${
        done
          .slice()
          .reverse()
          .map(
            (r) =>
              `<div>${r.ending !== "abort" ? `<p class="adv-artifact">✦ ${esc(CASES[r.campaign].artifact)}</p>` : ""}${runCard(r)}</div>`,
          )
          .join("") ||
        '<p class="panel">모험에서 돌아오면 유물과 결말이 이곳에 남습니다.</p>'
      }</div></section><section class="panel adv-help"><h3>안전한 모험의 약속</h3><p>출석 의무, 큰 소리, 점프 스케어, 기존 능력치 손실은 없습니다. 이동·조사·선택 버튼을 누를 때 저장합니다. 미리 작성된 여섯 사건이며 무한 생성이 아닙니다. 보기의 배치는 원정마다 달라집니다.</p><p class="hint">활동 프로필은 본인 인증이 아닙니다. 개인 원정도 개인 보안 저장소를 뜻하지 않습니다. 완료한 원정은 개설자가 정리할 수 있습니다.</p></section>`
    );
  }
  function expedition(r) {
    const c = CASES[r.campaign],
      p = r.party.find((x) => x.memberId === getActor()),
      n = nodes(r.campaign)[p?.at || 0],
      s = c.stages[n.stage],
      done = r.status === "returned",
      finish = r.solved.length === c.stages.length;
    return `<div class="adv-top"><a href="#adventure">← 원정 거점</a><span class="adv-badge">${r.mode === "solo" ? "개인 원정" : "공동 원정"} · ${caseProgress(r)}%</span></div><header class="page-head"><div><p class="eyebrow">${c.type === "train" ? "THE LAST PASSENGER" : "BEYOND THE BACK DOOR"}</p><h1>${esc(c.title)}</h1><p>${esc(c.subtitle)}</p></div>${action("refresh", "최신 상태 ↻")}</header>${
      done
        ? `<section class="adv-ending panel"><div class="adv-companion">${moruSVG}</div><p class="eyebrow">WELCOME HOME</p><h2>${r.ending === "abort" ? "무사히 돌아온 것도 하나의 모험" : esc(c.endings.find((e) => e[0] === r.ending)?.[1])}</h2><p>${esc(r.ending === "abort" ? "더 깊이 들어가는 대신 안전하게 돌아왔습니다. 발견한 흔적과 기록은 이 원정에 남아요. 언제든 새 원정으로 다시 도전할 수 있습니다." : c.endings.find((e) => e[0] === r.ending)?.[2])}</p>${r.ending !== "abort" ? `<div class="adv-artifact">✦ ${esc(c.artifact)}</div>` : ""}<a href="#adventure" class="primary game-link">기록실의 원정 거점으로</a>${r.owner === getActor() ? action("archive", "이 완료 기록 정리하기") : ""}</section>`
        : `${!p ? `<section class="panel"><h2>동료의 발자국을 이어가세요</h2><p>단서는 함께 모으고, 조사 위치는 각자 선택합니다. 준비물을 챙겨 합류하세요.</p>${action("joinLaunch", "이 공동 원정에 합류하기")}</section>${launcher()}` : ""}<section class="adv-location">${sceneSVG(n.scene)}${p ? `<button class="adv-scene-hotspot hotspot-${n.kind}" data-scene-action="${["left", "right"].includes(n.kind) ? "inspect" : "look"}">${["left", "right"].includes(n.kind) ? "✧ 흔적 조사하기" : "⌕ 가까이 살펴보기"}</button>` : ""}<div class="adv-location-label"><span>${n.kind === "hub" ? "출발과 귀환" : `조사 구역 ${n.stage + 1}`}</span><h2>${esc(n.name)}</h2></div></section><div class="adv-layout"><div><section class="panel"><p class="eyebrow">LOOK CLOSER</p><h2>${n.kind === "hub" ? "접힌 여우의 안내" : n.kind === "platform" ? "멈춰 있는 장치" : "남겨진 흔적"}</h2><p>${esc(n.kind === "hub" ? c.intro : n.kind === "platform" ? s.puzzle.prompt : s.clues[n.kind === "left" ? 0 : 1][1])}</p>${
            p
              ? n.kind === "hub"
                ? `<div class="adv-companion-row">${moruSVG}<p>“돌아올 길은 언제나 남겨 둘게요. 두 갈래 조사 지점을 살펴보고, 장치를 해결한 다음 돌아오세요.”</p></div>`
                : n.kind === "platform"
                  ? r.solved.includes(n.stage)
                    ? '<p class="adv-success">✦ 이 구역의 신호가 복원됐어요. 출발 지점에서 다음 역을 선택하세요.</p>'
                    : `<p class="hint">단서 ${[0, 1].filter((side) => r.found.includes(clueId(n.stage, side))).length}/2 · 먼저 두 조사 지점을 방문하세요.</p><div class="adv-choices">${puzzleOptions(
                        s.puzzle,
                        r.seed,
                      )
                        .map(([id, label]) =>
                          action(
                            "solve",
                            esc(label),
                            `data-answer="${id}"`,
                            ![0, 1].every((side) =>
                              r.found.includes(clueId(n.stage, side)),
                            ),
                          ),
                        )
                        .join(
                          "",
                        )}</div>${action("hint", "🦊 모루에게 힌트 묻기")}<p class="adv-hint">${esc(s.puzzle.hints[(r.hints.find((h) => h.stage === n.stage)?.level || 0) - 1] || "틀려도 벌점은 없습니다. 준비물과 단서를 자유롭게 활용하세요.")}</p>`
                  : action(
                      "inspect",
                      r.found.includes(
                        clueId(n.stage, n.kind === "left" ? 0 : 1),
                      )
                        ? "수첩에 기록된 단서 다시 확인"
                        : "이 흔적을 조사하고 수첩에 기록 →",
                      'class="primary"',
                    )
              : ""
          }</section>${
            p
              ? `<section class="panel"><h3>어디로 이동할까요?</h3><div class="adv-exits">${exits(
                  r,
                  p.at,
                  p.gear,
                )
                  .map((to) =>
                    action(
                      "move",
                      `<span>↗</span> ${esc(nodes(r.campaign)[to].name)}`,
                      `data-to="${to}"`,
                      !accessible(r, to),
                    ),
                  )
                  .join("")}</div></section>`
              : ""
          }</div><aside><section class="panel"><h3>원정 지도</h3><ol class="adv-map"><li class="${n.stage < 0 ? "here" : ""}">출발 지점</li>${c.stages.map((st, i) => `<li class="${n.stage === i ? "here" : ""}">${r.solved.includes(i) ? "✦" : i <= r.solved.length ? "○" : "🔒"} ${esc(st.name)}<small>${r.solved.includes(i) ? "신호 복원 완료" : i <= r.solved.length ? "조사 가능" : "이전 신호를 먼저 복원"}</small></li>`).join("")}</ol></section><section class="panel"><h3>함께 걷는 발자국</h3>${r.party.map((x) => `<p><b>${esc(name(x.memberId))}</b><small class="adv-block">${esc(nodes(r.campaign)[x.at].name)}</small></p>`).join("")}</section>${
            p
              ? `<section class="panel"><h3>내 준비물</h3><div class="adv-inventory">${p.gear
                  .map((id) => {
                    const g = GEAR.find((g) => g[0] === id);
                    return `<span title="${g[3]}">${g[1]} ${g[2]}</span>`;
                  })
                  .join(
                    "",
                  )}</div><p class="hint">거울은 두 조사 지점을 잇고, 나침반은 거점 지름길을 엽니다. 붉은 실은 해결한 역과 다음 역을 잇습니다. 알맞은 도구로 상세 힌트도 얻을 수 있어요.</p></section>`
              : ""
          }</aside></div>${p && finish ? `<section class="panel adv-finale"><p class="eyebrow">THE WAY HOME</p><h2>어떤 결말을 남길까요?</h2><p>혼자면 즉시 결정됩니다. 공동 원정은 현재 팀에 남아 있는 참여 프로필의 과반수가 같은 결말을 고르면 귀환합니다. 의견은 바꿀 수 있습니다.</p><div class="adv-choices">${c.endings.map(([id, label]) => action("vote", esc(label) + ` <small>${r.votes.filter((v) => v.choice === id).length}표</small>`, `data-choice="${id}"`)).join("")}</div></section>` : ""}`
    }
 <section class="panel"><h2>단서 수첩</h2><div class="adv-evidence">${
   r.found
     .map((id) => {
       const [i, side] = id.split("-").map(Number),
         v = c.stages[i].clues[side];
       return `<article><small>${esc(c.stages[i].name)}</small><h3>${esc(v[0])}</h3><p>${esc(v[1])}</p></article>`;
     })
     .join("") ||
   '<p class="hint">조사 지점을 살펴보면 단서가 이곳에 모입니다.</p>'
 }</div><h3>우리의 추리 메모</h3>${r.notes.map((v) => `<p class="adv-note"><b>${esc(name(v.memberId))}</b> ${esc(v.text)}</p>`).join("")}${p && !done ? `<label>동료에게 남길 메모<textarea id="advNote" maxlength="240" rows="3" placeholder="단서 사이의 연결이나 다음 조사 계획을 적어 보세요.">${esc(note)}</textarea></label>${action("note", "메모 기록하기")}` : ""}</section><details class="panel"><summary>이번 원정의 발자국 · ${r.log.length}개</summary>${r.log
   .slice()
   .reverse()
   .map((l) => `<p><b>${esc(name(l.memberId))}</b> ${esc(l.text)}</p>`)
   .join(
     "",
   )}</details>${p && !done ? `<section class="panel"><h3>잠시 쉬어도 괜찮아요</h3><p>저장된 원정은 다음 접속 때 이어갈 수 있습니다. 거점으로 나가는 것은 원정을 종료하지 않습니다.</p><div class="adv-actions"><a href="#adventure" class="game-link">저장된 상태로 거점 돌아가기</a>${action("leave", r.party.length > 1 ? "동료에게 맡기고 원정에서 나가기" : "이 원정을 마치고 조기 귀환")}</div></section>` : ""}`;
  }
  function render() {
    if (!location.hash.startsWith("#adventure")) return;
    if (!data || loadedActor !== getActor()) {
      load();
      $("view").innerHTML =
        `<section class="panel"><h1>원정 승차권을 확인하고 있어요</h1><p>${esc(error || "기록실의 문 너머를 불러옵니다…")}</p><button id="advRetryLoad">다시 불러오기</button></section>`;
      $("advRetryLoad").onclick = () => load(true);
      return;
    }
    let id;
    try {
      id = decodeURIComponent(location.hash.split("/")[1] || "");
    } catch {
      id = "invalid";
    }
    const r = data.runs.find((r) => r.id === id);
    $("view").innerHTML =
      `<div class="adv-root"><div class="adv-status" role="status">${inflight ? "기록실에 발자국을 저장하는 중…" : esc(error || notice || "버튼으로 이동·조사·선택할 때 저장됩니다. 혼자 또는 동료와 자신만의 속도로 탐험하세요.")}${error && pending ? '<div><button id="advRetry">같은 요청으로 다시 저장</button><button id="advRebase">초안 유지 · 최신 상태 확인</button></div>' : ""}</div>${id ? (r ? expedition(r) : '<section class="panel"><h2>이 원정을 볼 수 없어요</h2><p>프로필 또는 최신 상태를 확인하세요.</p><a href="#adventure">원정 거점으로</a></section>') : lobby()}</div>`;
    if ($("advRetry")) $("advRetry").onclick = retry;
    if ($("advRebase"))
      $("advRebase").onclick = async () => {
        pending = null;
        await load(true);
        render();
      };
    if ($("advNote")) $("advNote").oninput = (e) => (note = e.target.value);
    if ($("advMode")) $("advMode").onchange = (e) => (mode = e.target.value);
    document.querySelectorAll("[data-gear]").forEach(
      (b) =>
        (b.onclick = () => {
          const g = b.dataset.gear;
          gear = gear.includes(g)
            ? gear.filter((v) => v !== g)
            : gear.length < 3
              ? [...gear, g]
              : gear;
          render();
        }),
    );
    document.querySelectorAll("[data-adv]").forEach(
      (b) =>
        (b.onclick = async () => {
          const a = b.dataset.adv;
          if (a === "missions") {
            $("advMissions")?.scrollIntoView({ block: "start" });
            return;
          }
          if (a === "launch") {
            launch = b.dataset.campaign;
            render();
            $("advLaunch")?.scrollIntoView({ block: "center" });
            return;
          }
          if (a === "cancel") {
            launch = null;
            render();
            return;
          }
          if (a === "joinLaunch") {
            launch = r.id;
            render();
            $("advLaunch")?.scrollIntoView({ block: "center" });
            return;
          }
          if (a === "refresh") {
            await load(true);
            render();
            return;
          }
          if (a === "create") return send(a, { campaign: launch, mode, gear });
          if (a === "join") return send(a, { runId: launch, gear });
          if (
            ["leave", "archive"].includes(a) &&
            !confirm(
              a === "archive"
                ? "완료된 원정을 목록에서 정리할까요? GitHub 과거 이력은 남습니다."
                : "현재 원정에서 귀환할까요? 이미 저장된 발견은 남으며, 동료의 원정은 계속됩니다.",
            )
          )
            return;
          return send(a, {
            runId: r.id,
            from: r.party.find((p) => p.memberId === getActor())?.at,
            to: Number(b.dataset.to),
            answer: b.dataset.answer,
            choice: b.dataset.choice,
            text: note,
          });
        }),
    );
    document.querySelectorAll("[data-scene-action]").forEach(
      (b) =>
        (b.onclick = () => {
          if (b.dataset.sceneAction === "inspect")
            return send("inspect", {
              runId: r.id,
              from: r.party.find((p) => p.memberId === getActor())?.at,
            });
          document
            .querySelector(".adv-layout")
            ?.scrollIntoView({ block: "start" });
        }),
    );
    if (inflight || pending)
      document
        .querySelectorAll(
          ".adv-root button,.adv-root input,.adv-root select,.adv-root textarea",
        )
        .forEach((b) => {
          if (!b.closest(".adv-status") || inflight) b.disabled = true;
        });
  }
  function teaser() {
    return `<section class="panel adv-teaser"><div>${moruSVG}</div><div><p class="eyebrow">THE WORLD BEYOND OUR ARCHIVE</p><h3>0시 13분, 당신의 열차가 기다립니다.</h3><p>세 역의 미스터리와 다섯 개의 뒷문. 혼자 떠나거나 동료의 원정을 이어 주세요.</p><a href="#adventure" class="game-link primary">모험 거점으로 →</a></div></section>`;
  }
  return {
    load,
    render,
    teaser,
    isDirty,
    isSaving: () => inflight,
    cancel,
    reset,
  };
}
