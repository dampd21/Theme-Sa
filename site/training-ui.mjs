import {
  ABILITIES,
  GAMES,
  RULES_VERSION,
  progress,
  levels,
  zeroXP,
  attackTimes,
  puzzle,
  memoryInfo,
  createSim,
  stepSim,
  STEP,
  WORLD,
  rankRows,
  periodKeys,
} from "./game-rules.mjs";
export function createTrainingUI(H) {
  const { api, getState, getActor, esc, toast, requireActor, refreshView } = H;
  const $ = (id) => document.getElementById(id),
    initialControl = matchMedia("(pointer: coarse)").matches ? "touch" : "pc",
    controlDefault = () => initialControl;
  let data = null,
    loadAt = 0,
    loadError = "",
    loading = null,
    generation = 0,
    cacheGeneration = 0,
    phase = "idle",
    current = null,
    animation = 0,
    started = 0,
    events = [],
    sim = null,
    target = { x: 240, y: 240 },
    keys = new Set(),
    pendingResult = null,
    lastInput = -1000,
    boardGame = "focus",
    boardMode = "visible",
    boardControl = controlDefault(),
    boardPeriod = "week",
    preferences = {},
    lastResult = null;
  const name = (id) =>
    getState().members.find((m) => m.id === id)?.name || "이전 팀원";
  const myProfile = (id = getActor()) =>
    data?.profiles?.find((p) => p.memberId === id);
  const timestamp = (v) =>
    new Date(v).toLocaleString("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  const active = () =>
    ["starting", "playing", "saving", "unsaved"].includes(phase);
  function setPhase(next) {
    phase = next;
    if ($("actorSelect")) $("actorSelect").disabled = active();
  }
  async function load(force = false) {
    if (loading) return loading;
    if (!force && Date.now() - loadAt < 45000) return data;
    const expected = cacheGeneration;
    loading = api("training")
      .then((value) => {
        if (expected === cacheGeneration) {
          data = value;
          loadError = "";
          loadAt = Date.now();
        }
        return value;
      })
      .catch((error) => {
        if (expected === cacheGeneration) {
          loadError = error.message;
          loadAt = Date.now();
        }
        return null;
      })
      .finally(() => {
        if (expected === cacheGeneration) {
          loading = null;
          if (!active()) refreshView();
        }
      });
    return loading;
  }
  function ensure() {
    if (Date.now() - loadAt > 45000 && !loading) load();
  }
  function reset() {
    cacheGeneration++;
    generation++;
    cancel(false);
    data = null;
    loadAt = 0;
    loadError = "";
    loading = null;
    preferences = {};
  }
  function cancel(show = true) {
    cancelAnimationFrame(animation);
    generation++;
    keys.clear();
    current = null;
    pendingResult = null;
    events = [];
    sim = null;
    lastResult = null;
    setPhase("idle");
    if (show)
      toast(
        "훈련을 중단했어요. 중단한 판에는 기록·경험치가 지급되지 않습니다.",
      );
  }
  const heading = (title, desc) =>
    `<header class="page-head"><div><p class="eyebrow">THE SPIRIT TRAINING GROUNDS</p><h1>${esc(title)}</h1><p>${esc(desc)}</p></div></header>`;
  function loadingHTML() {
    return loadError
      ? `<div class="callout">훈련 기록을 불러오지 못했어요. ${esc(loadError)} <button id="reloadTraining">다시 확인</button></div>`
      : !data
        ? '<p class="training-loading">훈련 기록을 불러오는 중…</p>'
        : "";
  }
  function wireReload() {
    if ($("reloadTraining")) $("reloadTraining").onclick = () => load(true);
    if ($("profileRankControl"))
      $("profileRankControl").onchange = (e) => {
        boardControl = e.target.value;
        refreshView();
      };
  }
  function skillCards(memberId = getActor()) {
    const p = myProfile(memberId);
    return `<div class="skill-grid">${ABILITIES.map((label, i) => {
      const v = progress(p?.xp[i] || 0);
      return `<a class="skill-card" href="#training/${Object.keys(GAMES)[i]}"><small>${label}</small><div class="skill-value"><strong>${v.level}</strong><small>/ 30</small></div><div class="xp-track"><i style="width:${v.percent}%"></i></div><small>${v.level === 30 ? "최고 단계 달성" : v.current + " / " + v.needed + " XP"}</small></a>`;
    }).join("")}</div>`;
  }
  function personalRank(
    id,
    game,
    mode,
    control = boardControl,
    period = "all",
  ) {
    return rankRows(
      data,
      getState().members,
      game,
      mode,
      control,
      period,
      data?.period?.week,
    ).find((r) => r.memberId === id);
  }
  function profilePanel(id) {
    ensure();
    return `<section class="panel training-profile" style="margin-top:20px"><p class="eyebrow">TRAINING GROWTH · STARTS AT ZERO</p><h3>게임으로 성장한 능력치</h3><p class="hint">설정상 능력치와 별개입니다. 모든 훈련 능력치는 0에서 시작해요.</p>${loadingHTML()}${skillCards(id)}<div class="section-title"><h3>게임별 프로필 랭크</h3></div><label>랭킹 조작 기준<select id="profileRankControl"><option value="pc" ${boardControl === "pc" ? "selected" : ""}>PC · 마우스 / 키보드</option><option value="touch" ${boardControl === "touch" ? "selected" : ""}>휴대폰 · 터치</option></select></label><p class="game-filters-tip">역대 · ${boardControl === "touch" ? "터치" : "PC"} 기준. 전체 모드는 훈련 랭킹에서 비교하세요.</p>${Object.entries(
      GAMES,
    )
      .flatMap(([key, g]) =>
        g.modes
          .filter(([mode]) => mode !== "practice")
          .map(([mode, label]) => {
            const rank = personalRank(id, key, mode);
            return `<a class="profile-rank-row" href="#rankings/${key}"><b>${esc(g.name)}${g.modes.length > 1 ? " · " + esc(label) : ""}</b><span>${rank ? rank.rank + "위" : "기록 없음"}</span></a>`;
          }),
      )
      .join("")}</section>`;
  }
  function relayHTML() {
    const activeRelay = data?.relays?.find(
        (r) => !r.completedAt && r.expires > Date.now(),
      ),
      latest = activeRelay || data?.relays?.findLast((r) => r.completedAt);
    return `<section class="panel"><div class="split"><h3>공동 봉인 릴레이</h3><a href="#training/coop" class="muted small">참여 →</a></div><p class="hint">서로 다른 3개 프로필이 순서대로 이어갑니다.</p><div class="relay-track">${[
      0, 1, 2,
    ]
      .map((i) => {
        const step = latest?.steps[i];
        return `<div class="relay-step ${step ? "complete" : ""}"><small>봉인 ${i + 1}</small><b>${step ? esc(name(step.memberId)) : "대기 중"}</b></div>`;
      })
      .join(
        "",
      )}</div><p class="game-note">${activeRelay ? "유효 시간: " + esc(timestamp(activeRelay.expires)) : latest ? "최근 봉인 완성 · " + esc(timestamp(latest.completedAt)) + " · 다음 봉인에 도전해 보세요!" : "진행 중인 봉인이 없어요. 훈련소에서 시작해 보세요."}<br>공용 프로필 선택 방식이므로 실제 참여자의 신원은 보장하지 않습니다.</p></section>`;
  }
  function renderDashboard() {
    ensure();
    const s = getState(),
      actor = getActor(),
      p = myProfile(),
      total = levels(p).reduce((a, b) => a + b, 0),
      missions = s.missions.filter((m) => m.status !== "완료"),
      notices = [...s.notices].sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          (b.updatedAt || "").localeCompare(a.updatedAt || ""),
      ),
      today = periodKeys().day,
      upcoming = s.events
        .filter((e) => (e.endDate || e.date) >= today)
        .sort((a, b) => a.date.localeCompare(b.date)),
      best = rankRows(
        data,
        s.members,
        "focus",
        "visible",
        boardControl,
        "week",
        data?.period?.week,
      ),
      recent = (data?.recent || [])
        .filter((r) => !actor || r.memberId === actor)
        .slice(-5)
        .reverse();
    $("view").innerHTML =
      heading("대시보드", "팀의 오늘과 나의 성장을 한눈에 확인하세요.") +
      loadingHTML() +
      `<section class="dash-hero"><div><p class="eyebrow">ONE TEAM. A THOUSAND STORIES.</p><h2>${actor ? esc(name(actor)) + " 님," : "우리 팀의"}<br><em>오늘의 훈련을 시작해 볼까요?</em></h2><p>같은 조건에서 기록을 겨루고,<br>쌓은 경험치로 나만의 퇴마사를 성장시켜요.</p><div class="dash-actions"><a class="primary" href="#training">훈련소 입장 →</a><a href="#members">팀원 기록실</a></div></div><div class="dash-seal" aria-hidden="true"><strong>符</strong><small>FOCUS · GROW · TOGETHER</small></div></section><div class="dash-stat-grid"><div class="stat"><small>우리 팀원</small><b>${s.members.length}명</b></div><div class="stat"><small>나의 훈련 단계 합계</small><b>${total}</b></div><div class="stat"><small>미완료 임무</small><b>${missions.length}개</b></div><div class="stat"><small>확인할 공지</small><b>${notices.filter((n) => !n.acknowledged.includes(actor)).length}개</b></div></div><div class="dash-grid"><div><section class="panel"><div class="split"><h3>나의 훈련 능력치</h3>${actor ? `<a href="#member/${encodeURIComponent(actor)}" class="muted small">프로필 →</a>` : ""}</div><p class="hint">${actor ? "기존 설정 능력치는 그대로 유지됩니다." : "상단 활동 프로필을 선택하면 나의 성장과 기록이 표시됩니다."}</p>${skillCards()}<p class="daily-note">각 능력 훈련은 하루 첫 5회 기본 보상, 다음 5회 절반 보상입니다. 이후에도 기록 도전은 가능해요. 출석을 놓쳐도 능력치는 감소하지 않습니다.</p></section><section class="panel"><div class="split"><h3>나의 최근 도전</h3><a href="#rankings" class="muted small">전체 랭킹 →</a></div>${recent.map((r) => `<div class="dash-list"><span class="rank-medal">${GAMES[r.game].icon}</span><div><b>${esc(GAMES[r.game].name)}</b><small>${esc(GAMES[r.game].modes.find((m) => m[0] === r.mode)?.[1] || "")}${r.improvement ? " · 최고 기록 경신" : ""}</small><p>${esc(r.detail)}</p><small>${esc(timestamp(r.at))}</small></div></div>`).join("") || '<p class="hint">첫 번째 훈련 기록을 만들어 보세요.</p>'}</section>${relayHTML()}</div><div><section class="panel"><div class="split"><h3>이번 주 7.77 TOP 3</h3><a href="#rankings/focus" class="muted small">더 보기 →</a></div><p class="hint">시간 표시 · ${boardControl === "touch" ? "터치" : "PC"} · 월요일 시작 / 한국 시간</p>${
        best
          .slice(0, 3)
          .map(
            (r) =>
              `<a class="dash-list" href="#member/${encodeURIComponent(r.memberId)}"><span class="rank-medal">${r.rank}</span><div><b>${esc(r.name)}</b><p>${esc(r.detail)}</p></div></a>`,
          )
          .join("") || '<p class="hint">아직 이번 주 기록이 없어요.</p>'
      }</section><section class="panel"><h3>팀 공지사항</h3>${
        notices
          .slice(0, 3)
          .map(
            (n) =>
              `<a class="dash-list" href="#notices/${encodeURIComponent(n.id)}"><div><b>${n.pinned ? "◈ " : ""}${esc(n.title)}</b><small>${n.acknowledged.includes(actor) ? "확인한 공지" : "확인해 주세요"}</small></div><span>→</span></a>`,
          )
          .join("") || '<p class="hint">새 공지가 없어요.</p>'
      }</section><section class="panel"><h3>다가오는 일정</h3>${
        upcoming
          .slice(0, 3)
          .map(
            (e) =>
              `<a class="dash-list" href="#events/${encodeURIComponent(e.id)}"><div><small>${esc(e.date)}</small><b style="display:block">${esc(e.title)}</b></div><span>→</span></a>`,
          )
          .join("") || '<p class="hint">예정된 일정이 없어요.</p>'
      }</section><section class="panel"><h3>진행할 임무</h3>${
        missions
          .slice(0, 3)
          .map(
            (m) =>
              `<a class="dash-list" href="#missions/${encodeURIComponent(m.id)}"><div><b>${esc(m.title)}</b><p>${esc(m.status)} · ${m.participants.length}명 참여</p></div><span>→</span></a>`,
          )
          .join("") || '<p class="hint">미완료 임무가 없어요.</p>'
      }</section></div></div>`;
    wireReload();
  }
  function renderTraining(game) {
    ensure();
    if (game && Object.hasOwn(GAMES, game)) {
      if (active() && current?.run.game === game) return;
      if (
        phase === "done" &&
        current?.run.game === game &&
        current.run.memberId === getActor() &&
        lastResult
      )
        return renderResult(lastResult);
      setPhase("idle");
      return renderLobby(game);
    }
    setPhase("idle");
    $("view").innerHTML =
      heading(
        "퇴마 훈련소",
        "공정한 미니게임으로 경험치를 얻고, 생존전에서 성장을 활용해요.",
      ) +
      loadingHTML() +
      '<div class="callout">상단에서 활동 프로필을 선택하세요. 여섯 훈련의 능력치는 모두 0부터 시작합니다. 게임 기록은 현실의 능력을 평가하는 수치가 아닙니다.</div>' +
      `<div class="game-grid">${Object.entries(GAMES)
        .map(([key, g]) => {
          const rank = personalRank(getActor(), key, g.modes[0][0]);
          return `<article class="game-card"><div class="game-icon">${g.icon}</div><span class="ability-tag">${g.ability === null ? "종합 도전" : ABILITIES[g.ability] + " Lv." + levels(myProfile())[g.ability]}</span><h2>${g.name}</h2><div class="eyebrow">${g.tag}</div><p>${g.desc}</p><div class="game-personal">${rank ? "내 역대 랭크 " + rank.rank + "위 · " + esc(rank.detail) : "아직 기록이 없어요 · 첫 도전 환영"}</div><a class="game-link primary" href="#training/${key}">도전하기 →</a></article>`;
        })
        .join(
          "",
        )}</div><p class="daily-note">랭킹은 게임·모드·조작 방식별로 분리됩니다. 브라우저 자동화와 기록 조작을 완전히 막을 수 없으므로 친한 팀끼리 즐기는 신뢰 기반 기록 경쟁입니다.</p>`;
    wireReload();
  }
  const instructions = {
    focus: [
      "시작 후 정확히 <strong>7.77초</strong>에 STOP을 누르세요.",
      "시간 표시 / 3초 후 가리기를 따로 선택할 수 있어요.",
      "STOP 터치·클릭 또는 Space. 최대 20초에 자동 종료됩니다.",
      "유효한 훈련 시간은 4~12초입니다. 그 밖의 기록은 XP 없이 저장돼요.",
    ],
    agility: [
      "캐릭터를 이동해 날아오는 도깨비불을 피하세요.",
      "터치·마우스 드래그 또는 WASD·방향키로 이동합니다.",
      "점선 예고 후 공격이 활성화됩니다. 체력 3, 최대 90초.",
      "훈련 능력치에 관계없이 모두 같은 조건입니다. 12초 이상 생존하면 XP 대상입니다.",
    ],
    defense: [
      "공격 구슬이 바깥 원이 아닌 <strong>중앙 ⬡ 문양</strong>에 도착할 때 방어하세요.",
      "터치·클릭 또는 Space. 총 20회 공격을 끝까지 진행합니다.",
      "±90ms 완벽 방어, ±220ms 일반 방어입니다.",
      "아무 때나 연타하면 감점됩니다. 3회 이상 방어하면 XP 대상입니다.",
    ],
    sense: [
      "같은 문양들 사이에서 <strong>모양이 다른 하나</strong>를 누르세요.",
      "45초 동안 최대 20문제. 오답은 감점되며 160ms 입력 대기가 있습니다.",
      "터치·클릭으로 선택합니다. Tab 이동 후 Enter로도 선택할 수 있어요.",
      "색만으로 구분하지 않습니다. 3문제 이상 맞히면 XP 대상입니다.",
    ],
    purify: [
      "문양이 빛나는 순서를 보고 그대로 누르세요.",
      "문양 3개부터 10개까지 총 8단계입니다.",
      "문양이 보이는 동안은 입력할 수 없어요. 클릭·터치 또는 숫자 1~4를 사용하세요.",
      "틀리면 종료됩니다. 1단계 이상 완료하면 XP 대상입니다.",
    ],
    coop: [
      "공동 봉인을 시작하고 한 프로필씩 문양 순서를 완성합니다.",
      "<strong>서로 다른 프로필 3개</strong>가 각 한 단계를 이어야 합니다.",
      "세 단계가 완성되면 참여한 프로필에 협동 XP가 함께 지급됩니다.",
      "봉인은 24시간 동안 유효합니다. 혼자 연습은 XP·공식 랭킹에 반영되지 않습니다.",
    ],
    survival: [
      "자동 공격하는 퇴마사를 이동해 살아남으세요.",
      "초록 원은 회복 부적입니다. 적을 처치하면 주기적으로 떨어집니다.",
      "최대 3분. 공정 도전은 모두 훈련 능력치 0, 성장 도전은 내 훈련 능력치를 적용합니다.",
      "생존전은 기록 경쟁용입니다. 경험치는 여섯 개별 훈련에서 얻어요.",
    ],
  };
  function renderLobby(game) {
    const g = GAMES[game],
      preference = preferences[game] || {
        mode: g.modes[0][0],
        control: controlDefault(),
      },
      activeRelay = data?.relays.find(
        (r) => !r.completedAt && r.expires > Date.now(),
      );
    $("view").innerHTML =
      heading(g.name, g.desc) +
      loadingHTML() +
      `<div class="game-lobby"><section class="panel"><p class="eyebrow">${g.tag} · RULES 01</p><h2>${g.ability === null ? "성장을 시험하는 종합 도전" : ABILITIES[g.ability] + " 훈련"}</h2><ul class="game-instructions">${instructions[game].map((x) => "<li>" + x + "</li>").join("")}</ul><div class="callout">게임 중 다른 탭으로 이동하거나 화면을 끄면 도전이 중단됩니다. 작성 중인 기록은 먼저 저장해 주세요. 중단한 판은 보상을 받지 않습니다.</div><div class="lobby-controls"><label>플레이 모드<select id="gameMode">${g.modes.map(([v, n]) => `<option value="${v}" ${preference.mode === v ? "selected" : ""}>${n}</option>`).join("")}</select></label><label>이번 판의 조작 방식<select id="gameControl"><option value="pc" ${preference.control === "pc" ? "selected" : ""}>PC · 마우스 / 키보드</option><option value="touch" ${preference.control === "touch" ? "selected" : ""}>휴대폰 · 터치</option></select></label><p class="game-filters-tip">조작 방식은 선택값이며 자동으로 신원을 검증하지 않습니다.</p>${game === "coop" ? `<p class="hint">${activeRelay ? "진행 중인 봉인 " + activeRelay.steps.length + "/3단계" : "공동 봉인을 먼저 만들어 주세요."}</p><button id="createRelay">공동 봉인 시작 / 확인</button>` : ""}<button class="primary wide" id="startGame" style="margin-top:15px">${getActor() ? esc(name(getActor())) + " · " : ""}훈련 시작</button><p id="gameStartError" class="error" role="alert"></p></div></section><aside><section class="panel"><h3>내 훈련 능력치</h3><div class="growth-mini">${ABILITIES.map((n, i) => `<span>${n}<b>${levels(myProfile())[i]}</b></span>`).join("")}</div><p class="game-note">미니게임에는 능력치 보너스를 적용하지 않습니다. 생존전의 성장 모드에서만 사용돼요.</p>${game === "survival" ? '<p class="hint">집중: 자동 공격 주기<br>기동: 이동 속도<br>방어: 최대 체력<br>감지: 위험 예고·회복 획득 범위<br>정화: 공격 범위·피해<br>협동: 주기적 지원 결계 유지 시간</p>' : ""}</section><section class="panel" style="margin-top:18px"><h3>보상 안내</h3><p class="hint">첫 5회 정상 보상 → 다음 5회 절반 → 이후 XP 0. 기록은 계속 도전할 수 있습니다.<br>집계는 능력별 · 한국 시간 자정 기준입니다.</p><a class="game-link" href="#rankings/${game}" style="display:block;margin-top:15px">이 게임 랭킹 보기 →</a></section></aside></div>`;
    wireReload();
    if ($("createRelay"))
      $("createRelay").onclick = async () => {
        if (!requireActor()) return;
        const expected = generation,
          button = $("createRelay");
        button.disabled = true;
        $("startGame").disabled = true;
        try {
          await api("training/relay", "POST", {});
          await load(true);
          if (expected !== generation || location.hash !== "#training/coop")
            return;
          renderLobby("coop");
          toast("공동 봉인 진행 상황을 확인했어요.");
        } catch (e) {
          if (expected !== generation || !button.isConnected) return;
          $("gameStartError").textContent = e.message;
          button.disabled = false;
          $("startGame").disabled = false;
        }
      };
    $("gameMode").onchange = $("gameControl").onchange = () => {
      preferences[game] = {
        mode: $("gameMode").value,
        control: $("gameControl").value,
      };
    };
    $("startGame").onclick = () =>
      start(game, $("gameMode").value, $("gameControl").value);
  }
  function renderRanks(initial) {
    ensure();
    if (initial && Object.hasOwn(GAMES, initial) && initial !== boardGame) {
      boardGame = initial;
      boardMode = GAMES[initial].modes[0][0];
    }
    const modes = GAMES[boardGame].modes.filter(([v]) => v !== "practice");
    if (!modes.some((m) => m[0] === boardMode)) boardMode = modes[0][0];
    const rows = rankRows(
      data,
      getState().members,
      boardGame,
      boardMode,
      boardControl,
      boardPeriod,
      data?.period?.week,
    );
    $("view").innerHTML =
      heading(
        "훈련 랭킹",
        "주간 기록과 역대 최고 기록을 게임·모드·조작 방식별로 비교해요.",
      ) +
      loadingHTML() +
      `<div class="ranking-toolbar"><label>게임<select id="rankGame">${Object.entries(
        GAMES,
      )
        .map(
          ([k, g]) =>
            `<option value="${k}" ${k === boardGame ? "selected" : ""}>${g.name}</option>`,
        )
        .join(
          "",
        )}</select></label><label>모드<select id="rankMode">${modes.map(([k, n]) => `<option value="${k}" ${k === boardMode ? "selected" : ""}>${n}</option>`).join("")}</select></label><label>조작<select id="rankControl"><option value="pc" ${boardControl === "pc" ? "selected" : ""}>PC</option><option value="touch" ${boardControl === "touch" ? "selected" : ""}>터치</option></select></label><label>기간<select id="rankPeriod"><option value="week" ${boardPeriod === "week" ? "selected" : ""}>이번 주</option><option value="all" ${boardPeriod === "all" ? "selected" : ""}>역대</option></select></label></div><section class="panel"><div class="split"><h2>${GAMES[boardGame].name}</h2><a class="game-link" href="#training/${boardGame}">도전하기</a></div><p class="hint">주간 집계: 월요일 00:00 · 한국 시간. 초기화되는 것은 주간 순위이며 경험치는 유지돼요.</p>${rows.map((r) => `<a class="ranking-row ${r.memberId === getActor() ? "mine" : ""}" href="#member/${encodeURIComponent(r.memberId)}"><span class="rank-medal">${r.rank}</span><div><h3>${esc(r.name)}</h3><small>${esc(timestamp(r.at))}</small></div><div class="record-score">${esc(r.detail)}</div></a>`).join("") || '<div class="ranking-empty">아직 이 조건의 기록이 없어요.<br>첫 번째 도전자가 되어 보세요.</div>'}</section>${boardGame === "focus" ? averageHTML() : ""}<p class="daily-note">공용 비밀번호와 선택 프로필을 사용하므로 실제 신원과 완벽한 부정행위 방지를 보장하지 않습니다. 자동화·기록 조작 없이 함께 즐겨 주세요.</p>`;
    wireReload();
    $("rankGame").onchange = (e) => {
      boardGame = e.target.value;
      boardMode = GAMES[boardGame].modes[0][0];
      history.replaceState(null, "", "#rankings");
      renderRanks();
    };
    $("rankMode").onchange = (e) => {
      boardMode = e.target.value;
      renderRanks();
    };
    $("rankControl").onchange = (e) => {
      boardControl = e.target.value;
      renderRanks();
    };
    $("rankPeriod").onchange = (e) => {
      boardPeriod = e.target.value;
      renderRanks();
    };
  }
  function averageHTML() {
    const rows = getState()
      .members.map((m) => {
        const logs =
          myProfile(m.id)
            ?.focus.filter(
              (x) => x.mode === boardMode && x.control === boardControl,
            )
            .slice(-5) || [];
        return logs.length === 5
          ? {
              id: m.id,
              name: m.name,
              error: logs.reduce((a, b) => a + b.error, 0) / 5,
            }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.error - b.error);
    return `<section class="panel" style="margin-top:20px"><h3>최근 5회 평균 정확도</h3><p class="hint">프로필별 최근 20회 타이밍 기록 중 같은 모드·조작 5회가 모이면 표시됩니다. 기간 필터와 별개의 최근 기록입니다.</p>${rows.map((r, i) => `<a class="ranking-row" href="#member/${encodeURIComponent(r.id)}"><span class="rank-medal">${i + 1}</span><h3>${esc(r.name)}</h3><span class="record-score">평균 오차 ${(r.error / 1000).toFixed(3)}초</span></a>`).join("") || '<p class="hint">동일 모드·조작으로 5회 도전해 보세요.</p>'}</section>`;
  }
  async function start(game, mode, control) {
    if (active() || !requireActor()) return;
    const tokenGeneration = ++generation;
    setPhase("starting");
    $("startGame").disabled = true;
    $("gameStartError").textContent = "서버에서 도전권을 준비 중…";
    try {
      const relay = data?.relays.find(
        (r) => !r.completedAt && r.expires > Date.now(),
      );
      const result = await api("training/start", "POST", {
        rules: RULES_VERSION,
        game,
        mode,
        control,
        memberId: getActor(),
        relayId: relay?.id,
      });
      if (generation !== tokenGeneration) return;
      current = result;
      events = [];
      pendingResult = null;
      lastInput = -1000;
      sim = ["agility", "survival"].includes(game)
        ? createSim(result.run)
        : null;
      target = { x: 240, y: 240 };
      keys.clear();
      mountGame();
      started = performance.now();
      setPhase("playing");
      animation = requestAnimationFrame(frame);
    } catch (error) {
      if (generation !== tokenGeneration) return;
      setPhase("idle");
      $("startGame").disabled = false;
      $("gameStartError").textContent = error.message;
      if (error.code === "SESSION_RENEW" || error.code === "SESSION_REQUIRED")
        H.needLogin();
    }
  }
  function mountGame() {
    const run = current.run,
      g = GAMES[run.game];
    let arena = "";
    if (run.game === "focus")
      arena =
        '<div class="focus-stage"><div class="focus-dial"><small>SEAL AT 7.770</small><span id="focusTimer">0.000</span></div><button id="gameAction" class="primary stop-button">STOP</button></div>';
    else if (run.game === "defense")
      arena =
        '<div class="defense-stage"><div class="guard-ring" id="guardRing">⬡</div><span class="attack-orb" id="attackOrb"></span></div><div class="guard-controls"><button id="gameAction" class="primary stop-button">결계 펼치기</button></div>';
    else if (run.game === "sense")
      arena = '<div id="puzzleGrid" class="puzzle-grid"></div>';
    else if (run.game === "purify" || run.game === "coop")
      arena =
        '<div id="memoryGrid" class="memory-grid">' +
        ["☾", "火", "木", "符"]
          .map(
            (x, i) =>
              `<button class="memory-rune" data-rune="${i}" aria-label="문양 ${i + 1} ${x}">${x}<small style="display:block;font-size:10px">${i + 1}</small></button>`,
          )
          .join("") +
        "</div>";
    else
      arena =
        '<canvas id="gameCanvas" class="game-canvas" width="480" height="480" tabindex="0" aria-label="이동 게임. 터치 또는 마우스 드래그, WASD 및 방향키로 이동"></canvas>';
    $("view").innerHTML =
      heading(
        g.name,
        `${name(run.memberId)} · ${run.control === "touch" ? "터치" : "PC"} · ${g.modes.find((m) => m[0] === run.mode)[1]}`,
      ) +
      `<section class="game-session"><div class="game-hud"><div><small>도전 시간</small><strong id="gameClock">0.00초</strong></div><div><small>${sim ? "체력 / 퇴치" : "진행"}</small><strong id="gameProgress">준비</strong></div><button id="abortGame">그만하기</button></div><div class="game-arena">${arena}<div class="game-message" id="gameMessage" aria-live="polite">${run.game === "focus" ? "정확히 7.77초에 STOP!" : "집중해서 도전해 보세요."}</div></div><div class="game-bottom"><span>${sim ? "드래그 또는 WASD·방향키 이동" : run.game === "focus" || run.game === "defense" ? "터치·클릭 또는 Space" : "문양 선택 · 순서 게임은 숫자 1~4 지원"}</span><span>다른 탭으로 이동하면 중단됩니다.</span></div></section>`;
    $("abortGame").onclick = () => {
      if (confirm("이번 도전을 중단할까요? 기록·경험치는 지급되지 않습니다.")) {
        const game = current.run.game;
        cancel();
        renderLobby(game);
      }
    };
    if ($("gameAction")) bindAction($("gameAction"), () => action());
    if ($("memoryGrid"))
      document
        .querySelectorAll("[data-rune]")
        .forEach((b) => bindAction(b, () => action(+b.dataset.rune)));
    if (run.game === "sense") drawPuzzle();
    if (sim) {
      const canvas = $("gameCanvas");
      canvas.onpointerdown = (e) => {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        point(e);
      };
      canvas.onpointermove = (e) => {
        if (e.buttons || e.pointerType === "touch") point(e);
      };
      canvas.onpointerup = (e) => {
        if (canvas.hasPointerCapture(e.pointerId))
          canvas.releasePointerCapture(e.pointerId);
      };
      canvas.focus();
    }
  }
  function bindAction(button, fn) {
    button.onpointerdown = (e) => {
      e.preventDefault();
      fn();
    };
    button.onclick = (e) => {
      if (e.detail === 0) fn();
    };
  }
  function point(e) {
    const rect = $("gameCanvas").getBoundingClientRect();
    target = {
      x: Math.round(
        Math.max(
          0,
          Math.min(480, ((e.clientX - rect.left) / rect.width) * 480),
        ),
      ),
      y: Math.round(
        Math.max(
          0,
          Math.min(480, ((e.clientY - rect.top) / rect.height) * 480),
        ),
      ),
    };
  }
  function elapsed() {
    return Math.max(1, Math.round(performance.now() - started));
  }
  function senseState() {
    let round = 0,
      wrong = 0;
    for (const e of events) {
      if (e.index === puzzle(current.run.seed, round).target) round++;
      else wrong++;
    }
    return { round, wrong };
  }
  function drawPuzzle() {
    if (!$("puzzleGrid")) return;
    const { round } = senseState();
    if (round >= 20) return;
    const p = puzzle(current.run.seed, round),
      symbols = [
        ["符", "祓"],
        ["☾", "☽"],
        ["◇", "◆"],
        ["木", "本"],
      ][p.symbol];
    $("puzzleGrid").style.gridTemplateColumns =
      `repeat(${p.size <= 8 ? 3 : 4},1fr)`;
    $("puzzleGrid").innerHTML = Array.from(
      { length: p.size },
      (_, i) =>
        `<button class="rune-button" data-puzzle="${i}" aria-label="문양 ${i + 1}">${symbols[i === p.target ? 1 : 0]}</button>`,
    ).join("");
    document
      .querySelectorAll("[data-puzzle]")
      .forEach((b) => bindAction(b, () => action(+b.dataset.puzzle)));
  }
  function action(index) {
    if (phase !== "playing") return;
    const run = current.run,
      t = Math.min(elapsed(), GAMES[run.game].limit);
    if (run.game === "focus") {
      events.push({ t });
      finish(t);
      return;
    }
    if (run.game === "defense") {
      if (t - lastInput < 80 || events.length >= 80) return;
      lastInput = t;
      events.push({ t });
      const ring = $("guardRing");
      ring.classList.remove("guard-flash");
      void ring.offsetWidth;
      ring.classList.add("guard-flash");
      const nearest = Math.min(
        ...attackTimes(run.seed).map((x) => Math.abs(x - t)),
      );
      $("gameMessage").textContent =
        nearest <= 90
          ? "완벽 방어!"
          : nearest <= 220
            ? "방어 성공"
            : "타이밍을 살펴보세요.";
      return;
    }
    if (run.game === "sense") {
      if (t - lastInput < 160 || t >= 45000) return;
      lastInput = t;
      const { round } = senseState(),
        correct = index === puzzle(run.seed, round).target;
      events.push({ t, index });
      if (correct) {
        if (senseState().round === 20) finish(t);
        else drawPuzzle();
      } else {
        const b = $("puzzleGrid").querySelector(`[data-puzzle="${index}"]`);
        b?.classList.add("wrong");
        setTimeout(() => b?.classList.remove("wrong"), 150);
      }
      return;
    }
    if (run.game === "purify" || run.game === "coop") {
      const info = memoryInfo(run, events);
      if (t < info.watchUntil || t - lastInput < 80) return;
      lastInput = t;
      events.push({ t, index });
      const next = memoryInfo(run, events);
      if (next.failed || next.complete) finish(t);
    }
  }
  function message(text) {
    if ($("gameMessage") && $("gameMessage").textContent !== text)
      $("gameMessage").textContent = text;
  }
  function frame() {
    if (phase !== "playing") return;
    const run = current.run,
      t = elapsed();
    $("gameClock").textContent =
      (Math.min(t, GAMES[run.game].limit) / 1000).toFixed(2) + "초";
    if (run.game === "focus") {
      $("focusTimer").textContent =
        run.mode === "hidden" && t >= 3000 ? "?.???" : (t / 1000).toFixed(3);
      $("gameProgress").textContent = "목표 7.77";
      if (t >= 20000) {
        events.push({ t: 20000 });
        finish(20000);
        return;
      }
    } else if (run.game === "defense") {
      const attacks = attackTimes(run.seed),
        next = attacks.find((v) => v >= t),
        passed = attacks.filter((v) => v < t).length;
      $("gameProgress").textContent = Math.min(20, passed + 1) + "/20";
      const orb = $("attackOrb");
      if (next && next - t < 900) {
        orb.hidden = false;
        const distance = Math.max(0, (next - t) / 900) * 115;
        orb.style.transform = `translate(-50%,calc(-50% - ${distance}px))`;
      } else orb.hidden = true;
      if (t >= attacks.at(-1) + 400) {
        finish(attacks.at(-1) + 400);
        return;
      }
    } else if (run.game === "sense") {
      const s = senseState();
      $("gameProgress").textContent = s.round + "/20 · 오답 " + s.wrong;
      if (t >= 45000) {
        finish(45000);
        return;
      }
    } else if (run.game === "purify" || run.game === "coop") {
      const info = memoryInfo(run, events),
        watch = t < info.watchUntil,
        flashIndex = Math.floor((t - info.roundStart) / 500),
        lit =
          watch &&
          t >= info.roundStart &&
          flashIndex < info.length &&
          (t - info.roundStart) % 500 < 350
            ? info.seq[flashIndex]
            : -1;
      document.querySelectorAll("[data-rune]").forEach((b) => {
        b.classList.toggle("lit", +b.dataset.rune === lit);
        b.disabled = watch;
      });
      $("gameProgress").textContent =
        run.game === "coop"
          ? "공동 봉인 " + (run.stage + 1) + "/3"
          : info.cleared + "/8단계";
      message(
        watch
          ? "순서를 기억하세요. 아직 누르지 마세요."
          : `${info.length}개 문양을 같은 순서로 입력하세요. (${info.index}/${info.length})`,
      );
      if (t >= GAMES[run.game].limit) {
        finish(GAMES[run.game].limit);
        return;
      }
    } else {
      const steps = Math.floor(t / STEP);
      while (!sim.ended && sim.t / STEP < steps) {
        if (keys.size) {
          const dx =
              Number(keys.has("arrowright") || keys.has("d")) -
              Number(keys.has("arrowleft") || keys.has("a")),
            dy =
              Number(keys.has("arrowdown") || keys.has("s")) -
              Number(keys.has("arrowup") || keys.has("w"));
          target = {
            x: Math.round(Math.max(0, Math.min(480, sim.p.x + dx * 80))),
            y: Math.round(Math.max(0, Math.min(480, sim.p.y + dy * 80))),
          };
        }
        if (sim.t % 100 === 0) {
          const last = events.at(-1);
          if (!last || last.x !== target.x || last.y !== target.y)
            events.push({ t: sim.t, x: target.x, y: target.y });
        }
        const input = events.at(-1) || { x: 240, y: 240 };
        stepSim(sim, input);
      }
      drawSim();
      $("gameProgress").textContent =
        "♥ " +
        sim.p.hp +
        (run.game === "survival" ? " · " + sim.kills + "퇴치" : "");
      message(
        sim.t < 2500
          ? "곧 적이 나타납니다. 이동해서 피하세요."
          : run.game === "survival"
            ? "자동 공격 중 · 초록 부적으로 체력을 회복하세요."
            : "점선 예고 뒤의 도깨비불을 피하세요.",
      );
      if (sim.ended) {
        finish(sim.t);
        return;
      }
    }
    animation = requestAnimationFrame(frame);
  }
  function drawSim() {
    const canvas = $("gameCanvas"),
      ctx = canvas.getContext("2d"),
      s = sim;
    ctx.clearRect(0, 0, WORLD, WORLD);
    ctx.strokeStyle = "#334d3866";
    ctx.lineWidth = 1;
    for (let i = 0; i < 480; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 480);
      ctx.moveTo(0, i);
      ctx.lineTo(480, i);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(240, 240);
    ctx.strokeStyle = "#58774855";
    ctx.beginPath();
    ctx.arc(0, 0, 185, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "140px serif";
    ctx.fillStyle = "#748e5110";
    ctx.textAlign = "center";
    ctx.fillText("符", 0, 50);
    ctx.restore();
    for (const i of s.pickups) {
      ctx.fillStyle = "#a9e395";
      ctx.fillRect(i.x - 5, i.y - 5, 10, 10);
      ctx.fillStyle = "#173624";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("+", i.x, i.y + 4);
    }
    for (const e of s.enemies) {
      const warning = s.t < e.born + e.warning;
      ctx.beginPath();
      ctx.setLineDash(warning ? [4, 4] : []);
      ctx.strokeStyle = warning ? "#d3c18e" : "#b88ab8";
      ctx.fillStyle = warning
        ? "#ab9b5422"
        : s.game === "agility"
          ? "#8bcad8"
          : "#ab8dbd";
      const x = Math.max(12, Math.min(468, e.x)),
        y = Math.max(12, Math.min(468, e.y));
      ctx.arc(x, y, warning ? 15 : e.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      if (!warning && s.game === "survival") {
        ctx.fillStyle = "#182020";
        ctx.fillRect(x - 5, y - 3, 3, 4);
        ctx.fillRect(x + 2, y - 3, 3, 4);
      }
    }
    const p = s.p;
    ctx.beginPath();
    ctx.fillStyle = p.inv > s.t ? "#dcecb2" : "#b8dfb3";
    ctx.shadowColor = "#b8dfb3";
    ctx.shadowBlur = 12;
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#29482b";
    ctx.font = "12px serif";
    ctx.textAlign = "center";
    ctx.fillText("符", p.x, p.y + 4);
    if (p.inv > s.t) {
      ctx.strokeStyle = "#ccdc9e";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 19, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const a of s.sparks) {
      ctx.strokeStyle = a.kind === "hurt" ? "#efb39f" : "#d7e4a6";
      ctx.globalAlpha = 1 - (s.t - a.t) / 400;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 10 + (s.t - a.t) / 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  async function finish(duration) {
    if (phase !== "playing") return;
    cancelAnimationFrame(animation);
    pendingResult = { token: current.token, duration, actions: events };
    setPhase("saving");
    $("view").innerHTML =
      heading("도전 완료", "서버에서 입력 기록을 확인하고 보상을 계산합니다.") +
      '<section class="panel"><h2>기록 저장 중…</h2><p class="hint">창을 닫지 말아 주세요. 같은 결과를 여러 번 제출해도 경험치는 한 번만 지급됩니다.</p></section>';
    await submit();
  }
  async function submit() {
    if (!pendingResult || !current) return;
    const expected = generation;
    setPhase("saving");
    try {
      const result = await api("training/finish", "POST", pendingResult);
      if (expected !== generation) return;
      setPhase("done");
      pendingResult = null;
      lastResult = result;
      if (result.overview) {
        cacheGeneration++;
        loading = null;
        data = result.overview;
        loadAt = Date.now();
        loadError = "";
      } else await load(true);
      if (expected !== generation) return;
      renderResult(result);
    } catch (error) {
      if (expected !== generation) return;
      setPhase("unsaved");
      const retryable = ![
        "RUN_INVALID",
        "RUN_RESULT",
        "MEMBER_REMOVED",
        "RELAY_CHANGED",
        "SESSION_REQUIRED",
      ].includes(error.code);
      $("view").innerHTML =
        heading(
          "결과 저장을 확인해 주세요",
          "입력 기록은 이 화면에 보관 중입니다.",
        ) +
        `<section class="game-result"><h2>저장되지 않은 도전</h2><p class="finish-warning">${esc(error.message)}</p><p class="hint">${retryable ? "같은 결과로 다시 저장하세요. 새로고침하면 이 도전의 입력 기록이 사라집니다." : "이 도전은 다시 저장할 수 없습니다. 새 도전을 시작해 주세요."}</p><div class="result-actions">${retryable ? '<button id="retryGameSave" class="primary">같은 결과로 다시 저장</button>' : ""}<button id="discardGame">도전 종료</button></div></section>`;
      if ($("retryGameSave")) $("retryGameSave").onclick = () => submit();
      $("discardGame").onclick = () => {
        const game = current.run.game;
        cancel(false);
        renderLobby(game);
      };
    }
  }
  function renderResult(result) {
    const game = current.run.game,
      run = current.run,
      rank = personalRank(run.memberId, game, run.mode, run.control);
    $("view").innerHTML =
      heading("훈련 결과", GAMES[game].name) +
      `<section class="game-result"><p class="eyebrow">RECORD VERIFIED · TRAINING GROUNDS</p><h2>${result.replayed ? "이미 저장된 도전입니다" : "도전 기록을 저장했어요"}</h2><div class="result-value">${esc(result.result.detail)}</div><p class="muted">${rank ? "이 모드 · 조작의 내 역대 랭크 " + rank.rank + "위" : "완료한 훈련 기록이 반영되었습니다."}</p><div class="reward-list">${result.awards.map((a) => `<div class="reward-chip"><strong>${ABILITIES[a.ability]} +${a.xp} XP</strong><small>${esc(name(a.memberId))}${a.after > a.before ? " · LEVEL UP " + a.before + " → " + a.after : " · Lv." + a.after}</small></div>`).join("") || '<p class="hint">이번 도전 경험치 +0 XP</p>'}</div><p class="game-note">${esc(result.note)}</p>${result.personalBest ? `<div class="daily-note"><strong>${result.personalBest.first ? "첫 기록을 만들었어요!" : "개인 최고 기록 경신!"}</strong>${result.personalBest.previous ? "<br>이전 최고: " + esc(result.personalBest.previous) : ""}</div>` : ""}${result.awards.some((a) => a.xp === 0) ? '<p class="hint">오늘의 보상 횟수 또는 최대 레벨에 도달했습니다. 기록 도전은 계속할 수 있어요.</p>' : ""}<div class="result-actions"><button id="againGame" class="primary">다시 도전</button><a href="#rankings/${game}">랭킹 확인</a><a href="#dashboard">대시보드</a></div></section>`;
    $("againGame").onclick = () => {
      setPhase("idle");
      renderLobby(game);
    };
  }
  document.addEventListener("keydown", (e) => {
    if (phase !== "playing" || e.repeat) return;
    const key = e.key.toLowerCase(),
      game = current.run.game;
    if (
      sim &&
      [
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
      ].includes(key)
    ) {
      e.preventDefault();
      keys.add(key);
    } else if (e.code === "Space" && ["focus", "defense"].includes(game)) {
      e.preventDefault();
      action();
    } else if (
      ["purify", "coop"].includes(game) &&
      ["1", "2", "3", "4"].includes(key)
    ) {
      e.preventDefault();
      action(+key - 1);
    }
  });
  document.addEventListener("keyup", (e) => {
    keys.delete(e.key.toLowerCase());
    if (sim && !keys.size)
      target = { x: Math.round(sim.p.x), y: Math.round(sim.p.y) };
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && phase === "playing") {
      const game = current.run.game;
      cancel(false);
      renderLobby(game);
      toast(
        "화면이 숨겨져 도전이 중단됐어요. 기록과 경험치는 지급되지 않았습니다.",
        true,
      );
    }
  });
  return {
    load,
    renderDashboard,
    renderTraining,
    renderRanks,
    profilePanel,
    isActive: active,
    cancel,
    reset,
    wireReload,
  };
}
