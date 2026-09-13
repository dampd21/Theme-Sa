import { PLACES, COLORS, ARTIFACTS } from "./world-content.mjs";
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function townSVG(time = "night", barrier = 0) {
  const dark = time === "night",
    dusk = time === "dusk",
    sky = dark ? "#142b36" : dusk ? "#514657" : "#80b2ad";
  return `<svg viewBox="0 0 1000 600" role="img" aria-label="강과 길로 연결된 여덟 장소의 달빛 마을"><defs><linearGradient id="worldSky" x2="0" y2="1"><stop stop-color="${sky}"/><stop offset="1" stop-color="#233e38"/></linearGradient><pattern id="worldGrain" width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r=".8" fill="#e3dbb0" opacity=".09"/></pattern></defs><rect width="1000" height="600" fill="url(#worldSky)"/><circle cx="830" cy="74" r="31" fill="${dark ? "#f0dea8" : "#eccc9a"}" opacity=".9"/>${dark ? Array.from({ length: 34 }, (_, i) => `<circle cx="${(i * 137 + 29) % 1000}" cy="${(i * 53 + 22) % 200}" r="${i % 3 === 0 ? 2 : 1}" fill="#e8e1b4"/>`).join("") : ""}<path d="M0 230 Q190 55 345 230 T680 210 T1050 200 V600 H0" fill="#203e39"/><path d="M0 290 Q220 120 460 315 T1000 230 V600 H0" fill="#29483d"/><path d="M-20 475 C210 385 400 505 620 400 S860 450 1050 530" fill="none" stroke="#518b87" stroke-width="48"/><path d="M-20 475 C210 385 400 505 620 400 S860 450 1050 530" fill="none" stroke="#acd4bf" stroke-opacity=".25" stroke-width="3"/><g fill="none" stroke="#b5b48b" stroke-opacity=".38" stroke-width="7" stroke-linecap="round">${PLACES.slice(
    1,
  )
    .map((p) => `<path d="M490 315 Q${p.x * 10} 320 ${p.x * 10} ${p.y * 6}"/>`)
    .join("")}</g>${Array.from({ length: 34 }, (_, i) => {
    const x = (i * 193 + 31) % 960,
      y = 230 + ((i * 71) % 330);
    return `<g transform="translate(${x} ${y})"><path d="M0 0 L-16 37 H16Z M0 17 L-21 54 H21Z" fill="${i % 2 ? "#18392e" : "#3c5e46"}"/><path d="M0 42v24" stroke="#1b332c" stroke-width="5"/></g>`;
  }).join("")}${PLACES.map((p, i) => {
    const x = p.x * 10,
      y = p.y * 6;
    return `<g transform="translate(${x - 28} ${y - 23})"><rect width="56" height="44" rx="3" fill="${i % 2 ? "#708573" : "#a39d7a"}"/><path d="M-10 2 L28 -24 L66 2Z" fill="${i % 2 ? "#354a4b" : "#525c47"}"/><rect x="21" y="22" width="14" height="22" fill="#253d33"/><rect x="8" y="10" width="10" height="12" fill="${dark || dusk ? "#efd693" : "#c7dac0"}"/><rect x="39" y="10" width="10" height="12" fill="#efd693"/></g>`;
  }).join(
    "",
  )}${barrier >= 24 ? '<path d="M110 180 Q500 -85 900 180" fill="none" stroke="#e1d48a" stroke-width="3" stroke-dasharray="5 13" opacity=".8"/>' : ""}<rect width="1000" height="600" fill="url(#worldGrain)"/></svg>`;
}
export function roomSVG(p, barrier = 0) {
  const trophies = p.display.length,
    pet = p.pet;
  return `<svg viewBox="0 0 900 400" role="img" aria-label="활동에 따라 유물과 발자국과 수호령이 자리하는 기록실"><rect width="900" height="400" fill="#253c31"/><path d="M0 300H900V400H0" fill="#574e3b"/><path d="M0 320H900M0 350H900M0 385H900" stroke="#302f26"/><rect x="345" y="45" width="210" height="195" rx="70" fill="${p.time === "day" ? "#98bbaa" : p.time === "dusk" ? "#ad8d89" : "#223c4b"}" stroke="#b4a981" stroke-width="11"/><path d="M450 47V240M345 145H555" stroke="#b4a981" stroke-width="7"/><circle cx="497" cy="89" r="20" fill="#efdda5"/><path d="M335 245H565" stroke="#c2ad80" stroke-width="15"/><rect x="65" y="98" width="188" height="132" fill="#162a23" stroke="#796e50" stroke-width="9"/><text x="160" y="180" font-size="52" text-anchor="middle">${p.plot.length === 4 ? "🌸" : p.mail.length ? "✉️" : "🌙"}</text><path d="M645 220H855M645 300H855" stroke="#a59162" stroke-width="12"/>${Array.from({ length: trophies }, (_, i) => `<text x="${670 + i * 62}" y="210" font-size="42">${ARTIFACTS.find((x) => x[0] === p.display[i])?.[1] || "✦"}</text>`).join("")}<path d="M240 335Q450 265 660 335L610 395H290Z" fill="#59705b"/>${p.clues.length ? '<path d="M420 375l7 -10m14 -4l7 -10m14 -4l7 -10" stroke="#c7bb98" stroke-width="7" stroke-linecap="round" opacity=".7"/>' : ""}${pet ? `<text x="${pet.home === "창가" ? 470 : pet.home === "책상" ? 720 : 310}" y="${pet.home === "창가" ? 238 : pet.home === "책상" ? 300 : 315}" font-size="48">${{ fox: "🦊", cat: "🐈‍⬛", bird: "🕊️", jelly: "🪼" }[pet.kind]}</text>` : ""}${p.plant >= 4 ? '<text x="355" y="243" font-size="42">🌱</text>' : ""}${barrier >= 24 ? '<path d="M25 30Q450 85 875 30" fill="none" stroke="#dabf76"/><g fill="#e5cd8c"><circle cx="110" cy="39" r="6"/><circle cx="310" cy="53" r="6"/><circle cx="580" cy="53" r="6"/><circle cx="790" cy="39" r="6"/></g>' : ""}</svg>`;
}
export function sealSVG(config) {
  const color = COLORS.includes(config.color) ? config.color : COLORS[0],
    glyph =
      { moon: "☾", star: "✦", leaf: "❧", wave: "≋", eye: "◉", heart: "♡" }[
        config.symbol
      ] || "✦";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="580" viewBox="0 0 360 580" role="img" aria-label="직접 만든 ${esc(config.name)} 부적"><path d="M34 20H326V500L180 564L34 500Z" fill="#e8dfbe" stroke="${color}" stroke-width="12"/><path d="M57 48H303V482L180 535L57 482Z" fill="none" stroke="#345443" stroke-width="3"/><path d="M90 78H270M90 455H270" stroke="#345443" stroke-width="5"/><circle cx="180" cy="243" r="102" fill="${color}" opacity=".65"/><text x="180" y="284" text-anchor="middle" font-family="serif" font-size="118" fill="#294636">${glyph}</text>${Array.from({ length: 4 }, (_, i) => `<circle cx="${95 + i * 57}" cy="398" r="${5 + (config.pattern || 0) * 2}" fill="#365440"/>`).join("")}<text x="180" y="133" text-anchor="middle" font-size="12" letter-spacing="5" fill="#3c5642">MOONLIGHT ATELIER</text><text x="180" y="470" text-anchor="middle" font-family="sans-serif" font-size="${config.name.length > 15 ? 11 : 17}" fill="#294636">${esc(config.name)}</text></svg>`;
}
