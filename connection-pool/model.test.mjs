// 교육용 커넥션 풀 모델 테스트: node --test connection-pool/
import { test } from "node:test";
import assert from "node:assert/strict";
import { POOL_SIZE, TIMEOUT, createPool, setRate, setHold, advance, snapshot, reset, invariantsOf } from "./model.mjs";

// 결정적인 의사 난수(mulberry32): 실패하면 같은 시드로 그대로 재현된다.
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 매 원자적 단계(도착·획득·반환·타임아웃)가 끝날 때마다 불변식을 확인한다.
function runChecked(pool, seconds, frame = 1 / 60) {
  let steps = 0;
  const check = (where) => {
    steps++;
    const broken = invariantsOf(pool);
    assert.deepEqual(broken, [], `${where} t=${pool.time.toFixed(4)}`);
    const s = snapshot(pool);
    assert.equal(s.inUse + s.idle, POOL_SIZE, `사용 중 ${s.inUse} + 유휴 ${s.idle} != ${POOL_SIZE}`);
  };
  for (let t = 0; t < seconds; t += frame) {
    advance(pool, frame, (event) => check(event.type));
    check("frame");
  }
  return steps;
}

test("처음에는 커넥션 10개가 모두 유휴다", () => {
  const s = snapshot(createPool({ rate: 5, hold: 1 }));
  assert.equal(s.size, 10);
  assert.equal(s.inUse, 0);
  assert.equal(s.idle, 10);
  assert.equal(s.waiting, 0);
  assert.equal(s.timedOut, 0);
});

test("사용 중 + 유휴 = 10: 무작위 설정·중간 변경·일시정지·초기화를 섞어도 모든 단계에서 유지된다", () => {
  const next = random(20261011);
  let total = 0;
  for (let run = 0; run < 60; run++) {
    const pool = createPool({ rate: 1 + next() * 39, hold: 0.2 + next() * 3.8 });
    for (let phase = 0; phase < 6; phase++) {
      const action = next();
      if (action < 0.3) setRate(pool, 1 + Math.round(next() * 39));
      else if (action < 0.6) setHold(pool, 0.2 + Math.round(next() * 38) / 10);
      else if (action < 0.7) reset(pool);
      // 일시정지는 advance를 부르지 않거나 dt=0으로 부르는 것과 같다.
      advance(pool, 0, () => {});
      total += runChecked(pool, 0.5 + next() * 3, phase % 2 ? 1 / 60 : 1 / 7);
    }
  }
  assert.ok(total > 50000, `검사한 단계 수가 너무 적다: ${total}`);
});

test("불규칙한 프레임 간격(긴 정지 후 큰 dt 포함)에서도 유지된다", () => {
  const next = random(7);
  const pool = createPool({ rate: 30, hold: 2.5 });
  for (let i = 0; i < 4000; i++) {
    const dt = next() < 0.01 ? 1.7 : next() * 0.05;
    advance(pool, dt, () => assert.deepEqual(invariantsOf(pool), []));
    const s = snapshot(pool);
    assert.equal(s.inUse + s.idle, POOL_SIZE);
  }
});

test("여유가 있으면(유입 8/s × 처리 1s = 8) 대기도 타임아웃도 없다", () => {
  const pool = createPool({ rate: 8, hold: 1 });
  let peakWaiting = 0;
  for (let i = 0; i < 600; i++) {
    advance(pool, 1 / 60);
    peakWaiting = Math.max(peakWaiting, snapshot(pool).waiting);
  }
  const s = snapshot(pool);
  assert.equal(peakWaiting, 0);
  assert.equal(s.timedOut, 0);
  assert.equal(s.inUse, 8);
  assert.equal(s.idle, 2);
});

test("필요량이 10을 넘으면(20/s × 1s = 20) 풀이 고갈되고 초과분은 2초 뒤 타임아웃된다", () => {
  const pool = createPool({ rate: 20, hold: 1 });
  advance(pool, 10);
  const before = snapshot(pool);
  assert.equal(before.inUse, 10);
  assert.equal(before.idle, 0);
  assert.ok(before.waiting > 0);
  advance(pool, 10);
  const after = snapshot(pool);
  // 정상 상태에서 초당 처리량은 10/1s = 10건, 나머지 약 10건/s는 타임아웃.
  const perSecond = (after.timedOut - before.timedOut) / 10;
  assert.ok(Math.abs(perSecond - 10) <= 0.2, `타임아웃 ${perSecond}/s`);
  // 대기열에는 최대 2초 분량(약 20 × 2 = 40건)까지만 쌓인다.
  assert.ok(after.waiting <= 41 && after.waiting >= 36, `대기 ${after.waiting}`);
});

test("커넥션은 먼저 온 요청부터(FIFO) 받는다", () => {
  const pool = createPool({ rate: 25, hold: 0.9 });
  const order = [];
  advance(pool, 20, (event) => event.type === "grant" && order.push(event.id));
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `${order[i - 1]} 다음에 ${order[i]}`);
});

test("2초 안에 커넥션을 얻은 요청만 처리되고, 타임아웃된 요청은 정확히 2초를 기다렸다", () => {
  const pool = createPool({ rate: 18, hold: 1.4 });
  let grants = 0;
  let timeouts = 0;
  advance(pool, 30, (event) => {
    if (event.type === "grant") {
      grants++;
      assert.ok(event.at - event.arrivedAt <= TIMEOUT + 1e-9);
    }
    if (event.type === "timeout") {
      timeouts++;
      assert.ok(Math.abs(event.at - event.arrivedAt - TIMEOUT) < 1e-9);
    }
  });
  assert.ok(grants > 0 && timeouts > 0);
});

test("반환과 마감이 같은 순간이면 반환된 커넥션이 먼저 대기자에게 간다", () => {
  // 유입 8/s(간격 0.125s, 이진수로 정확), 처리 3.25s:
  // 11번째 요청은 1.25s에 도착해 마감이 3.25s, 1번째 요청의 반환도 정확히 3.25s다.
  const pool = createPool({ rate: 8, hold: 3.25 });
  const events = advance(pool, 3.3);
  const id11 = events.find((event) => event.type === "grant" && event.id === 11);
  assert.ok(id11, "11번째 요청은 마감 순간에 반환된 커넥션을 얻어야 한다");
  assert.equal(id11.at, 3.25);
  assert.equal(events.filter((event) => event.type === "timeout").length, 0);
});

test("처리 시간을 바꾸면 이미 처리 중인 요청은 그대로, 새 요청부터 적용된다", () => {
  const pool = createPool({ rate: 1, hold: 3 });
  advance(pool, 0.01);
  setHold(pool, 0.5);
  const events = advance(pool, 3.5);
  const first = events.find((event) => event.type === "release" && event.id === 1);
  assert.ok(first && Math.abs(first.at - 3) < 1e-9);
  const second = events.find((event) => event.type === "release" && event.id === 2);
  assert.ok(second && Math.abs(second.at - 1.5) < 1e-9);
});

test("초기화하면 처음 상태로 돌아가고 설정값은 유지된다", () => {
  const pool = createPool({ rate: 30, hold: 3 });
  advance(pool, 5);
  reset(pool);
  const s = snapshot(pool);
  assert.deepEqual([s.time, s.inUse, s.idle, s.waiting, s.timedOut, s.completed, s.arrived], [0, 0, 10, 0, 0, 0, 0]);
  assert.equal(pool.rate, 30);
  assert.equal(pool.hold, 3);
});

test("invariantsOf는 깨진 상태를 실제로 잡아낸다(검사기 자체 점검)", () => {
  const pool = createPool({ rate: 5, hold: 1 });
  advance(pool, 1);
  pool.idle.push(pool.idle[0]); // 같은 커넥션을 유휴 목록에 두 번 넣는다
  assert.ok(invariantsOf(pool).length > 0);
  const other = createPool({ rate: 30, hold: 3 });
  advance(other, 3);
  other.idle.push(9); // 대기자가 있는데 유휴 커넥션이 생긴 상태
  assert.ok(invariantsOf(other).length > 0);
});
