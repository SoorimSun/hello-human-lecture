// 교육용 단순 커넥션 풀 모델.
// 실제 데이터베이스나 특정 커넥션 풀 라이브러리의 내부 구현을 재현한 것이 아니다.
// 규칙: 커넥션 10개 고정, 요청 1건 = 커넥션 1개, 처리가 끝나면 반환,
// 모두 사용 중이면 FIFO로 대기, 2초 안에 못 얻으면 타임아웃.
// 요청은 일정한 간격(1 / 유입량)으로 도착하고, 처리 시간은 모든 요청에 같다.

export const POOL_SIZE = 10;
export const TIMEOUT = 2;

export function createPool({ rate = 8, hold = 1 } = {}) {
  return {
    rate,
    hold,
    time: 0,
    nextArrival: 0,
    lastArrival: null,
    nextId: 1,
    idle: Array.from({ length: POOL_SIZE }, (_, conn) => conn),
    busy: new Map(),
    queue: [],
    arrived: 0,
    granted: 0,
    completed: 0,
    timedOut: 0,
  };
}

export function reset(pool) {
  Object.assign(pool, createPool({ rate: pool.rate, hold: pool.hold }));
}

export function setRate(pool, rate) {
  pool.rate = rate;
  if (pool.lastArrival !== null) pool.nextArrival = Math.max(pool.time, pool.lastArrival + 1 / rate);
}

// 이미 커넥션을 쥔 요청은 원래 처리 시간대로 끝나고, 새로 커넥션을 얻는 요청부터 적용된다.
export function setHold(pool, hold) {
  pool.hold = hold;
}

function earliestRelease(pool) {
  let found = null;
  for (const [conn, held] of pool.busy) if (!found || held.releaseAt < found.at) found = { conn, at: held.releaseAt };
  return found;
}

function grant(pool, request, emit) {
  const conn = pool.idle.shift();
  const held = { id: request.id, arrivedAt: request.arrivedAt, grantedAt: pool.time, releaseAt: pool.time + pool.hold };
  pool.busy.set(conn, held);
  pool.granted++;
  emit({ type: "grant", id: request.id, conn, at: pool.time, arrivedAt: request.arrivedAt, releaseAt: held.releaseAt });
}

function giveBack(pool, conn) {
  pool.busy.delete(conn);
  let at = 0;
  while (at < pool.idle.length && pool.idle[at] < conn) at++;
  pool.idle.splice(at, 0, conn);
}

// 모델 시간을 dt초 앞으로 보낸다. 같은 순간의 일은 반환 → 타임아웃 → 도착 순으로 처리한다.
// onEvent는 원자적 단계(반환+대기자 획득, 타임아웃, 도착+획득)가 끝난 뒤마다 불린다.
export function advance(pool, dt, onEvent) {
  const end = pool.time + Math.max(0, dt);
  const events = [];
  let step = [];
  const emit = (event) => step.push(event);
  const flush = () => {
    for (const event of step) {
      events.push(event);
      onEvent?.(event, pool);
    }
    step = [];
  };
  for (;;) {
    const release = earliestRelease(pool);
    const releaseAt = release ? release.at : Infinity;
    const timeoutAt = pool.queue.length ? pool.queue[0].arrivedAt + TIMEOUT : Infinity;
    const arriveAt = pool.nextArrival;
    const at = Math.min(releaseAt, timeoutAt, arriveAt);
    if (!(at <= end)) break;
    pool.time = Math.max(pool.time, at);
    if (releaseAt === at) {
      const held = pool.busy.get(release.conn);
      giveBack(pool, release.conn);
      pool.completed++;
      emit({ type: "release", id: held.id, conn: release.conn, at: pool.time, grantedAt: held.grantedAt });
      while (pool.idle.length && pool.queue.length) grant(pool, pool.queue.shift(), emit);
    } else if (timeoutAt === at) {
      const request = pool.queue.shift();
      pool.timedOut++;
      emit({ type: "timeout", id: request.id, at: pool.time, arrivedAt: request.arrivedAt });
    } else {
      const request = { id: pool.nextId++, arrivedAt: pool.time };
      pool.arrived++;
      pool.lastArrival = pool.time;
      pool.nextArrival = pool.time + 1 / pool.rate;
      emit({ type: "arrive", id: request.id, at: pool.time });
      if (pool.idle.length) grant(pool, request, emit);
      else pool.queue.push(request);
    }
    flush();
  }
  pool.time = end;
  return events;
}

// 화면의 모든 수치는 이 한 곳에서 나온다.
// 사용 중은 사용 중 목록(busy)에서, 유휴는 유휴 목록(idle)에서 따로 센다.
export function snapshot(pool) {
  return {
    time: pool.time,
    size: POOL_SIZE,
    inUse: pool.busy.size,
    idle: pool.idle.length,
    waiting: pool.queue.length,
    timedOut: pool.timedOut,
    completed: pool.completed,
    arrived: pool.arrived,
    granted: pool.granted,
    demand: pool.rate * pool.hold,
    capacity: POOL_SIZE / pool.hold,
  };
}

// 깨진 불변식의 이름 목록을 돌려준다. 빈 배열이면 정상이다.
export function invariantsOf(pool) {
  const broken = [];
  const idle = new Set(pool.idle);
  if (pool.busy.size + pool.idle.length !== POOL_SIZE) broken.push("사용 중 + 유휴 = 10");
  if (idle.size !== pool.idle.length) broken.push("유휴 목록에 중복 없음");
  for (let conn = 0; conn < POOL_SIZE; conn++) {
    if (idle.has(conn) === pool.busy.has(conn)) {
      broken.push(`커넥션 ${conn}은 사용 중과 유휴 중 정확히 한쪽에만 있음`);
      break;
    }
  }
  if (pool.queue.length && pool.idle.length) broken.push("유휴 커넥션이 있으면 대기자가 없음");
  if (pool.arrived !== pool.busy.size + pool.queue.length + pool.completed + pool.timedOut) broken.push("도착 = 사용 중 + 대기 + 완료 + 타임아웃");
  for (let at = 1; at < pool.queue.length; at++) {
    if (pool.queue[at].arrivedAt < pool.queue[at - 1].arrivedAt || pool.queue[at].id < pool.queue[at - 1].id) {
      broken.push("대기열은 도착 순서(FIFO)");
      break;
    }
  }
  if (pool.queue.length && pool.time - pool.queue[0].arrivedAt > TIMEOUT + 1e-9) broken.push("대기 시간은 2초를 넘지 않음");
  for (const held of pool.busy.values()) {
    if (held.releaseAt < pool.time - 1e-9 || held.grantedAt - held.arrivedAt > TIMEOUT + 1e-9) {
      broken.push("사용 중 요청은 2초 안에 획득했고 아직 끝나지 않음");
      break;
    }
  }
  return broken;
}
