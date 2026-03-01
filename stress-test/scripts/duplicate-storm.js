import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

/**
 * Duplicate User Storm Test
 *
 * Sends 100 simultaneous purchase requests from the SAME userId.
 * Validates that exactly 1 succeeds and the other 99 are rejected (409).
 * This tests the atomicity of the Redis Lua dedup script.
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const STORM_USER = __ENV.STORM_USER || 'k6-storm-user';

const successCounter = new Counter('storm_success');
const duplicateCounter = new Counter('storm_duplicate');
const otherCounter = new Counter('storm_other');

export const options = {
  scenarios: {
    storm: {
      executor: 'shared-iterations',
      vus: 100,
      iterations: 100,
      maxDuration: '15s',
    },
  },
  thresholds: {
    storm_success: ['count==1'],     // Exactly 1 should succeed
    storm_other: ['count==0'],       // No unexpected responses
  },
};

export default function () {
  const res = http.post(
    `${BASE_URL}/api/purchases`,
    JSON.stringify({ userId: STORM_USER }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(res, {
    'status is 201 or 409': (r) => [201, 409].includes(r.status),
  });

  if (res.status === 201) successCounter.add(1);
  else if (res.status === 409) duplicateCounter.add(1);
  else otherCounter.add(1);
}

export function handleSummary(data) {
  const successes = data.metrics.storm_success
    ? data.metrics.storm_success.values.count
    : 0;
  const duplicates = data.metrics.storm_duplicate
    ? data.metrics.storm_duplicate.values.count
    : 0;
  const other = data.metrics.storm_other
    ? data.metrics.storm_other.values.count
    : 0;

  const summary = `
╔═══════════════════════════════════════════════════╗
║         Duplicate User Storm Test Results          ║
╠═══════════════════════════════════════════════════╣
║  Successful purchases (201)  : ${String(successes).padStart(6)}            ║
║  Duplicate rejected  (409)   : ${String(duplicates).padStart(6)}            ║
║  Unexpected responses        : ${String(other).padStart(6)}            ║
║                                                   ║
║  Expected: 1 success, 99 duplicates, 0 other      ║
║  Result  : ${successes === 1 && other === 0 ? '✅ PASS' : '❌ FAIL'}                                   ║
╚═══════════════════════════════════════════════════╝
`;

  console.log(summary);
  return {};
}
