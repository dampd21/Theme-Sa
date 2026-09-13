export const VERSION = 2;
export const LIMIT = 900000;
export const AVATARS = [
  "부적",
  "달",
  "여우",
  "고양이",
  "늑대",
  "까마귀",
  "나비",
  "연꽃",
  "별",
  "검",
  "방울",
  "나무",
];
export const ICONS = [
  "✦",
  "☾",
  "🦊",
  "🐈",
  "🐺",
  "🐦‍⬛",
  "🦋",
  "🪷",
  "✦",
  "⚔",
  "♧",
  "♣",
];
export const CATEGORIES = ["감지", "결계", "정화", "지원", "공격", "기타"];
export const STAT_NAMES = [
  "집중력",
  "기동력",
  "방어력",
  "감지력",
  "정화력",
  "협동력",
];
export const GROUPS = [
  "notices",
  "missions",
  "events",
  "gear",
  "bestiary",
  "cases",
  "world",
  "relationships",
  "achievements",
  "timeline",
  "polls",
  "suggestions",
  "checklists",
];
export const DEFAULT_ROLES = [
  { id: "role-leader", name: "팀장", parentId: null },
  { id: "role-deputy", name: "부팀장", parentId: "role-leader" },
  { id: "role-healer", name: "치료사", parentId: "role-deputy" },
];
export function emptyState() {
  return {
    version: VERSION,
    teamName: "퇴마사",
    leaderId: null,
    members: [],
    updatedAt: null,
    roles: structuredClone(DEFAULT_ROLES),
    customFields: [],
    trash: [],
    activity: [],
    favorites: [],
    ...Object.fromEntries(GROUPS.map((k) => [k, []])),
  };
}
const bad = (message) => {
  throw new Error(message);
};
const obj = (v, label) => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    bad(label + " 형식을 확인하세요.");
  return v;
};
const str = (v, max = 200, required = false) => {
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    bad("텍스트 길이 또는 필수 입력을 확인하세요.");
  return v.trim();
};
const list = (v, max = 300) => {
  if (!Array.isArray(v) || v.length > max)
    bad("항목 개수 또는 목록 형식을 확인하세요.");
  return v;
};
const id = (v) => str(v, 100, true);
const date = (v) => {
  if (v === null || v === "") return null;
  if (typeof v !== "string" || !Number.isFinite(Date.parse(v)))
    bad("날짜 형식을 확인하세요.");
  return new Date(v).toISOString();
};
const day = (v) => {
  const s = str(v ?? "", 10);
  if (
    s &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(s) ||
      new Date(s + "T00:00:00Z").toISOString().slice(0, 10) !== s)
  )
    bad("날짜를 확인하세요.");
  return s;
};
const ids = (v) => [...new Set(list(v ?? []).map(id))];
const bool = (v) => {
  if (v !== undefined && typeof v !== "boolean")
    bad("선택값이 올바르지 않아요.");
  return v ?? false;
};
const num = (v, min, max) => {
  if (!Number.isFinite(v) || v < min || v > max) bad("숫자 범위를 확인하세요.");
  return v;
};
const numberText = (v, min, max) => {
  if (v === "" || v === null || v === undefined) return "";
  const s = String(v);
  if (!/^\d+$/.test(s) || +s < min || +s > max)
    bad("나이·연도·학년 범위를 확인하세요.");
  return s;
};
function unique(items) {
  const seen = new Set();
  for (const x of items) {
    if (seen.has(x.id)) bad("중복된 ID가 있어요.");
    seen.add(x.id);
  }
  return items;
}
function member(m) {
  obj(m, "팀원");
  const abilities = [
    ...new Set(list(m.abilities ?? [], 12).map((x) => str(x, 30, true))),
  ];
  const gender = str(m.gender ?? "", 10);
  if (!["", "여자", "남자", "기타", "비공개"].includes(gender))
    bad("성별 선택값을 확인하세요.");
  const avatar = str(m.avatar ?? "부적", 20);
  if (!AVATARS.includes(avatar)) bad("아바타를 확인하세요.");
  const color = str(m.color ?? "#b8dfb3", 7);
  if (!/^#[0-9a-f]{6}$/i.test(color)) bad("상징색을 확인하세요.");
  const stats = list(m.stats ?? [50, 50, 50, 50, 50, 50], 6).map((x) =>
    num(x, 0, 100),
  );
  if (stats.length !== 6) bad("능력치는 6개여야 해요.");
  return {
    id: id(m.id),
    name: str(m.name, 30, true),
    gender,
    age: numberText(m.age, 1, 120),
    birthYear: numberText(m.birthYear, 1900, 2100),
    school: str(m.school ?? "", 70),
    grade: numberText(m.grade, 1, 12),
    classroom: str(m.classroom ?? "", 15),
    position: str(m.position ?? "", 40),
    abilities,
    address: str(m.address ?? "", 200),
    memo: str(m.memo ?? "", 1500),
    createdAt: date(m.createdAt ?? null),
    codeName: str(m.codeName ?? "", 40),
    intro: str(m.intro ?? "", 160),
    squad: str(m.squad ?? "", 40),
    roleIds: ids(m.roleIds),
    status: str(m.status ?? "활동 중", 20),
    joinedOn: day(
      m.joinedOn ?? (m.createdAt ? String(m.createdAt).slice(0, 10) : ""),
    ),
    rank: str(m.rank ?? "수습", 30),
    avatar,
    color,
    symbol: str(m.symbol ?? "符", 10),
    stats,
    custom: unique(
      list(m.custom ?? [], 30).map((x) => ({
        id: id(x.id),
        value: str(x.value, 300),
      })),
    ),
    talents: list(m.talents ?? [], 12).map((x) => ({
      name: str(x.name, 30, true),
      category: str(x.category ?? "기타", 10),
      effect: str(x.effect ?? "", 500),
      condition: str(x.condition ?? "", 500),
      weakness: str(x.weakness ?? "", 500),
      caution: str(x.caution ?? "", 500),
    })),
  };
}
function record(r) {
  obj(r, "기록");
  return {
    id: id(r.id),
    title: str(r.title, 100, true),
    body: str(r.body ?? "", 8000),
    status: str(r.status ?? "준비 중", 30),
    category: str(r.category ?? "", 40),
    date: day(r.date ?? ""),
    endDate: day(r.endDate ?? ""),
    location: str(r.location ?? "", 150),
    ownerId: r.ownerId ? id(r.ownerId) : null,
    participants: ids(r.participants),
    assignments: list(r.assignments ?? [], 300).map((a) => ({
      memberId: id(a.memberId),
      role: str(a.role, 50),
    })),
    pinned: bool(r.pinned),
    createdAt: date(r.createdAt ?? null),
    updatedAt: date(r.updatedAt ?? null),
    actorId: r.actorId ? id(r.actorId) : null,
    acknowledged: ids(r.acknowledged),
    reactions: ids(r.reactions),
    comments: unique(
      list(r.comments ?? [], 100).map((c) => ({
        id: id(c.id),
        actorId: c.actorId ? id(c.actorId) : null,
        text: str(c.text, 1000, true),
        at: date(c.at),
      })),
    ),
    options: unique(
      list(r.options ?? [], 20).map((o) => ({
        id: id(o.id),
        label: str(o.label, 120, true),
      })),
    ),
    votes: list(r.votes ?? [], 300).map((v) => ({
      actorId: id(v.actorId),
      optionId: id(v.optionId),
    })),
    items: unique(
      list(r.items ?? [], 100).map((i) => ({
        id: id(i.id),
        text: str(i.text, 200, true),
        done: bool(i.done),
      })),
    ),
    fromId: r.fromId ? id(r.fromId) : null,
    toId: r.toId ? id(r.toId) : null,
    relation: str(r.relation ?? "", 40),
    investigation: str(r.investigation ?? "", 4000),
    resolution: str(r.resolution ?? "", 4000),
    result: str(r.result ?? "", 4000),
    weakness: str(r.weakness ?? "", 1000),
    condition: str(r.condition ?? "", 1000),
  };
}
export function normalize(input) {
  obj(input, "전체 기록");
  if (![1, VERSION].includes(input.version))
    bad("지원하지 않는 기록 버전이에요.");
  if (input.version === 2) {
    for (const key of [
      "roles",
      "customFields",
      "trash",
      "activity",
      "favorites",
      ...GROUPS,
    ])
      if (!Array.isArray(input[key]))
        bad("확장 기록이 누락됐어요. 새로고침 후 다시 시도하세요.");
  }
  const s = emptyState();
  s.teamName = str(input.teamName, 30, true);
  s.members = unique(list(input.members).map(member));
  s.leaderId = input.leaderId === null ? null : id(input.leaderId);
  const memberIds = new Set(s.members.map((m) => m.id));
  if (s.members.length ? !memberIds.has(s.leaderId) : s.leaderId !== null)
    bad("팀장 지정을 확인하세요.");
  s.updatedAt = date(input.updatedAt ?? null);
  if (input.version === VERSION) {
    s.roles = unique(
      list(input.roles, 50).map((r) => ({
        id: id(r.id),
        name: str(r.name, 40, true),
        parentId: r.parentId ? id(r.parentId) : null,
      })),
    );
    s.customFields = unique(
      list(input.customFields, 30).map((f) => ({
        id: id(f.id),
        label: str(f.label, 40, true),
      })),
    );
    s.trash = unique(
      list(input.trash, 300).map((t) => ({
        id: id(t.id),
        member: member(t.member),
        deletedAt: date(t.deletedAt),
        expiresAt: date(t.expiresAt),
      })),
    );
    s.activity = unique(
      list(input.activity, 300).map((a) => ({
        id: id(a.id),
        at: date(a.at),
        actorId: a.actorId ? id(a.actorId) : null,
        label: str(a.label, 160, true),
        memberIds: ids(a.memberIds),
      })),
    );
    s.favorites = list(input.favorites, 300).map((f) => ({
      actorId: id(f.actorId),
      memberIds: ids(f.memberIds),
    }));
    for (const k of GROUPS) s[k] = unique(list(input[k], 200).map(record));
  }
  const roleIds = new Set(s.roles.map((r) => r.id));
  if (
    !roleIds.has("role-leader") ||
    s.roles.find((r) => r.id === "role-leader").parentId !== null
  )
    bad("팀장 직함은 조직도의 최상위여야 해요.");
  for (const r of s.roles) {
    if (r.id !== "role-leader" && !r.parentId) bad("상위 직함을 지정하세요.");
    let p = r,
      seen = new Set();
    while (p) {
      if (seen.has(p.id)) bad("조직도에 순환 연결이 있어요.");
      seen.add(p.id);
      if (p.parentId && !roleIds.has(p.parentId)) bad("상위 직함이 없어요.");
      p = s.roles.find((x) => x.id === p.parentId);
    }
  }
  const fieldIds = new Set(s.customFields.map((f) => f.id));
  for (const m of s.members) {
    if (
      m.roleIds.some((x) => !roleIds.has(x)) ||
      m.custom.some((x) => !fieldIds.has(x.id))
    )
      bad("존재하지 않는 직함 또는 사용자 항목이에요.");
    if (!["활동 중", "휴식 중", "임무 중", "장기 부재"].includes(m.status))
      bad("활동 상태를 확인하세요.");
    if (m.talents.some((t) => !CATEGORIES.includes(t.category)))
      bad("능력 분류를 확인하세요.");
  }
  for (const t of s.trash) {
    if (
      t.id !== t.member.id ||
      memberIds.has(t.id) ||
      !t.deletedAt ||
      !t.expiresAt ||
      t.expiresAt <= t.deletedAt
    )
      bad("휴지통 기록을 확인하세요.");
  }
  for (const k of GROUPS)
    for (const r of s[k]) {
      if (r.endDate && r.date && r.endDate < r.date)
        bad("종료일이 시작일보다 빨라요.");
      if (
        r.votes.some((v) => !r.options.some((o) => o.id === v.optionId)) ||
        new Set(r.votes.map((v) => v.actorId)).size !== r.votes.length
      )
        bad("투표 선택을 확인하세요.");
      if (
        k === "relationships" &&
        (!memberIds.has(r.fromId) ||
          !memberIds.has(r.toId) ||
          r.fromId === r.toId)
      )
        bad("관계도에는 서로 다른 현재 팀원을 선택하세요.");
    }
  if (
    new TextEncoder().encode(JSON.stringify(s, null, 2) + "\n").length > LIMIT
  )
    bad("전체 기록이 900KB를 넘었어요. 오래된 기록을 정리해 주세요.");
  return s;
}
export function purgeExpired(s, now = Date.now()) {
  s.trash = s.trash.filter((t) => Date.parse(t.expiresAt) > now);
  return s;
}
export function removeMember(s, memberId, now = new Date().toISOString()) {
  const m = s.members.find((x) => x.id === memberId);
  if (!m) bad("팀원을 찾을 수 없어요.");
  if (s.trash.length >= 300) bad("휴지통이 가득 찼어요. 먼저 정리하세요.");
  s.trash.push({
    id: m.id,
    member: structuredClone(m),
    deletedAt: now,
    expiresAt: new Date(Date.parse(now) + 30 * 86400000).toISOString(),
  });
  s.members = s.members.filter((x) => x.id !== memberId);
  if (s.leaderId === memberId) s.leaderId = s.members[0]?.id ?? null;
  s.relationships = s.relationships.filter(
    (x) => x.fromId !== memberId && x.toId !== memberId,
  );
  return s;
}
export function restoreMember(s, id, now = Date.now()) {
  const t = s.trash.find((t) => t.id === id);
  if (!t || Date.parse(t.expiresAt) <= now) bad("복구 기간이 만료됐어요.");
  const m = structuredClone(t.member);
  m.roleIds = m.roleIds.filter((id) => s.roles.some((r) => r.id === id));
  m.custom = m.custom.filter((v) => s.customFields.some((f) => f.id === v.id));
  s.members.push(m);
  s.trash = s.trash.filter((x) => x.id !== id);
  if (!s.leaderId) s.leaderId = id;
  return s;
}
export const LABELS = {
  acknowledged: "공지 확인",
  reactions: "공감",
  comments: "댓글",
  votes: "투표",
  actorId: "활동 프로필",
  category: "분류",
  effect: "효과",
  caution: "주의사항",
  text: "내용",
  done: "완료",
  label: "이름",
  at: "시각",
  memberId: "팀원",
  parentId: "상위 직함",
  teamName: "팀명",
  leaderId: "팀장",
  name: "이름",
  gender: "성별",
  age: "나이",
  birthYear: "출생 연도",
  school: "학교",
  grade: "학년",
  classroom: "반",
  position: "역할",
  abilities: "능력",
  address: "주소",
  memo: "메모",
  codeName: "코드네임",
  intro: "한 줄 소개",
  squad: "소속 조",
  roleIds: "직함",
  status: "상태",
  joinedOn: "가입일",
  rank: "등급",
  avatar: "아바타",
  color: "상징색",
  symbol: "문양",
  stats: "능력치",
  custom: "사용자 항목",
  talents: "능력 상세",
  roles: "조직 직함",
  customFields: "프로필 항목",
  trash: "휴지통",
  favorites: "즐겨찾기",
  notices: "공지",
  missions: "임무",
  events: "일정",
  gear: "장비",
  bestiary: "도감",
  cases: "사건",
  world: "세계관",
  relationships: "관계도",
  achievements: "업적",
  timeline: "연표",
  polls: "투표",
  suggestions: "건의",
  checklists: "체크리스트",
  title: "제목",
  body: "내용",
  date: "날짜",
  endDate: "종료일",
  location: "장소",
  ownerId: "담당자",
  participants: "참여자",
  assignments: "참여 역할",
  pinned: "상단 고정",
  options: "투표 항목",
  items: "체크 항목",
  fromId: "시작 인물",
  toId: "연결 인물",
  relation: "관계",
  investigation: "조사",
  resolution: "해결 과정",
  result: "결과",
  weakness: "약점·대응",
  condition: "특징·조건",
};
export function differences(before, after) {
  const out = [];
  const stringify = (x) =>
    x === null || x === undefined || x === ""
      ? "없음"
      : typeof x === "object"
        ? JSON.stringify(x)
        : String(x);
  const value = (k, v) =>
    k === "address" ? (v ? "입력됨 (내용 숨김)" : "없음") : stringify(v);
  const compare = (a, b, prefix = "") => {
    for (const k of Object.keys(b)) {
      if (["id", "createdAt", "updatedAt", "activity"].includes(k)) continue;
      if (JSON.stringify(a?.[k]) !== JSON.stringify(b[k]))
        out.push({
          label: prefix + (LABELS[k] || k),
          before: value(k, a?.[k]),
          after: value(k, b[k]),
        });
    }
  };
  compare(
    { teamName: before.teamName, leaderId: before.leaderId },
    { teamName: after.teamName, leaderId: after.leaderId },
  );
  for (const m of after.members) {
    const old = before.members.find((x) => x.id === m.id);
    if (!old) out.push({ label: "팀원 추가", before: "없음", after: m.name });
    else compare(old, m, m.name + " · ");
  }
  for (const m of before.members)
    if (!after.members.some((x) => x.id === m.id))
      out.push({ label: "팀원 삭제", before: m.name, after: "휴지통 (30일)" });
  for (const k of ["roles", "customFields", "trash", "favorites", ...GROUPS]) {
    if (JSON.stringify(before[k]) === JSON.stringify(after[k])) continue;
    if (GROUPS.includes(k)) {
      for (const r of after[k]) {
        const old = before[k].find((x) => x.id === r.id);
        if (!old)
          out.push({
            label: LABELS[k] + " 추가",
            before: "없음",
            after: r.title,
          });
        else compare(old, r, LABELS[k] + " · ");
      }
      for (const r of before[k])
        if (!after[k].some((x) => x.id === r.id))
          out.push({
            label: LABELS[k] + " 삭제",
            before: r.title,
            after: "없음",
          });
    } else
      out.push({
        label: LABELS[k],
        before: k === "trash" ? before[k].length + "명" : stringify(before[k]),
        after: k === "trash" ? after[k].length + "명" : stringify(after[k]),
      });
  }
  return out;
}
