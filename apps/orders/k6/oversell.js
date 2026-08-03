import { __ENV, __ITER, __VU, check } from 'k6';
import http from 'k6/http';
import { Counter } from 'k6/metrics';

const success = new Counter('order_success');
const conflict = new Counter('order_conflict');

export const options = {
  scenarios: {
    rush: { executor: 'shared-iterations', vus: 200, iterations: 200, maxDuration: '30s' },
  },
  thresholds: { 'http_req_duration{expected_response:true}': ['p(95)<500'] },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const TOKEN = __ENV.TOKEN; // a valid access token (any seeded user)
const EVENT_ID = __ENV.EVENT_ID;
const SEAT_ID = __ENV.SEAT_ID;
const TT_ID = __ENV.TT_ID;

export default function () {
  const res = http.post(
    `${BASE}/orders`,
    JSON.stringify({ eventId: EVENT_ID, seats: [{ seatId: SEAT_ID, ticketTypeId: TT_ID }] }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
        'Idempotency-Key': `k6-${__VU}-${__ITER}`,
      },
    },
  );
  if (res.status === 201 || res.status === 200) success.add(1);
  else if (res.status === 409) conflict.add(1);
  check(res, { 'no 5xx': (r) => r.status < 500 });
}

// 0-oversell assertion: exactly one buyer wins the single contended seat.
export function handleSummary(data) {
  const wins = data.metrics.order_success ? data.metrics.order_success.values.count : 0;
  const ok = wins === 1;
  // eslint-disable-next-line no-console
  console.log(
    `order_success=${wins} (expected 1) → ${ok ? 'PASS: 0 oversell' : 'FAIL: oversell!'}`,
  );
  return { stdout: `\noversell check: ${ok ? 'PASS' : 'FAIL'} (winners=${wins})\n` };
}
