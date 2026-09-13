// Authored, finite adventures. Public presentation is not a secrecy/anti-cheat boundary.
export const ADVENTURE_VERSION = 1;
export const GEAR = [
  ["lantern", "🏮", "기억 등불", "흔적을 더 쉽게 읽는 조사 힌트"],
  ["mirror", "🪞", "손거울", "두 조사 지점을 잇는 거울 통로 · 해석 힌트"],
  ["bell", "🔔", "작은 종", "말 없는 존재의 증언 힌트"],
  [
    "thread",
    "🧵",
    "붉은 실",
    "해결한 역에서 다음 역으로 바로 연결 · 순서 힌트",
  ],
  ["letter", "✉️", "빈 편지", "인물의 미련을 이해하는 힌트"],
  [
    "compass",
    "🧭",
    "귀환 나침반",
    "조사 지점에서 출발 거점으로 바로 귀환 · 방향 힌트",
  ],
];
const puzzle = (id, title, prompt, options, hints) => ({
  id,
  title,
  prompt,
  options,
  hints,
});
export const CASES = {
  train: {
    id: "train",
    type: "train",
    title: "지도에 없는 심야 열차",
    subtitle: "마지막 승객의 귀환",
    icon: "🚂",
    minutes: "세 역의 연결 사건 · 중간 저장 가능",
    color: "#d7bf83",
    intro:
      "새벽 0시 13분, 서랍에서 사용한 적 없는 승차권이 나왔다. 목적지는 공란. 종이 여우 모루는 말한다. “이 열차는 죽은 사람보다, 돌아오는 길을 잊은 사람을 태워요.” 세 역에 흩어진 귀환 신호를 복원하자.",
    artifact: "귀환의 승차권",
    stages: [
      {
        name: "비가 멈춘 항구역",
        scene: "harbor",
        left: "침묵의 등대",
        right: "표류물 보관소",
        clues: [
          [
            "빛의 기록",
            "등대 일지: 먼 바다에 먼저 별 하나를 띄웠다. 그 빛을 본 배가 돌아왔고, 마지막에 부두의 종을 울렸다.",
            "lantern",
          ],
          [
            "마지막 항해",
            "젖은 지도에는 배가 별빛을 따라 항구로 향한다. 종은 출항이 아니라 도착을 알리는 표식이다.",
            "compass",
          ],
        ],
        puzzle: puzzle(
          "harbor",
          "귀항 신호 복원",
          "항구의 세 신호를 시간 순서로 연결하세요.",
          [
            ["star-ship-bell", "별 → 배 → 종"],
            ["bell-star-ship", "종 → 별 → 배"],
            ["ship-bell-star", "배 → 종 → 별"],
          ],
          [
            "신호의 크기가 아니라 일어난 순서를 보세요.",
            "등대가 먼저 길을 보여 주고, 배가 도착한 뒤 종이 울립니다.",
          ],
        ),
      },
      {
        name: "뒤집힌 유리 정원역",
        scene: "garden",
        left: "거울 온실",
        right: "시든 꽃의 우편함",
        clues: [
          [
            "유리의 방향",
            "거울 앞의 안내판은 “동쪽 문”이라고 적혀 있지만, 실제 손잡이는 안내판의 서쪽에 있다. 반사는 좌우를 바꾼다.",
            "mirror",
          ],
          [
            "정원사의 부탁",
            "편지: 해가 지는 쪽의 문으로 나를 데려다 줘. 꽃은 뿌리를 뽑지 말고 문 앞에 놓아 줘.",
            "letter",
          ],
        ],
        puzzle: puzzle(
          "garden",
          "살아 있는 문",
          "정원사가 돌아갈 실제 문과 꽃의 위치를 고르세요.",
          [
            ["east-root", "동쪽 문 · 꽃을 뽑아 가져간다"],
            ["west-flower", "서쪽 문 · 꽃을 문 앞에 놓는다"],
            ["west-root", "서쪽 문 · 꽃을 뽑아 가져간다"],
          ],
          [
            "거울 속 글자보다 실제 방향과 편지의 부탁이 중요합니다.",
            "해가 지는 서쪽, 그리고 뿌리를 보존한 꽃입니다.",
          ],
        ),
      },
      {
        name: "잠든 종탑 종착역",
        scene: "tower",
        left: "기억의 시계실",
        right: "이름 없는 승객석",
        clues: [
          [
            "멈춘 시계",
            "시계실에는 세 장의 초상과 세 자리가 있다. 첫 자리는 떠난 사람, 둘째 자리는 기다린 사람, 셋째 자리는 돌아온 사람을 위한 자리다.",
            "thread",
          ],
          [
            "빈 승차권",
            "승객의 표에는 이름 대신 “다시 만나자는 약속”이 적혀 있다. 그는 사람의 모습으로 남은 약속이었다. 자리는 빼앗는 것이 아니라 내어 주는 것.",
            "bell",
          ],
        ],
        puzzle: puzzle(
          "tower",
          "마지막 승객의 자리",
          "승객은 무엇이며, 어느 자리에 앉아야 할까요?",
          [
            ["ghost-first", "침입한 원혼 · 첫 자리"],
            ["promise-third", "돌아온 약속 · 셋째 자리"],
            ["clock-second", "시계의 그림자 · 둘째 자리"],
          ],
          [
            "빈 표에 적힌 것은 이름이 아니라 존재의 정체입니다.",
            "돌아온 약속에게는 세 번째 자리가 준비되어 있습니다.",
          ],
        ),
      },
    ],
    endings: [
      [
        "release",
        "승객을 배웅한다",
        "모루가 접힌 꼬리를 펼쳤다. 승객은 작고 따뜻한 빛이 되어 세 역을 지나갔다. 기록실 창문에 돌아온 사람을 위한 등불 하나가 켜졌다.",
      ],
      [
        "keep",
        "기록실의 손님으로 초대한다",
        "빈 승차권에 기록실의 주소를 적었다. 이제 손님은 길을 잃지 않는다. 창가의 작은 의자는 늘 한 자리 비어 있다.",
      ],
      [
        "restore",
        "열차를 다시 운행한다",
        "세 귀환 신호를 철도에 남겼다. 열차는 다시 길 잃은 약속을 태운다. 모루는 다음 승차권을 서랍에 넣었다.",
      ],
    ],
  },
  library: {
    id: "library",
    title: "물에 잠긴 도서관",
    scene: "library",
    icon: "📚",
    subtitle: "읽지 못한 마지막 문장",
    artifact: "물에 젖지 않는 책갈피",
    intro:
      "발목 아래로만 흐르는 물. 책들은 물결에 젖지 않지만, 사람들의 기억은 조금씩 잉크가 되어 번진다.",
    left: "대출 기록대",
    right: "물결 서가",
    clues: [
      [
        "반납 순서",
        "대출표에 달, 물결, 새의 그림이 차례로 찍혀 있다. 날짜는 지워졌지만 도장 순서는 남았다.",
        "lantern",
      ],
      [
        "사서의 쪽지",
        "마지막으로 돌아온 것은 새의 책. 물결의 책은 달의 책 다음에 왔다.",
        "thread",
      ],
    ],
    puzzle: puzzle(
      "library",
      "도서관의 잠금",
      "반납 도장을 올바른 순서로 고르세요.",
      [
        ["moon-wave-bird", "달 → 물결 → 새"],
        ["bird-wave-moon", "새 → 물결 → 달"],
        ["wave-moon-bird", "물결 → 달 → 새"],
      ],
      [
        "두 기록은 같은 순서를 다른 말로 설명합니다.",
        "달이 먼저, 새가 마지막입니다.",
      ],
    ),
  },
  theater: {
    id: "theater",
    title: "아무도 없는 인형극장",
    scene: "theater",
    icon: "🎭",
    subtitle: "막이 내려가지 않는 이유",
    artifact: "마지막 막의 리본",
    intro:
      "객석은 비었는데 박수가 울린다. 무대의 종이 인형은 마지막 대사를 하지 못한 채 고개만 돌린다.",
    left: "분장실",
    right: "조명 조정실",
    clues: [
      [
        "낡은 대본",
        "마지막 대사: 떠나는 이를 붙잡지 말고, 다음 만남을 약속하며 인사한다.",
        "letter",
      ],
      [
        "인형의 몸짓",
        "붉은 실은 손이 아닌 문손잡이에 연결되어 있다. 인형은 무대에 남으려는 것이 아니라 나가고 싶어 한다.",
        "thread",
      ],
    ],
    puzzle: puzzle(
      "theater",
      "마지막 대사",
      "인형에게 어떤 말을 건넬까요?",
      [
        ["stay", "영원히 여기 있어 줘"],
        ["goodbye", "잘 가. 다시 만날 때까지"],
        ["silence", "아무 말도 하지 않는다"],
      ],
      [
        "실이 향하는 곳을 생각하세요.",
        "붙잡는 말이 아니라 배웅하는 인사가 필요합니다.",
      ],
    ),
  },
  market: {
    id: "market",
    title: "새벽의 괴이한 시장",
    scene: "market",
    icon: "🏮",
    subtitle: "가격표 없는 거래",
    artifact: "정직한 상인의 동전",
    intro:
      "상인은 돈 대신 약속을 받는다. 종이 여우는 귓속말한다. “정확히 읽으면 아무것도 빼앗기지 않아요.”",
    left: "달빛 노점",
    right: "분실 계약소",
    clues: [
      [
        "거래 조건",
        "등불은 돌려줄 수 있는 것과만 교환한다. 이름과 기억은 되돌려도 처음과 같지 않다.",
        "lantern",
      ],
      [
        "계약의 예외",
        "빈 편지는 아직 아무것도 담지 않았으므로 그대로 돌려줄 수 있다. 상인은 빈 편지를 좋아한다.",
        "letter",
      ],
    ],
    puzzle: puzzle(
      "market",
      "안전한 거래",
      "등불을 빌리기 위해 무엇을 맡길까요?",
      [
        ["name", "내 이름"],
        ["memory", "가장 소중한 기억"],
        ["blank", "아직 쓰지 않은 빈 편지"],
      ],
      [
        "가격보다 원래대로 돌려받을 수 있는지가 중요합니다.",
        "빈 편지만 아무 변화 없이 돌려받을 수 있습니다.",
      ],
    ),
  },
  observatory: {
    id: "observatory",
    title: "별이 떨어지는 관측소",
    scene: "observatory",
    icon: "🔭",
    subtitle: "하늘을 돌려놓는 밤",
    artifact: "북쪽을 기억하는 별",
    intro:
      "하늘이 천천히 돌아간다. 관측소 바닥의 별자리는 고정되어 있는데, 망원경만 길을 잃었다.",
    left: "별자리 보관실",
    right: "회전 망원경",
    clues: [
      [
        "변하지 않는 별",
        "보관도: 다른 별이 돌아도 기준별 하나는 북쪽에 남는다. 그 별을 먼저 맞춘다.",
        "compass",
      ],
      [
        "보정 절차",
        "장치에는 기준을 맞춘 뒤 회전을 멈추라고 적혀 있다. 반대로 하면 엉뚱한 하늘이 고정된다.",
        "mirror",
      ],
    ],
    puzzle: puzzle(
      "observatory",
      "하늘의 보정",
      "관측소를 복구하는 순서를 고르세요.",
      [
        ["stop-north", "회전 정지 → 북쪽 맞추기"],
        ["north-stop", "북쪽 맞추기 → 회전 정지"],
        ["south-stop", "남쪽 맞추기 → 회전 정지"],
      ],
      [
        "고정하기 전에 먼저 기준을 찾아야 합니다.",
        "기준별을 북쪽에 맞추고 회전을 멈추세요.",
      ],
    ),
  },
  inn: {
    id: "inn",
    title: "아침이 반복되는 여관",
    scene: "inn",
    icon: "🗝️",
    subtitle: "열세 번째 방의 손님",
    artifact: "내일을 여는 방 열쇠",
    intro:
      "체크아웃 시간이 되면 어제의 아침으로 돌아온다. 숙박부 마지막 줄은 누군가의 인사를 기다리고 있다.",
    left: "숙박부 데스크",
    right: "열세 번째 객실",
    clues: [
      [
        "같은 서명",
        "숙박부의 날짜는 반복되지만 서명 옆의 인사는 한 번도 채워지지 않았다. 열쇠 반납보다 먼저 인사가 필요하다.",
        "letter",
      ],
      [
        "문 안의 메모",
        "나는 떠나도 되는지 몰라 기다렸다. 내일 만나자는 인사를 들으면 열쇠를 돌려주겠다.",
        "bell",
      ],
    ],
    puzzle: puzzle(
      "inn",
      "반복을 끝내는 순서",
      "손님의 하루를 내일로 이어 주세요.",
      [
        ["key-hello", "열쇠 회수 → 인사"],
        ["hello-key", "내일을 기약하는 인사 → 열쇠 반납"],
        ["lock", "열세 번째 방 잠그기"],
      ],
      [
        "물건을 먼저 회수해도 기다림은 끝나지 않습니다.",
        "내일의 인사를 건넨 다음 열쇠를 받으세요.",
      ],
    ),
  },
};
for (const c of Object.values(CASES))
  if (c.id !== "train") {
    c.type = "door";
    c.minutes = "짧은 독립 원정 · 중간 저장 가능";
    c.color = "#9fcab5";
    c.stages = [
      {
        name: c.title,
        scene: c.scene,
        left: c.left,
        right: c.right,
        clues: c.clues,
        puzzle: c.puzzle,
      },
    ];
    c.endings = [
      [
        "release",
        "미련을 풀고 배웅한다",
        `${c.title}의 문이 조용히 열렸다. 떠나지 못했던 존재는 마지막 인사를 남기고 자신의 길을 찾았다. ${c.artifact}에는 따뜻한 흔적이 남았다.`,
      ],
      [
        "keep",
        "기억을 기록실에 보관한다",
        `사라질 뻔한 사연을 수첩에 옮겼다. ${c.title}의 존재는 잊히지 않는다는 약속에 안심했다. 우리는 ${c.artifact}을 들고 돌아왔다.`,
      ],
      [
        "restore",
        "장소를 복구하고 돌아온다",
        `${c.title}에 다시 불이 켜졌다. 이제 다른 길 잃은 방문자도 이곳에서 쉴 수 있다. 답례로 받은 ${c.artifact}을 기록실에 전시했다.`,
      ],
    ];
  }
export function nodes(id) {
  const c = CASES[id];
  return [
    {
      id: 0,
      name: c.type === "train" ? "0시 13분의 객차" : "기록실 뒷문",
      scene: c.type === "train" ? "train" : "door",
      stage: -1,
      kind: "hub",
    },
    ...c.stages.flatMap((s, i) => [
      {
        id: i * 3 + 1,
        name: s.name,
        scene: s.scene,
        stage: i,
        kind: "platform",
      },
      { id: i * 3 + 2, name: s.left, scene: s.scene, stage: i, kind: "left" },
      { id: i * 3 + 3, name: s.right, scene: s.scene, stage: i, kind: "right" },
    ]),
  ];
}
export function exits(run, at, gear = []) {
  const ns = nodes(run.campaign),
    n = ns[at];
  if (!n) return [];
  if (n.kind === "hub")
    return ns
      .filter((x) => x.kind === "platform" && accessible(run, x.id))
      .map((x) => x.id);
  const base = n.stage * 3 + 1,
    result = n.kind === "platform" ? [0, base + 1, base + 2] : [base];
  if (n.kind !== "platform") {
    if (gear.includes("compass")) result.push(0);
    if (gear.includes("mirror"))
      result.push(n.kind === "left" ? base + 2 : base + 1);
  } else if (gear.includes("thread") && rSolvedNext()) result.push(base + 3);
  function rSolvedNext() {
    return (
      run.solved.includes(n.stage) &&
      Boolean(ns[base + 3]) &&
      accessible(run, base + 3)
    );
  }
  return [...new Set(result)];
}
export function accessible(run, to) {
  const n = nodes(run.campaign)[to];
  return n && (n.stage <= 0 || run.solved.includes(n.stage - 1));
}
export const clueId = (stage, side) => `${stage}-${side}`;
export function caseProgress(run) {
  return Math.round(
    ((run.found.length + run.solved.length) /
      (CASES[run.campaign].stages.length * 3)) *
      100,
  );
}
export function puzzleOptions(p, seed) {
  return [...p.options].sort((a, b) => hash(seed + a[0]) - hash(seed + b[0]));
}
export function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
