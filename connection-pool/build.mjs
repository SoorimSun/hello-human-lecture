// node connection-pool/build.mjs  →  connection-pool/index.html (단일 HTML)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../.claude/skills/anatomy/kit/iso-kit.mjs";
import * as G from "../.claude/skills/anatomy/kit/lathe.mjs";
import { kitScript } from "../.claude/skills/anatomy/scripts/inline-kit.mjs";
import { POOL_SIZE, TIMEOUT } from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const W = 760;
const H = 340;

// ── 세계 좌표(단위 ≈ 1px). x 오른쪽 안, y 앞쪽, z 위 ─────────────────────────
const BASE = { x: -250, y: -110, w: 472, d: 150, r: 10 };
const PLATE_H = 12;
const FOOT_H = 7;

const DECK = { x: -186, y: -98, w: 326, d: 46, r: 3 };
const DECK_TOP = 26;
const BELT0 = -160;
const BELT1 = 130;
const BELT_Y = -74;
const BELT_HALF = 12;
const BELT_TOP = 34;
const ROLLER_R = 4;
const START = -154;
const FINISH = 126;
const SPEED = (FINISH - START) / TIMEOUT;

const MAG = { x: -186, y: -90, w: 18, d: 32, r: 1.5 };
const MAG_TOP = 58;

const BIN = { x: 142, y: -100, w: 58, d: 52, r: 2 };
const BIN_H = 24;
const BIN_WALL = 3;

const DB = { cx: -214, cy: -34, r: 22 };
const DB_TOP = 47;

const DUCT = { x: -192.4, y: -38, w: 334.4, d: 8, r: 1 };
const DUCT_H = 12;

const RACK = { x: -142, y: -28, w: 284, d: 34, r: 2 };
const RACK_H = 6;
const PITCH = 28;
const BAYS = Array.from({ length: POOL_SIZE }, (_, i) => -126 + PITCH * i);
const BAY_Y = -10;
const PAD_TOP = 24.4;

const TROUGH = { x: -142, y: 10, w: 284, d: 22, r: 1.5 };
const TROUGH_H = 8;

const CON = { x: 150, y: -12, w: 60, d: 46, r: 4 };
const CON_H = 16;
const KNOBS = { rate: [166, 4], hold: [194, 4] };
const SWITCH = [170, 23];
const BUTTON = [194, 23];

const CARD = { x: -0.8, y: -7, w: 1.6, d: 14, r: 0.3 };
const CARD_H = 16;

const RATE = { min: 1, max: 40, step: 1, value: 10 };
const HOLD = { min: 0.2, max: 4, step: 0.1, value: 0.8 };
const DIAL_FROM = (-3 * Math.PI) / 4;
const DIAL_SPAN = (3 * Math.PI) / 2;

const P = k.fitProjection(
  [
    ...k.boxCorners(BASE, -PLATE_H - FOOT_H, 0),
    [DB.cx - DB.r, DB.cy, DB_TOP + 2],
    [MAG.x, MAG.y, MAG_TOP],
    [MAG.x + MAG.w, MAG.y + MAG.d, MAG_TOP],
    [0, -40, 64],
  ],
  W,
  H,
  { pad: 22, azimuth: 62, elevation: 32 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const slab = (plan, z, h, steps = 3, bevel = 0) => k.slabOf(plan, z, h, P, steps, bevel);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const fix = (value) => Math.round(value * 100) / 100;

// 수직면 위의 평면 좌표: y = 상수인 앞면은 (u, v) = (x, -z), x = 상수인 옆면은 (u, v) = (-y, -z)
const frontPlane = (y) => k.sideMatrix([0, y], 0, P, "left");
const sidePlane = (x) => k.sideMatrix([x, 0], 0, P, "right");
const roundRect = (u, v, w, h, r) => `<rect x="${fix(u)}" y="${fix(v)}" width="${fix(w)}" height="${fix(h)}" rx="${r}"/>`;

// 받침대: 다리, 상판, 홈, 모서리 나사, 명판
function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BASE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(BASE, 26))) {
    out.push(S(k.cylinder(x, y, 8, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6.2, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(slab(BASE, -PLATE_H, PLATE_H, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(BASE, -PLATE_H + 3, P, 8), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(BASE, 6), 0, P), { tone: "lo" }));
  const screws = k.corners(BASE, 12);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // 바닥 고정 볼트: 덱과 랙 앞뒤
  const anchors = [[-120, -49], [-20, -49], [80, -49], [-150, 8], [150, -15]];
  out.push(L(anchors.map(([x, y]) => k.ring(x, y, 1.6, 0, P, 12)).join(""), { tone: "faint" }));
  out.push(D(anchors.map(([x, y]) => at([x, y, 0])), { size: 0.4, tone: "lo" }));
  return out.join("");
}

function labelPlate() {
  const plan = { x: -240, y: 20, w: 40, d: 15, r: 1.2 };
  const out = [S(slab(plan, 0, 0.8, 3), { tone: "lo", crease: "none" })];
  out.push(L(k.planOutline(k.insetPlan(plan, 1.6), 0.8, P, 3), { tone: "faint" }));
  const rules = [[plan.x + 5, plan.x + 30], [plan.x + 5, plan.x + 24], [plan.x + 5, plan.x + 33]];
  rules.forEach(([from, to], row) => out.push(L(k.lineOnTop([from, plan.y + 4.6 + row * 3], [to, plan.y + 4.6 + row * 3], 0.8, P), { tone: "lo", free: true })));
  out.push(D([at([plan.x + 2.6, plan.y + plan.d / 2, 0.8]), at([plan.x + plan.w - 2.6, plan.y + plan.d / 2, 0.8])], { size: 0.45 }));
  return out.join("");
}

// 뒤쪽 단: 받침 상자, 점검 덮개, 대기 시간 눈금자
function deck() {
  const out = [S(slab(DECK, 0, DECK_TOP, 4, 1.2), { tone: "mid", inner: L(k.sideSeam(DECK, 3.5, P, 4), { tone: "faint" }) })];
  const face = DECK.y + DECK.d;
  const panels = [[-176, -96], [-60, 24], [52, 128]];
  const outline = panels.map(([from, to]) => roundRect(from, -20, to - from, 13, 1.2)).join("");
  const screws = panels.flatMap(([from, to]) => [[from + 2.6, -17.4], [to - 2.6, -17.4], [from + 2.6, -9.6], [to - 2.6, -9.6]]);
  out.push(`<g transform="${frontPlane(face)}"><g class="pool-face-line">${outline}</g>${screws.map(([u, v]) => `<circle class="pool-screw" cx="${u}" cy="${v}" r="0.5"/>`).join("")}</g>`);
  out.push(D([at([DECK.x + 4, DECK.y + 4, DECK_TOP]), at([DECK.x + DECK.w - 4, DECK.y + 4, DECK_TOP]), at([DECK.x + 4, face - 3, DECK_TOP]), at([DECK.x + DECK.w - 4, face - 3, DECK_TOP])], { size: 0.45 }));
  // 눈금자: 0초(투입)에서 2초(통) 끝까지, 0.1초마다 눈금, 0.5초마다 큰 눈금
  const strip = { x: START - 3, y: -57.6, w: FINISH - START + 6, d: 5, r: 0.8 };
  out.push(S(slab(strip, DECK_TOP, 0.5, 3), { tone: "lo", crease: "none" }));
  const minor = [];
  const major = [];
  for (let tick = 0; tick <= TIMEOUT * 10 + 1e-9; tick++) {
    const x = START + (tick / (TIMEOUT * 10)) * (FINISH - START);
    const big = tick % 5 === 0;
    (big ? major : minor).push(k.lineOnTop([x, strip.y], [x, strip.y + (big ? 3.6 : 1.9)], DECK_TOP + 0.5, P));
  }
  out.push(L(minor.join(""), { tone: "lo" }), L(major.join(""), { tone: "mid" }));
  out.push(L(k.lineOnTop([FINISH, strip.y], [FINISH, strip.y + strip.d], DECK_TOP + 0.5, P), { tone: "hi" }));
  return out.join("");
}

// 대기 컨베이어: 옆판, 롤러, 벨트, 베어링, 매거진
const rollerFrame = (x) => G.frameAlong([x, BELT_Y - BELT_HALF, BELT_TOP - ROLLER_R], [0, 1, 0]);

function conveyorBack() {
  const out = [];
  out.push(S(slab({ x: BELT0 - 6, y: BELT_Y - BELT_HALF - 4, w: BELT1 - BELT0 + 12, d: 4, r: 0.8 }, DECK_TOP, 7.4, 2, 0.4), { tone: "mid" }));
  out.push(S(G.disc(0, BELT_HALF * 2, ROLLER_R, rollerFrame(BELT0), P), { tone: "mid" }));
  out.push(S(slab({ x: BELT0, y: BELT_Y - BELT_HALF, w: BELT1 - BELT0, d: BELT_HALF * 2, r: 0 }, BELT_TOP - 4, 4, 1), { tone: "hi", crease: "lo" }));
  out.push(`<path class="iso-line" data-tone="faint" data-part="belt-marks" d=""/>`);
  return out.join("");
}

function conveyorFront() {
  const out = [];
  out.push(S(G.disc(0, BELT_HALF * 2, ROLLER_R, rollerFrame(BELT1), P), { tone: "hi", crease: "lo" }));
  const near = { x: BELT0 - 6, y: BELT_Y + BELT_HALF, w: BELT1 - BELT0 + 12, d: 4, r: 0.8 };
  out.push(S(slab(near, DECK_TOP, 7.4, 2, 0.4), { tone: "mid" }));
  const face = near.y + near.d;
  for (const x of [BELT0, BELT1]) {
    out.push(S(slab({ x: x - 4.5, y: face, w: 9, d: 1.4, r: 0.8 }, DECK_TOP + 0.6, 7.6, 2), { tone: "mid" }));
    const cap = G.frameAlong([x, face + 1.4, BELT_TOP - ROLLER_R], [0, 1, 0]);
    out.push(S(G.disc(0, 1.2, 2.2, cap, P), { tone: "mid" }));
    out.push(D([at([x, face + 2.6, BELT_TOP - ROLLER_R])], { size: 0.5 }));
    out.push(D([at([x - 3.2, face + 1.4, DECK_TOP + 6.6]), at([x + 3.2, face + 1.4, DECK_TOP + 6.6])], { size: 0.4 }));
  }
  // 옆판 중간 받침 나사
  out.push(D([-90, -20, 50].map((x) => at([x, face, DECK_TOP + 3.7])), { size: 0.45 }));
  return out.join("");
}

function magazine() {
  const out = [S(slab(MAG, DECK_TOP, MAG_TOP - DECK_TOP, 3, 0.8), { tone: "mid", inner: L(k.sideSeam(MAG, MAG_TOP - 6, P, 3), { tone: "faint" }) })];
  const mouth = k.insetPlan(MAG, 1.8);
  out.push(S(slab(mouth, MAG_TOP - 0.01, 0.01, 2), { tone: "lo", flat: true, crease: "none" }));
  const tops = [];
  for (let x = mouth.x + 1.4; x < mouth.x + mouth.w - 0.8; x += 1.6) tops.push(k.lineOnTop([x, mouth.y], [x, mouth.y + mouth.d], MAG_TOP, P));
  out.push(L(tops.join(""), { tone: "lo" }));
  out.push(L(k.planOutline(mouth, MAG_TOP, P, 2), { tone: "mid" }));
  // 오른쪽 면의 배출구: 카드 크기 그대로
  const exit = MAG.x + MAG.w;
  out.push(`<g transform="${sidePlane(exit)}"><g class="pool-face-line" data-tone="mid">${roundRect(-(BELT_Y + 7.4), -(BELT_TOP + CARD_H + 1), 14.8, CARD_H + 1.6, 0.8)}</g></g>`);
  // 앞면의 도착 카운터
  const face = MAG.y + MAG.d;
  out.push(`<g transform="${frontPlane(face)}">${counterWindow(MAG.x + 2, -(DECK_TOP + 24), MAG.w - 4, 6.4, "arrived")}<circle class="pool-screw" cx="${MAG.x + 3}" cy="${-(DECK_TOP + 4)}" r="0.5"/><circle class="pool-screw" cx="${MAG.x + MAG.w - 3}" cy="${-(DECK_TOP + 4)}" r="0.5"/></g>`);
  return out.join("");
}

// 기계가 표시하는 숫자 창(창 안으로 잘린다)
let clipCount = 0;
function counterWindow(u, v, w, h, part, tone = "") {
  const id = `pool-clip-${++clipCount}`;
  const size = Math.min(h * 0.72, (w - 1.6) / (4 * 0.66));
  return `<clipPath id="${id}">${roundRect(u + 0.3, v + 0.3, w - 0.6, h - 0.6, 0.8)}</clipPath><g class="pool-window">${roundRect(u, v, w, h, 1)}</g><g clip-path="url(#${id})"><text class="pool-digits"${tone ? ` data-tone="${tone}"` : ""} data-part="${part}" x="${fix(u + w / 2)}" y="${fix(v + h / 2 + size * 0.36)}" font-size="${fix(size)}" text-anchor="middle">0000</text></g>`;
}

// 타임아웃 통: 뒤·왼쪽 벽 → (떨어진 카드) → 오른쪽·앞 벽
function binBack() {
  const out = [S(slab(BIN, 0, BIN_WALL, 2, 0.4), { tone: "lo" })];
  out.push(S(slab({ x: BIN.x, y: BIN.y, w: BIN.w, d: BIN_WALL, r: 0.8 }, BIN_WALL, BIN_H - BIN_WALL, 2, 0.4), { tone: "mid" }));
  out.push(S(slab({ x: BIN.x, y: BIN.y + BIN_WALL, w: BIN_WALL, d: BIN.d - BIN_WALL * 2, r: 0.4 }, BIN_WALL, BIN_H - BIN_WALL, 2, 0.4), { tone: "mid" }));
  out.push(`<g data-part="pile"></g>`);
  return out.join("");
}

function binFront() {
  const out = [];
  out.push(S(slab({ x: BIN.x + BIN.w - BIN_WALL, y: BIN.y + BIN_WALL, w: BIN_WALL, d: BIN.d - BIN_WALL * 2, r: 0.4 }, BIN_WALL, BIN_H - BIN_WALL, 2, 0.4), { tone: "mid" }));
  const front = { x: BIN.x, y: BIN.y + BIN.d - BIN_WALL, w: BIN.w, d: BIN_WALL, r: 0.8 };
  out.push(S(slab(front, 0, BIN_H, 2, 0.4), { tone: "mid", inner: L(k.sideSeam(front, BIN_WALL, P, 2), { tone: "faint" }) }));
  const face = front.y + front.d;
  out.push(`<g transform="${frontPlane(face)}">${counterWindow(BIN.x + 18, -(BIN_H - 3.4), 22, 7.6, "timeouts", "red")}${[[BIN.x + 4, -6], [BIN.x + BIN.w - 4, -6], [BIN.x + 4, -(BIN_H - 4)], [BIN.x + BIN.w - 4, -(BIN_H - 4)]].map(([u, v]) => `<circle class="pool-screw" cx="${u}" cy="${v}" r="0.5"/>`).join("")}</g>`);
  out.push(D([[BIN.x + 1.5, BIN.y + 1.5], [BIN.x + BIN.w - 1.5, BIN.y + 1.5], [BIN.x + 1.5, BIN.y + BIN.d - 1.5], [BIN.x + BIN.w - 1.5, BIN.y + BIN.d - 1.5]].map(([x, y]) => at([x, y, BIN_H])), { size: 0.4 }));
  return out.join("");
}

// DB 드럼: 받침, 몸통(띠 두 줄), 뚜껑, 볼트, 상태 램프, 각인
function database() {
  const { cx, cy, r } = DB;
  const out = [S(k.cylinder(cx, cy, r + 3, 0, 3, P, 72), { tone: "lo" })];
  const bands = [16, 30].map((z) => k.sideArc(cx, cy, r, z, P, 48)).join("");
  out.push(S(k.cylinder(cx, cy, r, 3, DB_TOP - 3 - 3, P, 72), { tone: "mid", inner: L(bands, { tone: "lo" }) }));
  out.push(S(k.cylinder(cx, cy, r + 1, DB_TOP - 3, 3, P, 72, 0.8), { tone: "mid" }));
  out.push(L(k.ring(cx, cy, r - 3.2, DB_TOP, P, 72), { tone: "faint" }));
  const bolts = Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2;
    return at([cx + Math.cos(angle) * (r - 1.2), cy + Math.sin(angle) * (r - 1.2), DB_TOP]);
  });
  out.push(D(bolts, { size: 0.45 }));
  out.push(k.faceTextSvg(k.topMatrix([cx - 1, cy + 3.4], DB_TOP, P, "x"), "DB", { size: 10, tone: "mid", anchor: "middle" }));
  out.push(S(k.cylinder(cx + 9, cy - 10, 2.2, DB_TOP, 1.2, P, 20), { tone: "mid" }));
  out.push(S(k.cylinder(cx + 9, cy - 10, 1.3, DB_TOP + 1.2, 1, P, 16), { tone: "hi", crease: "lo" }));
  return out.join("");
}

// 배선 덕트와 칸 뒤의 단자
function duct() {
  const out = [S(slab(DUCT, 0, DUCT_H, 2, 0.6), { tone: "mid", inner: L(k.sideSeam(DUCT, DUCT_H - 2.4, P, 2), { tone: "faint" }) })];
  // DB 쪽 글랜드(관통 칼라)와 반대쪽 끝 마개
  out.push(S(slab({ x: DUCT.x, y: DUCT.y - 1.4, w: 5, d: DUCT.d + 2.8, r: 0.6 }, 0, DUCT_H + 1.6, 2, 0.4), { tone: "mid" }));
  out.push(D([at([DUCT.x + 2.5, DUCT.y + 0.4, DUCT_H + 1.6]), at([DUCT.x + 2.5, DUCT.y + DUCT.d - 0.4, DUCT_H + 1.6])], { size: 0.4 }));
  out.push(S(slab({ x: DUCT.x + DUCT.w - 2, y: DUCT.y - 0.6, w: 2, d: DUCT.d + 1.2, r: 0.4 }, 0, DUCT_H + 0.8, 2, 0.3), { tone: "mid" }));
  const screws = [];
  for (let x = -170; x < 140; x += 38) screws.push(at([x, DUCT.y + DUCT.d / 2, DUCT_H]));
  out.push(D(screws, { size: 0.45 }));
  return out.join("");
}

function rack() {
  const out = [S(slab(RACK, 0, RACK_H, 3, 0.8), { tone: "mid", inner: L(k.sideSeam(RACK, 2, P, 3), { tone: "faint" }) })];
  out.push(D([[RACK.x + 4, RACK.y + 4], [RACK.x + RACK.w - 4, RACK.y + 4], [RACK.x + 4, RACK.y + RACK.d - 3], [RACK.x + RACK.w - 4, RACK.y + RACK.d - 3]].map(([x, y]) => at([x, y, RACK_H])), { size: 0.45 }));
  for (const x of BAYS) {
    out.push(S(slab({ x: x - 2.2, y: DUCT.y + DUCT.d, w: 4.4, d: -20 - (DUCT.y + DUCT.d), r: 0.6 }, RACK_H, 4.2, 2, 0.3), { tone: "mid" }));
  }
  for (const x of BAYS) {
    const plan = { x: x - 10, y: -20, w: 20, d: 20, r: 1.5 };
    out.push(S(slab(plan, RACK_H, PAD_TOP - 0.4 - RACK_H, 3, 0.6), { tone: "mid" }));
    out.push(S(slab({ x: x - 8, y: -18, w: 16, d: 16, r: 1 }, PAD_TOP - 0.4, 0.4, 2), { tone: "lo", crease: "none" }));
    out.push(S(slab({ x: x - 3, y: -19.4, w: 6, d: 1.6, r: 0.4 }, PAD_TOP, 6.4, 2, 0.3), { tone: "mid" }));
    out.push(D([[x - 9, -19], [x + 9, -19], [x - 9, -1], [x + 9, -1]].map(([sx, sy]) => at([sx, sy, PAD_TOP - 0.4])), { size: 0.4 }));
    // 칸 오른쪽 면의 커넥터: 케이블이 랙 받침(배선 덕트 쪽)으로 내려간다
    const side = x + 10;
    out.push(S(k.cylinder(side + 1.9, -11, 0.85, RACK_H, 5.4, P, 14), { tone: "mid", crease: "none" }));
    out.push(S(slab({ x: side, y: -14.6, w: 3.4, d: 7.2, r: 0.6 }, RACK_H + 5.2, 5.6, 2, 0.3), { tone: "mid" }));
    out.push(D([at([side + 3.4, -11, RACK_H + 8])], { size: 0.45 }));
  }
  // 칸 앞면: 램프와 진행 막대(같은 평면 y = 0)
  const faces = BAYS.map((x, conn) => {
    const lamp = `<circle class="pool-bezel" cx="${x - 5}" cy="-15" r="2.9"/><circle class="pool-lamp" data-conn="${conn}" cx="${x - 5}" cy="-15" r="2"/>`;
    const slot = `<g class="pool-face-line">${roundRect(x - 1, -16.5, 8.4, 3, 1.4)}</g><rect class="pool-bar" data-conn="${conn}" x="${x - 0.4}" y="-15.6" width="0" height="1.2" rx="0.6"/>`;
    const screws = [[x - 8.4, -8.4], [x + 8.4, -8.4], [x - 8.4, -21.6], [x + 8.4, -21.6]].map(([u, v]) => `<circle class="pool-screw" cx="${u}" cy="${v}" r="0.42"/>`).join("");
    return lamp + slot + screws;
  });
  out.push(`<g transform="${frontPlane(0)}">${faces.join("")}</g>`);
  return out.join("");
}

function troughBack() {
  const out = [S(slab(TROUGH, 0, 2, 3), { tone: "lo" })];
  out.push(S(slab({ x: TROUGH.x, y: TROUGH.y, w: TROUGH.w, d: 2.4, r: 0.6 }, 2, TROUGH_H - 2, 2, 0.3), { tone: "mid" }));
  out.push(S(slab({ x: TROUGH.x, y: TROUGH.y + 2.4, w: 2.4, d: TROUGH.d - 4.8, r: 0.4 }, 2, TROUGH_H - 2, 2, 0.3), { tone: "mid" }));
  return out.join("");
}

function troughFront() {
  const out = [S(slab({ x: TROUGH.x + TROUGH.w - 2.4, y: TROUGH.y + 2.4, w: 2.4, d: TROUGH.d - 4.8, r: 0.4 }, 2, TROUGH_H - 2, 2, 0.3), { tone: "mid" })];
  const front = { x: TROUGH.x, y: TROUGH.y + TROUGH.d - 2.4, w: TROUGH.w, d: 2.4, r: 0.6 };
  out.push(S(slab(front, 2, TROUGH_H - 2, 2, 0.3), { tone: "mid" }));
  const rivets = [];
  for (let x = TROUGH.x + 8; x < TROUGH.x + TROUGH.w - 4; x += 23.5) rivets.push(at([x, TROUGH.y + TROUGH.d, 5]));
  out.push(D(rivets, { size: 0.42 }));
  return out.join("");
}

// 조작함: 손잡이 둘(유입량, 처리 시간), 일시정지 스위치, 초기화 버튼, 명판
const dialAngle = (range, value) => DIAL_FROM + ((value - range.min) / (range.max - range.min)) * DIAL_SPAN;
const pointerOf = ([cx, cy], angle) => k.lineOnTop([cx - Math.sin(angle) * 1.6, cy + Math.cos(angle) * 1.6], [cx + Math.sin(angle) * 5.2, cy - Math.cos(angle) * 5.2], CON_H + 6.4, P);

function switchLever(lean) {
  const root = [SWITCH[0], SWITCH[1], CON_H + 1.4];
  const dir = G.unit3([0, lean * 0.55, 1]);
  const tip = G.add3(root, G.mul3(dir, 6));
  return S(G.disc(0, 6, 0.75, G.frameAlong(root, dir), P), { tone: "hi", crease: "lo" }) + S(G.sphereOf(tip, 1.35, P), { tone: "hi" });
}

function buttonCap(down) {
  const [x, y] = BUTTON;
  return S(k.cylinder(x, y, 3.3, CON_H + 1.2, down ? 0.7 : 2.2, P, 28, 0.4), { tone: "hi", crease: "lo" });
}

function controls() {
  const out = [S(slab(CON, 0, CON_H, 6, 1), { tone: "mid", inner: L(k.sideSeam(CON, 3, P, 6), { tone: "faint" }) })];
  out.push(L(k.planOutline(k.insetPlan(CON, 3.4), CON_H, P, 4), { tone: "faint" }));
  out.push(D(k.corners(CON, 5.6).map(([x, y]) => at([x, y, CON_H])), { size: 0.5 }));
  for (const [name, [cx, cy]] of Object.entries(KNOBS)) {
    const range = name === "rate" ? RATE : HOLD;
    const ticks = k.radialTicks(cx, cy, 10.6, 24, 4, CON_H, [1.1, 2.3], P, DIAL_FROM, DIAL_SPAN);
    out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
    out.push(S(k.cylinder(cx, cy, 7.4, CON_H, 1.4, P, 36), { tone: "lo" }));
    out.push(S(k.cylinder(cx, cy, 6, CON_H + 1.4, 5, P, 36, 0.5), { tone: "hi", crease: "lo" }));
    out.push(L(k.knurl(cx, cy, 6, CON_H + 1.4, CON_H + 6.4, 40, P), { tone: "lo" }));
    out.push(`<path class="iso-line" data-tone="lit" data-free="end" data-part="pointer-${name}" style="stroke-width:1.1" d="${pointerOf([cx, cy], dialAngle(range, range.value))}"/>`);
    out.push(D([at([cx, cy, CON_H + 6.4])], { size: 0.55, tone: "hi" }));
  }
  const [sx, sy] = SWITCH;
  out.push(S(k.cylinder(sx, sy, 4.2, CON_H, 1.4, P, 28), { tone: "lo" }));
  out.push(L(k.lineOnTop([sx, sy - 5.6], [sx, sy - 7.4], CON_H, P) + k.lineOnTop([sx, sy + 5.6], [sx, sy + 7.4], CON_H, P), { tone: "mid" }));
  out.push(`<g data-part="switch-run">${switchLever(-1)}</g><g data-part="switch-pause" style="display:none">${switchLever(1)}</g>`);
  const [bx, by] = BUTTON;
  out.push(S(k.cylinder(bx, by, 4.8, CON_H, 1.2, P, 32), { tone: "lo" }));
  out.push(`<g data-part="button-up">${buttonCap(false)}</g><g data-part="button-down" style="display:none">${buttonCap(true)}</g>`);
  const face = CON.y + CON.d;
  const plate = `<g class="pool-face-line">${roundRect(CON.x + 8, -12.6, 30, 8, 1)}</g>`;
  const rules = [[CON.x + 11, CON.x + 30], [CON.x + 11, CON.x + 25]].map(([from, to], row) => `<path class="iso-line" data-tone="lo" data-free="" d="M${from} ${-10.2 + row * 3}H${to}"/>`).join("");
  out.push(`<g transform="${frontPlane(face)}">${plate}${rules}<circle class="pool-screw" cx="${CON.x + 9.8}" cy="-8.6" r="0.45"/><circle class="pool-screw" cx="${CON.x + 36.2}" cy="-8.6" r="0.45"/></g>`);
  return out.join("");
}

// 요청 카드: 원점에 한 번 만들고 translate로 옮긴다
function cardProto() {
  const face = 0.8;
  const rules = [[-5, 4.4, 12.6], [-5, 2, 9.8], [-5, 3.4, 7.6], [-5, -0.6, 5.4]];
  const inner = rules.map(([from, to, z]) => k.segment([face, from, z], [face, to, z], P)).join("");
  return S(slab(CARD, 0, CARD_H, 2), { tone: "hi", crease: "lo", inner: L(inner, { tone: "lo", free: true }) });
}

const svg = k.figureSvg({
  width: W,
  height: H,
  className: "pool-svg",
  label:
    "교육용 단순 모델로 만든 커넥션 풀 작업대. 뒤쪽 높은 단의 컨베이어는 대기열이며 길이가 정확히 2초다. 요청 카드는 왼쪽 매거진에서 나와 기다린 시간만큼 오른쪽으로 이동하고, 끝에 닿으면 타임아웃 통으로 떨어진다. 앞쪽 단의 칸 10개가 커넥션 10개이며 각 칸은 덕트로 DB 드럼에 연결되어 있다. 커넥션을 얻은 카드는 빈 칸으로 옮겨 가 처리 시간 동안 머문 뒤 완료 트레이로 나가고, 칸은 다음 요청에게 돌아간다.",
  body: [
    `<defs><g id="pool-card">${cardProto()}</g></defs>`,
    base(),
    labelPlate(),
    deck(),
    conveyorBack(),
    magazine(),
    conveyorFront(),
    binBack(),
    `<g data-layer="bin"></g>`,
    binFront(),
    duct(),
    database(),
    rack(),
    troughBack(),
    `<g data-layer="trough"></g>`,
    troughFront(),
    controls(),
    `<g data-layer="cards"></g>`,
  ],
});

// ── 실시간 코드에 넘길 값 ────────────────────────────────────────────────
const DATA = {
  P,
  POOL_SIZE,
  TIMEOUT,
  START,
  FINISH,
  SPEED,
  BELT0,
  BELT1,
  BELT_Y,
  BELT_HALF,
  BELT_TOP,
  BAYS,
  BAY_Y,
  PAD_TOP,
  CARD_H,
  TROUGH_FLOOR: 2,
  TROUGH_RIM: TROUGH_H,
  TROUGH_Y: TROUGH.y + TROUGH.d / 2,
  BIN_FLOOR: BIN_WALL,
  BIN_RIM: BIN_H,
  BIN_INNER_X: BIN.x + BIN_WALL + 1,
  PILE: { x: BIN.x + BIN_WALL + 0.6, y: BIN.y + BIN_WALL + 0.6, w: BIN.w - BIN_WALL * 2 - 1.2, d: BIN.d - BIN_WALL * 2 - 1.2, r: 0.6 },
  PILE_MAX: BIN_H - BIN_WALL - 6,
  KNOBS,
  CON_H,
  RATE,
  HOLD,
  DIAL_FROM,
  DIAL_SPAN,
};

const model = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const live = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", () => JSON.stringify(DATA));
const script = (kitScript() + "\n" + model + "\n" + live).replace(/<\/(script)/gi, "<\\/$1");
const page = readFileSync(join(HERE, "page.html"), "utf8")
  .replace("/*__ISO_CSS__*/", () => k.ISO_CSS)
  .replace("<!--__FIGURE__-->", () => svg)
  .replace("/*__SCRIPT__*/", () => script);

writeFileSync(join(HERE, "index.html"), page);
console.log(`wrote connection-pool/index.html · ${(page.length / 1024).toFixed(0)} KB · scale ${P.scale.toFixed(3)}`);
