import {
  GAMES,
  randomInt,
  shuffle,
  lines,
  validatePreset,
  ladder,
  traceLadder,
  teams,
} from "./party-rules.mjs";
export function createLuckUI({ esc, toast, getState, savePreset, isBlocked }) {
  const $ = (id) => document.getElementById(id);
  let config = {
    title: "오늘의 복불복",
    game: "wheel",
    entries: ["간식 고르기", "노래 한 소절", "통과", "응원 한마디"],
    outcomes: ["당첨", "통과", "통과", "통과"],
    teams: 2,
    dice: 2,
    min: 8,
    max: 25,
  };
  let running = false,
    timer,
    frame,
    outcome = null,
    rotation = 0,
    pack = null,
    revealed = new Set(),
    bomb = null,
    dirty = false;
  function cancel() {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    timer = null;
    frame = null;
    running = false;
    bomb = null;
    pack = null;
    outcome = null;
    revealed.clear();
    dirty = false;
  }
  function reset() {
    cancel();
    dirty = false;
    config = {
      title: "오늘의 복불복",
      game: "wheel",
      entries: ["간식 고르기", "노래 한 소절", "통과", "응원 한마디"],
      outcomes: ["당첨", "통과", "통과", "통과"],
      teams: 2,
      dice: 2,
      min: 8,
      max: 25,
    };
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && bomb) {
      cancel();
      toast("화면을 벗어나 폭탄 게임을 취소했어요.");
      if ($("luckPanel")) render();
    }
  });
  function setConfig(c) {
    cancel();
    config = validatePreset(c);
    dirty = false;
    render();
  }
  const b = (id, label, cls = "") =>
    `<button type="button" id="${id}" class="${cls}">${label}</button>`;
  function read() {
    const game = config.game;
    return validatePreset({
      title: $("luckTitle").value,
      game,
      entries: lines($("luckEntries").value, game === "ladder" ? 12 : 64),
      outcomes: game === "ladder" ? lines($("luckOutcomes").value, 12) : [],
      teams: Number($("luckTeams")?.value || 2),
      dice: Number($("luckDice")?.value || 2),
      min: Number($("luckMin")?.value || 8),
      max: Number($("luckMax")?.value || 25),
    });
  }
  function render() {
    const host = $("luckPanel");
    if (!host) return;
    host.innerHTML = `<div class="party-game-menu">${Object.entries(GAMES)
      .map(
        ([k, [icon, name]]) =>
          `<button data-game="${k}" aria-pressed="${k === config.game}"><span>${icon}</span>${name}</button>`,
      )
      .join(
        "",
      )}</div><div class="party-luck-grid"><section class="panel"><p class="eyebrow">MAKE YOUR OWN RULES</p><h2>${GAMES[config.game][0]} ${GAMES[config.game][1]}</h2><p class="hint">${GAMES[config.game][2]}</p><fieldset id="luckFields"><label>설정 이름<input id="luckTitle" maxlength="80" value="${esc(config.title)}"></label><label>${config.game === "coin" ? "앞면 / 뒷면 문구 · 두 줄" : config.game === "dice" ? "메모 문구 · 주사위 눈에는 영향 없음" : "참가자 또는 선택 문구 · 한 줄에 하나"}<textarea id="luckEntries" rows="7" maxlength="5000">${esc(config.entries.join("\n"))}</textarea></label>${config.game === "ladder" ? `<label>도착점 결과 · 참가자와 같은 줄 수<textarea id="luckOutcomes" rows="6" maxlength="1000">${esc(config.outcomes.join("\n"))}</textarea></label>` : ""}${config.game === "teams" ? `<label>팀 수<input id="luckTeams" type="number" min="2" max="16" value="${config.teams}"></label>` : ""}${config.game === "dice" ? `<label>주사위 개수<input id="luckDice" type="number" min="1" max="6" value="${config.dice}"></label>` : ""}${config.game === "bomb" ? `<div class="party-two"><label>최소 시간 · 초<input id="luckMin" type="number" min="5" max="60" value="${config.min}"></label><label>최대 시간 · 초<input id="luckMax" type="number" min="5" max="60" value="${config.max}"></label></div><p class="hint">정확한 종료 시각은 숨깁니다. 한 기기에서 차례로 넘겨 주세요. 탭을 벗어나면 취소됩니다.</p>` : ""}<div class="head-actions">${b("luckMembers", "팀원 이름 넣기")}${b("luckSave", "이 설정 공유 저장")}</div></fieldset><p class="hint">중복 문구도 각각 별도 칸입니다. 사다리는 12명, 나머지 목록은 64개까지. 실제 돈·위험한 벌칙 대신 가벼운 재미로 즐겨 주세요.</p></section><section class="panel party-stage"><p class="eyebrow">FORTUNE, NOT FATE</p><div id="luckVisual"></div><div id="luckResult" class="party-result" aria-live="polite"></div><div class="head-actions">${b("luckStart", "새로 뽑기 ✦", "primary")}${b("luckCancel", "초기화")}${b("luckCopy", "결과 복사")}</div><p class="hint">브라우저의 암호학적 난수 사용 · 결과는 이 기기에서만 진행됩니다. 새로 뽑으면 이전 결과를 대체합니다.</p></section></div>`;
    host.querySelectorAll("[data-game]").forEach(
      (el) =>
        (el.onclick = () => {
          if (isBlocked()) return;
          if (running && !confirm("진행 중인 게임을 취소하고 바꿀까요?"))
            return;
          try {
            config = read();
          } catch {
            /* Preserve last valid config on switching. */
          }
          cancel();
          config.game = el.dataset.game;
          if (config.game === "coin")
            config.entries = ["앞면 · 내가 고르기", "뒷면 · 친구가 고르기"];
          if (config.game === "ladder") {
            config.entries = config.entries.slice(0, 12);
            config.outcomes = config.entries.map((_, i) =>
              i ? "통과" : "당첨",
            );
          }
          render();
        }),
    );
    $("luckFields").oninput = () => {
      dirty = true;
      outcome = null;
      if ($("luckResult"))
        $("luckResult").textContent =
          "설정을 바꿨어요. 새로 뽑으면 적용됩니다.";
    };
    $("luckMembers").onclick = () => {
      if (isBlocked()) return;
      const a = getState()
        .members.slice(0, config.game === "ladder" ? 12 : 64)
        .map((m) => m.name);
      if (a.length < 2) return toast("팀원이 두 명 이상 필요해요.", true);
      $("luckEntries").value = a.join("\n");
      if ($("luckOutcomes"))
        $("luckOutcomes").value = a
          .map((_, i) => (i ? "통과" : "당첨"))
          .join("\n");
      dirty = true;
    };
    $("luckSave").onclick = async () => {
      try {
        config = read();
        await savePreset(config);
        dirty = false;
      } catch (e) {
        toast(e.message, true);
      }
    };
    $("luckStart").onclick = () => {
      if (isBlocked()) return;
      try {
        const c = read();
        cancel();
        config = c;
        dirty = false;
        start();
      } catch (e) {
        toast(e.message, true);
      }
    };
    $("luckCancel").onclick = () => {
      if (isBlocked()) return;
      cancel();
      visual();
      $("luckResult").textContent =
        "초기화했어요. 문구를 바꾸고 다시 시작할 수 있어요.";
      lock(false);
    };
    $("luckCopy").onclick = async () => {
      if (!outcome) return toast("공개된 결과가 아직 없어요.");
      try {
        await navigator.clipboard.writeText(config.title + "\n" + outcome);
        toast("결과를 복사했어요.");
      } catch {
        toast(
          "복사 권한이 없어요. 화면의 결과 문구를 선택해 복사하세요.",
          true,
        );
      }
    };
    visual();
    lock(running);
  }
  function lock(on) {
    running = on;
    if ($("luckFields")) $("luckFields").disabled = on;
    if ($("luckStart")) $("luckStart").disabled = on;
    document.querySelectorAll("[data-game]").forEach((x) => (x.disabled = on));
  }
  function finish(text) {
    outcome = text;
    $("luckResult").textContent = text;
    lock(false);
  }
  function visual() {
    const host = $("luckVisual");
    if (!host) return;
    if (config.game === "wheel") {
      const n = config.entries.length,
        colors = [
          "#598475",
          "#bba370",
          "#7d899e",
          "#9e7684",
          "#71998a",
          "#958567",
        ];
      const point = (a) => [150 + 132 * Math.cos(a), 150 + 132 * Math.sin(a)];
      host.innerHTML = `<div class="party-wheel-wrap"><span class="party-pointer" aria-hidden="true">▼</span><svg id="partyWheel" viewBox="0 0 300 300" role="img" aria-label="${n}칸 룰렛">${config.entries
        .map((_, i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / n,
            z = a + (2 * Math.PI) / n,
            p = point(a),
            q = point(z),
            mid = a + Math.PI / n;
          return `<path d="M150 150 L${p} A132 132 0 ${n === 2 ? 0 : (2 * Math.PI) / n > Math.PI ? 1 : 0} 1 ${q} Z" fill="${colors[i % colors.length]}" stroke="#162820"/><text x="${150 + 106 * Math.cos(mid)}" y="${154 + 106 * Math.sin(mid)}" text-anchor="middle" fill="#fff" font-size="${n > 32 ? 7 : 11}">${i + 1}</text>`;
        })
        .join(
          "",
        )}<circle cx="150" cy="150" r="34" fill="#15271f"/><text x="150" y="159" text-anchor="middle" font-size="28" fill="#e9d79f">✦</text></svg></div><details><summary>룰렛 칸과 문구 · 모두 1/${n} 확률</summary><ol class="party-wheel-legend">${config.entries.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></details>`;
      rotation = 0;
    } else
      host.innerHTML = `<div class="party-game-symbol" aria-hidden="true">${GAMES[config.game][0]}</div><p class="hint">문구를 정하고 ‘새로 뽑기’를 눌러 주세요.</p>`;
  }
  function start() {
    visual();
    $("luckResult").textContent = "";
    const e = config.entries,
      g = config.game,
      reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (g === "wheel") {
      lock(true);
      const i = randomInt(e.length);
      rotation = 1800 + 360 - ((i + 0.5) * 360) / e.length;
      requestAnimationFrame(() => {
        if (!$("partyWheel")) return;
        $("partyWheel").style.transition =
          `transform ${reduce ? 0 : 2.6}s cubic-bezier(.15,.7,.1,1)`;
        $("partyWheel").style.transform = `rotate(${rotation}deg)`;
      });
      timer = setTimeout(
        () => {
          if ($("luckResult")) finish(`${i + 1}번 · ${e[i]}`);
        },
        reduce ? 30 : 2650,
      );
    } else if (g === "ladder") {
      pack = ladder(e.length);
      const step = 30,
        w = Math.max(320, e.length * 76),
        h = (pack.rungs.length + 1) * step + 24,
        gap = w / e.length;
      $("luckVisual").innerHTML =
        `<p class="hint">출발 번호를 누르면 실제 사다리 경로가 표시됩니다. 가로로 밀어 볼 수 있어요.</p><div class="party-ladder-scroll"><div style="min-width:${w}px"><div class="party-ladder-labels" style="grid-template-columns:repeat(${e.length},1fr)">${e.map((x, i) => `<button data-trace="${i}">${i + 1}. ${esc(x)}</button>`).join("")}</div><svg id="partyLadder" viewBox="0 0 ${w} ${h}" role="img" aria-label="참가자와 도착점을 연결하는 사다리">${e.map((_, i) => `<path d="M${(i + 0.5) * gap} 12 V${h - 12}" stroke="#557264" fill="none"/>`).join("")}${pack.rungs.map((x, i) => `<path d="M${(x + 0.5) * gap} ${(i + 1) * step + 12} h${gap}" stroke="#557264" fill="none"/>`).join("")}<path id="ladderTrace" fill="none" stroke="#f2cf80" stroke-width="5" stroke-linejoin="round"/></svg><div class="party-ladder-labels" style="grid-template-columns:repeat(${e.length},1fr)">${config.outcomes.map((x, i) => `<span>${i + 1}. ${esc(x)}</span>`).join("")}</div></div></div><button id="ladderAll">전체 결과 공개</button>`;
      document.querySelectorAll("[data-trace]").forEach(
        (b) =>
          (b.onclick = () => {
            const i = +b.dataset.trace,
              p = traceLadder(e.length, pack.rungs, i);
            $("ladderTrace").setAttribute(
              "d",
              p
                .map(
                  ([x, y], j) =>
                    `${j ? "L" : "M"}${(x + 0.5) * gap} ${y * step + 12}`,
                )
                .join(" "),
            );
            finish(`${i + 1}. ${e[i]} → ${config.outcomes[pack.results[i]]}`);
          }),
      );
      $("ladderAll").onclick = () =>
        finish(
          e
            .map(
              (x, i) => `${i + 1}. ${x} → ${config.outcomes[pack.results[i]]}`,
            )
            .join("\n"),
        );
    } else if (g === "draw") {
      pack = shuffle(e);
      lock(true);
      $("luckVisual").innerHTML =
        `<div class="party-envelopes">${e.map((_, i) => `<button data-envelope="${i}" aria-label="${i + 1}번 봉투 열기"><span>✉️</span><small>${i + 1}</small></button>`).join("")}</div><button id="drawAll">모두 열기</button>`;
      const reveal = (i) => {
        revealed.add(i);
        const b = document.querySelector(`[data-envelope="${i}"]`);
        b.textContent = pack[i];
        b.disabled = true;
        outcome = [...revealed]
          .map((j) => `${j + 1}번 봉투 · ${pack[j]}`)
          .join("\n");
        $("luckResult").textContent = outcome;
        if (revealed.size === e.length) lock(false);
      };
      document
        .querySelectorAll("[data-envelope]")
        .forEach((b) => (b.onclick = () => reveal(+b.dataset.envelope)));
      $("drawAll").onclick = () => e.forEach((_, i) => reveal(i));
    } else if (g === "teams")
      finish(
        teams(e, config.teams)
          .map(
            (t, i) =>
              `${i + 1}팀 · ${t.map((x) => `${x.name} (${x.index + 1}번)`).join(", ")}`,
          )
          .join("\n"),
      );
    else if (g === "order")
      finish(
        shuffle(e.map((name, index) => ({ name, index })))
          .map((x, i) => `${i + 1}순서 · ${x.name} (입력 ${x.index + 1}번)`)
          .join("\n"),
      );
    else if (g === "dice") {
      const values = Array.from(
        { length: config.dice },
        () => randomInt(6) + 1,
      );
      $("luckVisual").innerHTML =
        `<div class="party-dice">${values.map((v) => `<span aria-label="${v}">${["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][v - 1]}</span>`).join("")}</div>`;
      finish(values.join(" + ") + " = " + values.reduce((a, b) => a + b, 0));
    } else if (g === "coin") {
      const i = randomInt(2);
      $("luckVisual").innerHTML =
        `<div class="party-coin">${i ? "☾" : "☀"}</div>`;
      finish(`${i ? "뒷면" : "앞면"} · ${e[i]}`);
    } else if (g === "bomb") {
      lock(true);
      bomb = {
        end:
          performance.now() +
          (config.min + randomInt(config.max - config.min + 1)) * 1000,
        index: 0,
      };
      $("luckVisual").innerHTML =
        `<div class="party-game-symbol party-pulse">💣</div><p id="bombHolder" class="party-holder"></p><button id="bombPass" class="primary party-pass">다음 사람에게 넘기기 →</button><p class="hint">남은 시간은 비밀! 화면에서 손을 떼고 안전하게 전달하세요.</p>`;
      const label = () => {
        $("bombHolder").textContent =
          `${(bomb.index % e.length) + 1}번 · ${e[bomb.index % e.length]}`;
      };
      label();
      const done = () => {
        const name = e[bomb.index % e.length];
        bomb = null;
        finish("💥 이번 주인공은 " + name + "!");
        $("bombPass").disabled = true;
      };
      $("bombPass").onclick = () => {
        if (!bomb) return;
        if (performance.now() >= bomb.end) {
          done();
          return;
        }
        bomb.index++;
        label();
      };
      const tick = () => {
        if (!bomb || !$("bombPass")) return;
        if (performance.now() >= bomb.end) {
          done();
          return;
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
  }
  return {
    render,
    setConfig,
    cancel,
    reset,
    isActive: () => running,
    isDirty: () => dirty || running,
    getConfig: () => structuredClone(config),
  };
}
