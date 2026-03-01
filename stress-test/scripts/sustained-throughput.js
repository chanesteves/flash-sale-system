import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

/**
 * Sustained Throughput Test
 *
 * Fires 500 requests/second at the sale-status and purchase endpoints
 * for 60 seconds. Validates that the server maintains acceptable latency
 * and error rate under sustained load.
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const errorRate = new Rate('error_rate');
const statusRequests = new Counter('status_requests');
const purchaseRequests = new Counter('purchase_requests');

export const options = {
  scenarios: {
    sustained_load: {
      executor: 'constant-arrival-rate',
      rate: 500,             // 500 iterations per timeUnit
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 100,
      maxVUs: 300,
    },
  },
  thresholds: {
    error_rate: ['rate<0.01'],                   // < 1% errors
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
  },
};

export default function () {
  // 70% of traffic hits the status endpoint, 30% hits purchase
  if (Math.random() < 0.7) {
    const res = http.get(`${BASE_URL}/api/sale/status`);
    statusRequests.add(1);

    const ok = check(res, {
      'status 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  } else {
    const userId = `k6-sustained-${__VU}-${__ITER}-${Date.now()}`;
    const res = http.post(
      `${BASE_URL}/api/purchases`,
      JSON.stringify({ userId }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    purchaseRequests.add(1);

    const ok = check(res, {
      'status is expected': (r) =>
        [201, 400, 409, 410, 429].includes(r.status),
    });
    errorRate.add(!ok);
  }

  sleep(0.01);
}

export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration.values['p(95)'];
  const p99 = data.metrics.http_req_duration.values['p(99)'];
  const errRate = data.metrics.error_rate
    ? (data.metrics.error_rate.values.rate * 100).toFixed(2)
    : '0.00';
  const totalReqs = data.metrics.http_reqs.values.count;

  const summary = `
╔═══════════════════════════════════════════════════╗
║        Sustained Throughput Test Results           ║
╠═══════════════════════════════════════════════════╣
║  Total requests              : ${String(totalReqs).padStart(6)}            ║
║  Error rate                  : ${String(errRate + '%').padStart(7)}           ║
║  p95 latency                 : ${String(p95.toFixed(1) + 'ms').padStart(9)}         ║
║  p99 latency                 : ${String(p99.toFixed(1) + 'ms').padStart(9)}         ║
╚═══════════════════════════════════════════════════╝
`;

  console.log(summary);
  return {};
}
