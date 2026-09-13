export const sealSVG = `<svg viewBox="0 0 40 48" fill="none" role="img" aria-label="기록실의 부적 인장"><path d="m20 2 16 9v26l-16 9L4 37V11L20 2Z" stroke="currentColor"/><path d="m20 7 12 7v20l-12 7-12-7V14l12-7Z" stroke="currentColor" opacity=".4"/><path d="M12 17h16m-8-5v24m-9-8 9-7 9 7M14 32h12" stroke="currentColor" stroke-width="1.3"/><circle cx="20" cy="25" r="3" fill="#131a17" stroke="currentColor"/></svg>`;
export const moruSVG = `<svg viewBox="0 0 120 120" role="img" aria-label="종이 여우 모루"><path d="M70 79q52-26 37 21-24 22-55 2" fill="#c0cdb1"/><path d="m19 17 31 24 24-7 27-22-4 48-21 39-30 1-27-37z" fill="#dfdec5"/><path d="m19 17 28 31-24 12zm82-3-26 32 22 14z" fill="#85a793"/><path d="m20 62 40 22 37-24-21 41H46z" fill="#f2e7c8"/><path d="m60 84-7-6h14z" fill="#223c33"/><path d="m36 59 10 5m29 0 10-6" stroke="#243f33" stroke-width="3" stroke-linecap="round"/><path d="m60 86 0 8m-19 5 19 9 19-10" stroke="#b09b6d" fill="none"/><circle cx="60" cy="105" r="5" fill="#d5ad64"/></svg>`;
export function sceneSVG(kind = "train", id = "advScene") {
  const trees = Array.from(
    { length: 12 },
    (_, i) =>
      `<path d="m${i * 85 - 10} 350 35-120 36 120z" fill="${i % 2 ? "#203d36" : "#294b40"}"/>`,
  ).join("");
  const stars = Array.from(
    { length: 34 },
    (_, i) =>
      `<circle cx="${(i * 137 + 31) % 940}" cy="${(i * 47 + 17) % 235}" r="${i % 5 === 0 ? 2 : 1}" fill="#e7dbaf" opacity="${0.25 + (i % 3) * 0.2}"/>`,
  ).join("");
  const windows = (x, y, n) =>
    Array.from(
      { length: n },
      (_, i) =>
        `<rect x="${x + i * 94}" y="${y}" width="63" height="96" rx="29" fill="#c5cfab" opacity=".8"/><path d="M${x + i * 94 + 31} ${y}v96" stroke="#233f36" stroke-width="5"/>`,
    ).join("");
  let art = "";
  if (kind === "train")
    art = `<path d="M0 371h940M0 397h940" stroke="#839484" stroke-width="3"/><path d="m0 420 940-64M0 356l940 64" stroke="#384e42"/><rect x="105" y="144" width="675" height="207" rx="26" fill="#34594c" stroke="#92a280" stroke-width="2"/><path d="M100 251h686M115 327h660" stroke="#d3b570" stroke-width="4"/>${windows(142, 168, 6)}<rect x="714" y="163" width="40" height="156" rx="9" fill="#243f37" stroke="#a4b08b"/><circle cx="210" cy="355" r="25" fill="#122b26" stroke="#8d9a7c" stroke-width="6"/><circle cx="680" cy="355" r="25" fill="#122b26" stroke="#8d9a7c" stroke-width="6"/><path d="M790 161v190h115V218l-29-57z" fill="#375c4b" stroke="#9ba889"/><rect x="811" y="181" width="64" height="64" rx="12" fill="#c9d5ac"/><circle cx="873" cy="303" r="21" fill="#eedca5"/><ellipse cx="901" cy="305" rx="75" ry="50" fill="#eedca5" opacity=".09"/><path d="M126 135q70-56 153-23t127-49" stroke="#b2c4b2" stroke-width="17" fill="none" opacity=".14"/>`;
  else if (kind === "harbor")
    art = `<path d="M0 290q180-20 360 7t580-9v132H0" fill="#294e4b"/>${Array.from({ length: 9 }, (_, i) => `<path d="M${i * 107} ${320 + (i % 3) * 25}h65" stroke="#819c85" opacity=".4"/>`).join("")}<path d="m160 300 26-161h69l22 161z" fill="#afac86"/><rect x="179" y="108" width="86" height="40" rx="6" fill="#ddcf93"/><path d="m173 109 50-38 50 38" fill="#587367"/><path d="m188 126-188-46v140zM255 126l475-80v190z" fill="#f6e6b2" opacity=".07"/><path d="m472 320 144 1-27 30h-91z" fill="#b3ae86"/><path d="M535 321V186l74 113h-70" fill="#d2d3b4" stroke="#6e8975"/><path d="M735 346h205M755 345v75m75-75v75m75-75v75" stroke="#738370" stroke-width="11"/>`;
  else if (kind === "garden")
    art = `${trees}<path d="M280 353V181q185-228 380 0v172z" fill="#70a28a" opacity=".18" stroke="#c4cf9c" stroke-width="5"/><path d="M280 240h380M374 92v261m94-310v310m94-263v263" stroke="#88a989" stroke-width="4"/><path d="M443 353V229q29-46 57 0v124" fill="#122e29" stroke="#bac49c" stroke-width="4"/>${Array.from({ length: 14 }, (_, i) => `<path d="M${80 + i * 60} 370v-35" stroke="#739976"/><circle cx="${80 + i * 60}" cy="330" r="9" fill="${i % 2 ? "#c6b68c" : "#a2ba94"}"/>`).join("")}`;
  else if (kind === "tower" || kind === "observatory")
    art = `${trees}<path d="M340 360V169a125 125 0 0 1 250 0v191z" fill="#486757" stroke="#98a98a" stroke-width="3"/><path d="M326 164h279" stroke="#c5bd8d" stroke-width="7"/>${kind === "tower" ? '<circle cx="465" cy="152" r="67" fill="#1c3831" stroke="#d2c18b" stroke-width="5"/><path d="M465 105v47l33 23" fill="none" stroke="#dfd2a5" stroke-width="5"/><path d="M423 360V282q42-70 84 0v78" fill="#1b342d"/>' : '<path d="m404 259 118-81 31 43-123 79z" fill="#b1b99a" stroke="#1f3b32" stroke-width="7"/><path d="m463 280-48 80m48-80 56 80" stroke="#b1b99a" stroke-width="8"/>'}`;
  else if (kind === "library")
    art = `<path d="M0 365q230-18 460 0t480-8v63H0" fill="#50736a"/>${[90, 350, 610].map((x) => `<rect x="${x}" y="90" width="207" height="268" fill="#233c32" stroke="#8b9979" stroke-width="5"/>${Array.from({ length: 18 }, (_, i) => `<rect x="${x + 15 + (i % 6) * 31}" y="${108 + Math.floor(i / 6) * 82 + (i % 3) * 7}" width="22" height="${63 - (i % 3) * 7}" fill="${["#82957b", "#b4ac80", "#6d9588"][i % 3]}"/>`).join("")}`).join("")}<path d="M300 395h140m110-13h174M55 382h150" stroke="#d4d3ac" opacity=".3"/>`;
  else if (kind === "theater")
    art = `<rect x="128" y="57" width="684" height="304" fill="#172c27" stroke="#a59f78" stroke-width="5"/><path d="M120 50h350q-220 148-324 242zM820 50H470q220 148 324 242z" fill="#665e54"/><path d="M159 65q0 105 80 158M778 65q0 105-80 158" stroke="#aa9872" stroke-width="3" fill="none"/><path d="M90 363h760v26H90" fill="#969876"/><path d="M400 350 470 169l70 181z" fill="#ded4a6" opacity=".09"/><path d="M470 100v127" stroke="#b99b79"/><circle cx="470" cy="237" r="19" fill="#ceceb0"/><path d="m470 254-29 73h59z" fill="#88a98a"/><path d="m441 276-39 22m99-22 34 22" stroke="#ced1af" stroke-width="6"/>`;
  else if (kind === "market")
    art = `${[40, 340, 640].map((x, i) => `<path d="m${x} 209 40-77h175l40 77z" fill="${i % 2 ? "#8b8270" : "#648470"}"/><rect x="${x + 22}" y="209" width="213" height="144" fill="#354d3c"/><rect x="${x + 42}" y="245" width="173" height="70" fill="#bdc294"/><path d="M${x + 15} 321h228" stroke="#b1ae86" stroke-width="13"/><path d="M${x + 129} 58v71" stroke="#b6b488"/><ellipse cx="${x + 129}" cy="131" rx="22" ry="31" fill="#ead09a"/>`).join("")}`;
  else if (kind === "inn")
    art = `<path d="m240 140 230-94 230 94v222H240z" fill="#506651" stroke="#a9ac81" stroke-width="4"/>${windows(280, 165, 4)}<path d="M430 362V275a41 41 0 0 1 82 0v87z" fill="#172f29" stroke="#c5b586" stroke-width="4"/><path d="M400 378h142M373 397h196" stroke="#8c9c7d" stroke-width="12"/>`;
  else
    art = `${trees}<path d="M325 379V122q145-180 290 0v257z" fill="#a0b58b" opacity=".2"/><path d="M362 377V145q108-143 216 0v232z" fill="#172b2c" stroke="#b5bb87" stroke-width="7"/><path d="M384 369V151q85-108 170 0v218" fill="none" stroke="#749d80" stroke-width="2"/><circle cx="537" cy="265" r="8" fill="#ded09a"/><path d="m390 420 80-96 80 96" fill="#c9d0aa" opacity=".1"/>`;
  return `<svg class="adv-scene" viewBox="0 0 940 420" role="img" aria-label="${{ train: "심야 열차", harbor: "달빛 항구와 등대", garden: "유리 정원", tower: "종탑", library: "물에 잠긴 서가", theater: "인형극장", market: "등불 야시장", observatory: "별 관측소", inn: "여관", door: "기록실 뒷문" }[kind] || "탐험 장면"}"><defs><linearGradient id="${id}" x2="0" y2="1"><stop stop-color="#111f28"/><stop offset="1" stop-color="#335347"/></linearGradient></defs><rect width="940" height="420" fill="url(#${id})"/>${stars}<circle cx="760" cy="78" r="35" fill="#dbd8af"/><circle cx="771" cy="69" r="31" fill="#213932" opacity=".9"/><path d="M0 287q137-111 288-29t314-17 338 32v147H0" fill="#203e36"/><path d="M0 350q230-36 480 2t460 1v67H0" fill="#1c352c"/>${art}<path d="M0 414h940" stroke="#b2b28b" opacity=".3"/></svg>`;
}
