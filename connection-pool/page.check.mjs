// 브라우저 점검: node connection-pool/page.check.mjs
// 빌드된 index.html을 헤드리스 Chrome에서 열고, 설정을 바꿔 가며 화면에 표시된 수치를 표본 추출한다.
// - 수치 패널의 사용 중 + 유휴 = 10
// - 켜진 램프 수 = 사용 중, 모서리 표시값·기계 카운터 = 수치 패널 (같은 모델에서 나왔는지)
// - 페이지 자체의 불변식 점검이 깨지지 않음, 일시정지하면 모델 시각이 멈춤, 초기화하면 0으로 돌아감
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DRIVE = join(HERE, "..", ".claude", "skills", "anatomy", "scripts", "drive.mjs");

const SAMPLER = `(async () => {
  const q = (s) => document.querySelector(s);
  const num = (key) => Number(q('[data-stat="' + key + '"]').textContent);
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const set = (id, value) => { const el = q('#' + id); el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const bad = [];
  let samples = 0;
  const scenarios = [[10, 0.5], [10, 1.6], [30, 0.5], [40, 4], [1, 0.2], [25, 1.2], [12, 0.8]];
  for (const [rate, hold] of scenarios) {
    set('rate', rate);
    set('hold', hold);
    for (let i = 0; i < 22; i++) {
      await sleep(70);
      samples++;
      const s = { inUse: num('inUse'), idle: num('idle'), waiting: num('waiting'), timedOut: num('timedOut'), arrived: num('arrived') };
      const where = rate + '/s × ' + hold + 's #' + i + ' ';
      if (s.inUse + s.idle !== 10) bad.push(where + '사용 중 ' + s.inUse + ' + 유휴 ' + s.idle);
      const lamps = document.querySelectorAll('.pool-lamp[data-busy]').length;
      if (lamps !== s.inUse) bad.push(where + '램프 ' + lamps + ' ≠ 사용 중 ' + s.inUse);
      const m = q('[data-readout]').textContent.match(/사용 중 (\\d+) · 유휴 (\\d+) · 대기 (\\d+) · 타임아웃 (\\d+)/);
      if (!m || +m[1] !== s.inUse || +m[2] !== s.idle || +m[3] !== s.waiting || +m[4] !== s.timedOut) bad.push(where + '모서리 표시값 불일치');
      if (Number(q('[data-part="timeouts"]').textContent) !== s.timedOut % 10000) bad.push(where + '통 카운터 불일치');
      if (Number(q('[data-part="arrived"]').textContent) !== s.arrived % 10000) bad.push(where + '매거진 카운터 불일치');
      if (q('[data-sum]').textContent !== '사용 중 ' + s.inUse + ' + 유휴 ' + s.idle + ' = 10') bad.push(where + '합계 문장 불일치');
      if (q('[data-check]').hasAttribute('data-broken')) bad.push(where + '페이지 불변식 점검 실패: ' + q('[data-check]').textContent);
    }
  }
  const saw = { exhausted: false };
  set('rate', 30); set('hold', 2);
  await sleep(3000);
  saw.exhausted = num('waiting') > 0 && num('timedOut') > 0 && num('idle') === 0;
  if (!saw.exhausted) bad.push('고갈 상태(대기·타임아웃)가 나타나지 않음');
  q('[data-action="pause"]').click();
  await sleep(120);
  const frozen = q('[data-clock]').textContent;
  await sleep(500);
  if (q('[data-clock]').textContent !== frozen) bad.push('일시정지 중에도 모델 시각이 흐름');
  if (q('[data-action="pause"]').getAttribute('aria-pressed') !== 'true') bad.push('일시정지 버튼 상태가 눌림이 아님');
  q('[data-action="reset"]').click();
  await sleep(60);
  const after = { inUse: num('inUse'), idle: num('idle'), waiting: num('waiting'), timedOut: num('timedOut'), cards: document.querySelectorAll('.pool-card').length };
  if (after.inUse !== 0 || after.idle !== 10 || after.waiting !== 0 || after.timedOut !== 0 || after.cards !== 0) bad.push('초기화 후 상태가 처음과 다름 ' + JSON.stringify(after));
  q('[data-action="pause"]').click();
  await sleep(600);
  if (num('arrived') === 0) bad.push('다시 시작한 뒤 요청이 도착하지 않음');
  return { samples, problems: bad.length, bad: bad.slice(0, 12) };
})()`;

const dir = mkdtempSync(join(tmpdir(), "pool-check-"));
const actions = join(dir, "actions.json");
writeFileSync(actions, JSON.stringify([["wait", 800], ["eval", SAMPLER]]));
const page = process.argv[2] ?? join(HERE, "index.html");
const run = spawnSync(process.execPath, [DRIVE, page, "--actions", actions, "--height", "1400"], { encoding: "utf8", timeout: 120000 });
const output = `${run.stdout}\n${run.stderr}`;
const line = output.split("\n").find((text) => text.startsWith("eval:"));
if (!line) {
  console.error(output);
  console.error("브라우저 점검을 실행하지 못했다");
  process.exit(1);
}
const result = JSON.parse(line.slice(5).trim());
const consoleClean = /console: clean/.test(output);
console.log(`표본 ${result.samples}개 · 문제 ${result.problems}건 · 콘솔 ${consoleClean ? "깨끗함" : "오류 있음"}`);
for (const problem of result.bad) console.log("  ✗ " + problem);
if (!consoleClean) console.log(output);
process.exit(result.problems === 0 && consoleClean ? 0 : 1);
