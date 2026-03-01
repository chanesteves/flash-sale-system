import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

/**
 * Concurrent Purchase Load Test
 *
 * Simulates 1 000 virtual users each making a single purchase request
 * against 100 stock items.
 *
 * Expected:
 *   - Exactly 100 × 201 (success)
 *   - Remaining get 409 (duplicate) or 410 (sold out)
 *   - Zero 5xx errors
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Custom metrics
const successCounter = new Counter('purchase_success');
const soldOutCounter = new Counter('purchase_sold_out');
const duplicateCounter = new Counter('purchase_duplicate');
const serverErrorCounter = new Counter('purchase_server_error');
const purchaseDuration = new Trend('purchase_duration', true);

export const options = {
  scenarios: {
    burst: {
      executor: 'shared-iterations',
      vus: 200,
      iterations: 1000,
      maxDuration: '30s',
    },
  },
  thresholds: {
    purchase_server_error: ['count==0'],       // No 5xx errors
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
  },
};

export default function () {
  const userId = `k6-user-${__VU}-${__ITER}-${Date.now()}`;

  const res = http.post(
    `${BASE_URL}/api/purchases`,
    JSON.stringify({ userId }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  purchaseDuration.add(res.timings.duration);

  check(res, {
    'status is 201, 409, 410, or 429': (r) =>
      [201, 409, 410, 429].includes(r.status),
  });

  if (res.status === 201) successCounter.add(1);
  else if (res.status === 410) soldOutCounter.add(1);
  else if (res.status === 409) duplicateCounter.add(1);
  else if (res.status >= 500) serverErrorCounter.add(1);

  sleep(0.01); // Tiny breathing room
}

export function handleSummary(data) {
  const successes = data.metrics.purchase_success
    ? data.metrics.purchase_success.values.count
    : 0;
  const soldOut = data.metrics.purchase_sold_out
    ? data.metrics.purchase_sold_out.values.count
    : 0;
  const duplicates = data.metrics.purchase_duplicate
    ? data.metrics.purchase_duplicate.values.count
    : 0;
  const errors = data.metrics.purchase_server_error
    ? data.metrics.purchase_server_error.values.count
    : 0;

  const p95 = data.metrics.http_req_duration.values['p(95)'];
  const p99 = data.metrics.http_req_duration.values['p(99)'];

  const summary = `
╔═══════════════════════════════════════════════════╗
║       Concurrent Purchase Load Test Results       ║
╠═══════════════════════════════════════════════════╣
║  Successful purchases (201)  : ${String(successes).padStart(6)}            ║
║  Sold out (410)              : ${String(soldOut).padStart(6)}            ║
║  Duplicate (409)             : ${String(duplicates).padStart(6)}            ║
║  Server errors (5xx)         : ${String(errors).padStart(6)}            ║
║  p95 latency                 : ${String(p95.toFixed(1) + 'ms').padStart(9)}         ║
║  p99 latency                 : ${String(p99.toFixed(1) + 'ms').padStart(9)}         ║
╚═══════════════════════════════════════════════════╝
`;

  console.log(summary);
  return {};
}
