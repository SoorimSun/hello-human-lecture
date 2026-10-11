// 화면 쪽 코드. 모든 수치와 움직임은 위에 인라인된 model.mjs의 pool 하나에서 나온다.
const D = __DATA__;
const P = D.P;
const GRAVITY = 640;
const FADE_IN = 0.14;
const FADE_OUT = 0.2;
const SLIDE = 0.12;

const stage = document.querySelector("[data-stage]");
const svg = stage.querySelector("svg");
const layer = {
  cards: svg.querySelector('[data-layer="cards"]'),
  trough: svg.querySelector('[data-layer="trough"]'),
  bin: svg.querySelector('[data-layer="bin"]'),
};
const proto = svg.querySelector("#pool-card");
const beltMarks = svg.querySelector('[data-part="belt-marks"]');
const lamps = [...svg.querySelectorAll(".pool-lamp")];
const bars = [...svg.querySelectorAll(".pool-bar")];
const pileHost = svg.querySelector('[data-part="pile"]');
const counters = { timeouts: svg.querySelector('[data-part="timeouts"]'), arrived: svg.querySelector('[data-part="arrived"]') };
const pointers = { rate: svg.querySelector('[data-part="pointer-rate"]'), hold: svg.querySelector('[data-part="pointer-hold"]') };
const lever = { run: svg.querySelector('[data-part="switch-run"]'), pause: svg.querySelector('[data-part="switch-pause"]') };
const cap = { up: svg.querySelector('[data-part="button-up"]'), down: svg.querySelector('[data-part="button-down"]') };

const ui = {
  rate: document.getElementById("rate"),
  hold: document.getElementById("hold"),
  rateOut: document.querySelector('[data-out="rate"]'),
  holdOut: document.querySelector('[data-out="hold"]'),
  pause: document.querySelector('[data-action="pause"]'),
  reset: document.querySelector('[data-action="reset"]'),
  presets: [...document.querySelectorAll("[data-preset]")],
  stats: Object.fromEntries([...document.querySelectorAll("[data-stat]")].map((el) => [el.dataset.stat, el])),
  sum: document.querySelector("[data-sum]"),
  check: document.querySelector("[data-check]"),
  demand: document.querySelector("[data-demand]"),
  status: document.querySelector("[data-status]"),
  readout: document.querySelector("[data-readout]"),
  announce: document.querySelector("[data-announce]"),
  clock: document.querySelector("[data-clock]"),
};

const still = matchMedia("(prefers-reduced-motion: reduce)");
const pool = createPool({ rate: Number(ui.rate.value), hold: Number(ui.hold.value) });
const cards = new Map();
const recentTimeouts = [];
let landed = 0;
let checks = 0;
let broken = [];
let paused = false;
let visible = true;
let frame = 0;
let last = 0;
let pressUntil = 0;
let lastAnnounced = "";

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const ease = (t) => t * t * (3 - 2 * t);
const smoothIn = (from, to, value) => ease(clamp((value - from) / (to - from), 0, 1));
const beltX = (waited) => D.START + (waited / D.TIMEOUT) * (D.FINISH - D.START);
const pileHeight = (count) => Math.min(D.PILE_MAX, count * 0.06);
const binFloor = () => D.BIN_FLOOR + pileHeight(landed);

function addCard(event) {
  const el = proto.cloneNode(true);
  el.removeAttribute("id");
  el.setAttribute("class", "pool-card");
  layer.cards.appendChild(el);
  cards.set(event.id, { id: event.id, el, host: "cards", phase: "wait", arrivedAt: event.at, alpha: -1, moved: "" });
}

function onEvent(event) {
  const card = cards.get(event.id);
  if (event.type === "arrive") addCard(event);
  else if (event.type === "grant" && card) {
    Object.assign(card, {
      phase: "fly",
      conn: event.conn,
      grantedAt: event.at,
      releaseAt: event.releaseAt,
      from: [beltX(event.at - card.arrivedAt), D.BELT_Y, D.BELT_TOP],
      flight: Math.min(0.34, (event.releaseAt - event.at) / 2),
    });
  } else if (event.type === "release" && card) {
    card.phase = "eject";
    card.releasedAt = event.at;
  } else if (event.type === "timeout" && card) {
    card.phase = "fall";
    card.fellAt = event.at;
    card.el.setAttribute("data-state", "timeout");
    recentTimeouts.push(event.at);
  }
  checks++;
  const problems = invariantsOf(pool);
  if (problems.length && !broken.length) broken = problems;
}

// 모델 시각 now에서 카드가 놓인 곳. 위치는 모델의 시각들(도착·획득·반환·타임아웃)로만 정한다.
function poseOf(card, now) {
  const calm = still.matches;
  const fadeIn = calm ? 1 : smoothIn(0, FADE_IN, now - card.arrivedAt);
  if (card.phase === "wait") {
    return { at: [beltX(now - card.arrivedAt), D.BELT_Y, D.BELT_TOP + 5 * (1 - fadeIn)], alpha: fadeIn, host: "cards" };
  }
  if (card.phase === "fly") {
    const to = [D.BAYS[card.conn], D.BAY_Y, D.PAD_TOP];
    const share = calm ? 1 : clamp((now - card.grantedAt) / card.flight, 0, 1);
    const s = ease(share);
    const at = [0, 1, 2].map((axis) => card.from[axis] + (to[axis] - card.from[axis]) * s);
    at[2] += 16 * Math.sin(Math.PI * s);
    return { at, alpha: fadeIn, host: "cards" };
  }
  if (card.phase === "eject") {
    const age = now - card.releasedAt;
    if (calm) return { gone: true };
    const x = D.BAYS[card.conn];
    if (age < SLIDE) return { at: [x, D.BAY_Y + 18 * ease(age / SLIDE), D.PAD_TOP], alpha: 1, host: "cards" };
    const t = age - SLIDE;
    const z = Math.max(D.TROUGH_FLOOR, D.PAD_TOP - 0.5 * GRAVITY * t * t);
    const y = Math.min(D.TROUGH_Y, D.BAY_Y + 18 + 46 * t);
    const landedAt = Math.sqrt((2 * (D.PAD_TOP - D.TROUGH_FLOOR)) / GRAVITY);
    const alpha = 1 - smoothIn(landedAt, landedAt + FADE_OUT, t);
    return { at: [x, y, z], alpha, host: z < D.TROUGH_RIM ? "trough" : "cards", gone: t > landedAt + FADE_OUT };
  }
  // 타임아웃: 벨트 끝에서 벨트 속도 그대로 앞으로 나가며 통 안으로 떨어진다.
  const t = now - card.fellAt;
  const floor = binFloor();
  const fallTime = Math.sqrt((2 * (D.BELT_TOP - floor)) / GRAVITY);
  if (calm) return { gone: true, landed: true };
  const x = Math.min(D.FINISH + D.SPEED * t, D.PILE.x + D.PILE.w - 2);
  const z = Math.max(floor, D.BELT_TOP - 0.5 * GRAVITY * t * t);
  const alpha = 1 - smoothIn(fallTime, fallTime + FADE_OUT, t);
  return { at: [x, D.BELT_Y, z], alpha, host: z < D.BIN_RIM && x - 0.8 > D.BIN_INNER_X ? "bin" : "cards", landed: t >= fallTime, gone: t > fallTime + FADE_OUT };
}

let pileShown = -1;
function drawPile() {
  const height = Math.round(pileHeight(landed) * 5) / 5;
  if (height === pileShown) return;
  pileShown = height;
  pileHost.innerHTML = height > 0 ? solidSvg(slabOf(D.PILE, D.BIN_FLOOR, height, P, 2), { tone: "lo", crease: "faint" }) : "";
}

function drawCards(now) {
  const order = [];
  for (const card of [...cards.values()]) {
    const pose = poseOf(card, now);
    if (pose.landed && !card.counted && card.phase === "fall") {
      card.counted = true;
      landed++;
    }
    if (pose.gone) {
      if (card.phase === "fall" && !card.counted) landed++;
      card.el.remove();
      cards.delete(card.id);
      continue;
    }
    if (card.host !== pose.host) {
      layer[pose.host].appendChild(card.el);
      card.host = pose.host;
    }
    const moved = translateAlong(P, pose.at);
    if (moved !== card.moved) {
      card.el.setAttribute("transform", moved);
      card.moved = moved;
    }
    const alpha = Math.round(pose.alpha * 100) / 100;
    if (alpha !== card.alpha) {
      card.el.style.opacity = alpha >= 1 ? "" : String(alpha);
      card.alpha = alpha;
    }
    if (pose.host === "cards") order.push([depthOf([pose.at[0], pose.at[1], pose.at[2] + D.CARD_H / 2], P), card.el]);
  }
  order.sort((a, b) => a[0] - b[0]);
  const children = layer.cards.children;
  let same = children.length === order.length;
  for (let i = 0; same && i < order.length; i++) same = children[i] === order[i][1];
  if (!same) {
    const fragment = document.createDocumentFragment();
    for (const [, el] of order) fragment.appendChild(el);
    layer.cards.appendChild(fragment);
  }
}

function drawBelt(now) {
  const pitch = 14;
  const offset = still.matches ? 0 : (now * D.SPEED) % pitch;
  const lines = [];
  for (let x = D.BELT0 + offset; x <= D.BELT1; x += pitch) lines.push(lineOnTop([x, D.BELT_Y - D.BELT_HALF], [x, D.BELT_Y + D.BELT_HALF], D.BELT_TOP, P));
  beltMarks.setAttribute("d", lines.join(""));
}

function drawBays(now) {
  for (let conn = 0; conn < D.POOL_SIZE; conn++) {
    const held = pool.busy.get(conn);
    const busy = Boolean(held);
    if (lamps[conn].hasAttribute("data-busy") !== busy) lamps[conn].toggleAttribute("data-busy", busy);
    const share = held ? clamp((now - held.grantedAt) / (held.releaseAt - held.grantedAt), 0, 1) : 0;
    const width = (7.2 * share).toFixed(2);
    if (bars[conn].getAttribute("width") !== width) bars[conn].setAttribute("width", width);
  }
}

const text = (el, value) => {
  if (el && el.textContent !== value) el.textContent = value;
};
const four = (value) => String(value % 10000).padStart(4, "0");
const decimal = (value, digits = 1) => value.toFixed(digits);

function describe(s, timeoutRate) {
  if (timeoutRate > 0) return { tone: "fail", text: `타임아웃: 2초 안에 커넥션을 얻지 못한 요청이 실패하고 있습니다(최근 초당 ${decimal(timeoutRate)}건).` };
  if (s.waiting > 0) return { tone: "wait", text: "고갈: 커넥션 10개가 모두 사용 중이라 새 요청이 줄을 서서 기다립니다." };
  if (s.idle === 0) return { tone: "edge", text: "한계: 지금은 커넥션 10개가 모두 쓰이고 있습니다. 조금만 더 몰리면 대기가 생깁니다." };
  return { tone: "ok", text: `여유: 유휴 커넥션이 ${s.idle}개 남아 있어 요청이 기다리지 않습니다.` };
}

function drawNumbers(now) {
  const s = snapshot(pool);
  while (recentTimeouts.length && recentTimeouts[0] < now - 5) recentTimeouts.shift();
  const span = Math.min(5, Math.max(now, 1e-9));
  const timeoutRate = now > 0.5 ? recentTimeouts.length / span : 0;
  text(ui.stats.inUse, String(s.inUse));
  text(ui.stats.idle, String(s.idle));
  text(ui.stats.waiting, String(s.waiting));
  text(ui.stats.timedOut, String(s.timedOut));
  text(ui.stats.completed, String(s.completed));
  text(ui.stats.arrived, String(s.arrived));
  text(ui.sum, `사용 중 ${s.inUse} + 유휴 ${s.idle} = ${s.inUse + s.idle}`);
  const ok = !broken.length && s.inUse + s.idle === D.POOL_SIZE;
  ui.check.toggleAttribute("data-broken", !ok);
  text(ui.check, ok ? `✓ 모든 단계에서 확인 (${checks.toLocaleString("ko-KR")}회)` : `✗ 불변식 깨짐: ${broken.join(", ") || "사용 중 + 유휴 ≠ 10"}`);
  text(ui.readout, `사용 중 ${s.inUse} · 유휴 ${s.idle} · 대기 ${s.waiting} · 타임아웃 ${s.timedOut}`);
  text(ui.clock, `모델 시각 ${decimal(now)}초`);
  text(counters.timeouts, four(s.timedOut));
  text(counters.arrived, four(s.arrived));
  const state = describe(s, timeoutRate);
  if (ui.status.dataset.tone !== state.tone) ui.status.dataset.tone = state.tone;
  text(ui.status, state.text);
  const phase = state.text.slice(0, state.text.indexOf(":"));
  if (phase !== lastAnnounced) {
    lastAnnounced = phase;
    text(ui.announce, state.text);
  }
}

function drawSettings() {
  const rate = pool.rate;
  const hold = pool.hold;
  const demand = rate * hold;
  text(ui.rateOut, `${rate}건/초`);
  text(ui.holdOut, `${decimal(hold)}초`);
  text(ui.demand, `${rate}건/초 × ${decimal(hold)}초 = ${decimal(demand)}개`);
  const verdict = document.querySelector("[data-verdict]");
  verdict.dataset.tone = demand > D.POOL_SIZE + 1e-9 ? "over" : demand > D.POOL_SIZE * 0.85 ? "edge" : "ok";
  text(verdict, demand > D.POOL_SIZE + 1e-9 ? `보유 ${D.POOL_SIZE}개보다 많음 → 고갈` : demand > D.POOL_SIZE - 1e-9 ? `보유 ${D.POOL_SIZE}개와 같음 → 빠듯함` : `보유 ${D.POOL_SIZE}개 안쪽 → 여유`);
  for (const button of ui.presets) button.setAttribute("aria-pressed", String(Number(button.dataset.rate) === rate && Math.abs(Number(button.dataset.hold) - hold) < 1e-9));
}

// 조작함의 손잡이: 슬라이더 값으로 바늘 각도를 정하고 부드럽게 따라간다.
const knob = {
  rate: { range: D.RATE, angle: 0, target: 0 },
  hold: { range: D.HOLD, angle: 0, target: 0 },
};
const angleOf = (range, value) => D.DIAL_FROM + ((value - range.min) / (range.max - range.min)) * D.DIAL_SPAN;
const pointerOf = ([cx, cy], angle) => lineOnTop([cx - Math.sin(angle) * 1.6, cy + Math.cos(angle) * 1.6], [cx + Math.sin(angle) * 5.2, cy - Math.cos(angle) * 5.2], D.CON_H + 6.4, P);
function aimKnobs(jump) {
  knob.rate.target = angleOf(D.RATE, pool.rate);
  knob.hold.target = angleOf(D.HOLD, pool.hold);
  if (jump) for (const name of ["rate", "hold"]) knob[name].angle = knob[name].target;
}
function drawKnobs(dt) {
  let moving = false;
  for (const name of ["rate", "hold"]) {
    const state = knob[name];
    const before = state.angle;
    state.angle = still.matches ? state.target : state.angle + (state.target - state.angle) * (1 - Math.exp(-dt / 0.12));
    if (Math.abs(state.target - state.angle) < 1e-3) state.angle = state.target;
    if (state.angle !== before || !pointers[name].dataset.drawn) {
      pointers[name].setAttribute("d", pointerOf(D.KNOBS[name], state.angle));
      pointers[name].dataset.drawn = "1";
    }
    moving ||= state.angle !== state.target;
  }
  return moving;
}

function drawSwitches(wall) {
  lever.run.style.display = paused ? "none" : "";
  lever.pause.style.display = paused ? "" : "none";
  const pressed = wall < pressUntil;
  cap.up.style.display = pressed ? "none" : "";
  cap.down.style.display = pressed ? "" : "none";
  return pressed;
}

function render(dt, wall) {
  const now = pool.time;
  drawBelt(now);
  drawBays(now);
  drawCards(now);
  drawPile();
  drawNumbers(now);
  const turning = drawKnobs(dt);
  const pressing = drawSwitches(wall);
  return turning || pressing;
}

function tick(wall) {
  const dt = last ? Math.min((wall - last) / 1000, 1 / 30) : 1 / 60;
  last = wall;
  if (!paused) advance(pool, dt, onEvent);
  const busy = render(dt, wall);
  frame = visible && (!paused || busy) ? requestAnimationFrame(tick) : 0;
}

function run() {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
}

function setPaused(next) {
  paused = next;
  ui.pause.setAttribute("aria-pressed", String(paused));
  ui.pause.querySelector("[data-label]").textContent = paused ? "다시 시작" : "일시정지";
  stage.toggleAttribute("data-paused", paused);
  run();
}

function resetAll() {
  reset(pool);
  for (const card of cards.values()) card.el.remove();
  cards.clear();
  recentTimeouts.length = 0;
  landed = 0;
  checks = 0;
  broken = invariantsOf(pool);
  pressUntil = performance.now() + 180;
  lastAnnounced = "";
  render(0, performance.now());
  run();
}

function applySettings(jump = false) {
  setRate(pool, Number(ui.rate.value));
  setHold(pool, Math.round(Number(ui.hold.value) * 10) / 10);
  drawSettings();
  aimKnobs(jump);
  run();
}

ui.rate.addEventListener("input", () => applySettings());
ui.hold.addEventListener("input", () => applySettings());
for (const button of ui.presets) {
  button.addEventListener("click", () => {
    ui.rate.value = button.dataset.rate;
    ui.hold.value = button.dataset.hold;
    applySettings();
  });
}
ui.pause.addEventListener("click", () => setPaused(!paused));
ui.reset.addEventListener("click", resetAll);
stage.addEventListener("keydown", (event) => {
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    setPaused(!paused);
  } else if (event.key === "r" || event.key === "R") {
    resetAll();
  }
});
still.addEventListener?.("change", () => render(0, performance.now()));
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);

applySettings(true);
render(0, performance.now());
run();
