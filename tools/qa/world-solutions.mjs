import { initialGame, gameStep } from "../../site/world-games.mjs";
import { APPRAISALS, CUSTOMERS, LIAR } from "../../site/world-content.mjs";
export function solution(type, level = 0, seed = 1) {
  if (type === "tactics")
    return [
      ["right", "left", "down", "right"],
      ["right", "right", "down", "left", "down", "right"],
      [
        "right",
        "down",
        "down",
        "down",
        "right",
        "down",
        "left",
        "up",
        "right",
        "up",
        "up",
        "left",
        "up",
        "right",
        "right",
      ],
    ][level].map((move) => ({ move }));
  if (type === "appraisal")
    return Array.from({ length: 5 }, (_, i) => [
      { inspect: 0 },
      { inspect: 1 },
      { inspect: 2 },
      { judge: APPRAISALS[(i + level) % 5].answer },
    ]).flat();
  if (type === "shop")
    return Array.from({ length: 5 }, (_, i) => ({
      tea: CUSTOMERS[(i + level) % 5][3],
    }));
  if (type === "liar")
    return Array.from({ length: 3 }, (_, i) => ({
      door: LIAR[(i + level) % 3].answer,
    }));
  if (type === "stars")
    return [1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11].map((star) => ({ star }));
  if (type === "shadow") {
    const a = [];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < (i + 1 + level) % 4; j++)
        a.push({ piece: i, kind: "rotate" });
      for (let j = 0; j < ([1, 0, 2][i] + level) % 4; j++)
        a.push({ piece: i, kind: "shift" });
    }
    a.push({ check: true });
    return a;
  }
  // Test-only bounded beam search, no endpoint or shortcut is included in the public client.
  let beam = [{ s: initialGame(type, level, seed), a: [] }],
    seen = new Map();
  for (let depth = 0; depth < 90; depth++) {
    const next = [];
    for (const node of beam) {
      for (const action of node.s.reward
        ? [{ reward: "rest" }, { reward: "peace" }, { reward: "sun" }]
        : [{ card: 0 }, { card: 1 }, { card: 2 }]) {
        const s = gameStep(node.s, action),
          a = [...node.a, action];
        if (s.status === "won") return a;
        if (s.status === "lost") continue;
        const key = [
          s.battle,
          s.enemy,
          s.resolve,
          s.cursor,
          s.reward,
          s.cards.join(","),
        ].join("|");
        if ((seen.get(key) || 0) >= s.hp) continue;
        seen.set(key, s.hp);
        next.push({ s, a });
      }
    }
    next.sort((a, b) => score(b.s) - score(a.s));
    beam = next.slice(0, 120);
    if (!beam.length) break;
  }
  throw Error("No deck solution found " + level + " " + seed);
}
function score(s) {
  return (
    s.battle * 1000 +
    s.hp * 3 -
    (s.reward ? 0 : Math.min(s.enemy, s.resolve)) * 6
  );
}
