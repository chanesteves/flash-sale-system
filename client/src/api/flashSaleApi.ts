import type { SaleStatusResponse, PurchaseResult, PurchaseStatusResponse } from '../types';

const BASE = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : res.statusText;
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

/** GET /api/sale/status */
export async function getSaleStatus(): Promise<SaleStatusResponse> {
  const res = await fetch(`${BASE}/sale/status`);
  return handleResponse<SaleStatusResponse>(res);
}

/** POST /api/purchases */
export async function purchase(userId: string): Promise<PurchaseResult> {
  const res = await fetch(`${BASE}/purchases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  return handleResponse<PurchaseResult>(res);
}

/** GET /api/purchases/:userId */
export async function getPurchaseStatus(userId: string): Promise<PurchaseStatusResponse> {
  const res = await fetch(`${BASE}/purchases/${encodeURIComponent(userId)}`);
  return handleResponse<PurchaseStatusResponse>(res);
}
