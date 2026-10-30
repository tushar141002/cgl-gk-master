import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("public/maps", { recursive: true });

const india = "M200 50 L250 80 L300 105 L350 100 L390 120 L430 110 L470 140 L490 170 L480 200 L455 225 L440 240 L410 250 L400 230 L380 250 L365 275 L350 300 L335 340 L320 380 L300 430 L285 480 L270 530 L255 580 L245 615 L230 580 L215 530 L195 480 L180 430 L170 380 L155 340 L140 310 L120 300 L105 275 L115 250 L125 220 L135 185 L145 150 L155 115 L170 85 L180 65 Z";

const world =
  "M60 80 L150 60 L200 90 L180 140 L140 170 L100 150 L70 120 Z " +
  "M150 190 L190 200 L210 250 L185 320 L160 340 L145 290 L135 240 Z " +
  "M280 70 L340 60 L360 100 L330 120 L290 110 Z " +
  "M290 130 L350 130 L370 200 L340 280 L310 300 L290 230 L280 170 Z " +
  "M360 70 L500 60 L560 100 L540 150 L500 180 L450 160 L420 190 L380 160 L350 120 Z " +
  "M420 185 L440 200 L430 230 L415 210 Z " +
  "M480 220 L520 230 L510 250 L490 240 Z " +
  "M500 290 L560 280 L575 330 L540 355 L505 340 Z";

function frame(inner, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 680" role="img" aria-label="${title}">
  <rect width="600" height="680" fill="#eef5ef"/>
  <g stroke="#d7e5db" stroke-width="1">
    ${Array.from({ length: 10 }, (_, i) => `<line x1="${i * 60}" y1="0" x2="${i * 60}" y2="680"/>`).join("")}
    ${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="${i * 60}" x2="600" y2="${i * 60}"/>`).join("")}
  </g>
  ${inner}
  <g font-family="system-ui, sans-serif" fill="#48604f">
    <text x="24" y="40" font-size="20" font-weight="700">${title}</text>
    <text x="24" y="650" font-size="14">Schematic map · not to scale</text>
  </g>
  <g transform="translate(550,610)" stroke="#48604f" fill="#48604f" font-family="system-ui" font-size="13">
    <path d="M0 20 L0 -18" stroke-width="2" marker-end="url(#arrow)"/>
    <text x="-4" y="-24" font-weight="700">N</text>
  </g>
  <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#48604f"/></marker></defs>
</svg>`;
}

function indiaMap(file, marker, title, markerLabel = "") {
  const [x, y] = marker;
  const inner = `
  <path d="${india}" fill="#cfe4d3" stroke="#4c7a5c" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="${x}" cy="${y}" r="16" fill="#dc2626" opacity=".18"/>
  <circle cx="${x}" cy="${y}" r="8" fill="#dc2626" stroke="#fff" stroke-width="3"/>
  ${markerLabel ? `<text x="${x + 16}" y="${y + 5}" font-family="system-ui" font-size="16" font-weight="700" fill="#7f1d1d">${markerLabel}</text>` : ""}`;
  writeFileSync(`public/maps/${file}`, frame(inner, title));
}

function worldMap(file, marker, title) {
  const [x, y] = marker;
  const inner = `
  <path d="${world}" fill="#cfe4d3" stroke="#4c7a5c" stroke-width="2" stroke-linejoin="round"/>
  <line x1="20" y1="200" x2="590" y2="200" stroke="#9db8a5" stroke-dasharray="6 6"/>
  <text x="26" y="194" font-family="system-ui" font-size="12" fill="#6b8472">Equator</text>
  <circle cx="${x}" cy="${y}" r="16" fill="#dc2626" opacity=".18"/>
  <circle cx="${x}" cy="${y}" r="8" fill="#dc2626" stroke="#fff" stroke-width="3"/>`;
  writeFileSync(`public/maps/${file}`, frame(inner, title));
}

indiaMap("river-ganga.svg", [300, 215], "Marked river 1");
indiaMap("river-godavari.svg", [245, 392], "Marked river 2");
indiaMap("river-narmada.svg", [205, 330], "Marked river 3");
indiaMap("river-brahmaputra.svg", [425, 208], "Marked river 4");
indiaMap("mountains-himalaya.svg", [300, 132], "Marked mountain range");
indiaMap("mountains-western-ghats.svg", [192, 470], "Marked mountain range");
indiaMap("park-kaziranga.svg", [435, 200], "Marked national park");
indiaMap("park-sundarbans.svg", [365, 272], "Marked national park");
indiaMap("state-rajasthan.svg", [150, 222], "Marked state");
indiaMap("state-kerala.svg", [220, 535], "Marked state");
worldMap("world-japan.svg", [545, 142], "Marked country");
worldMap("world-brazil.svg", [183, 262], "Marked country");
worldMap("world-australia.svg", [540, 322], "Marked country");
console.log("maps generated");
