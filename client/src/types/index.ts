/* ── Sale status ─────────────────────────────────────────── */

export const SaleStatus = {
  UPCOMING: 'upcoming',
  ACTIVE: 'active',
  ENDED: 'ended',
} as const;

export type SaleStatus = (typeof SaleStatus)[keyof typeof SaleStatus];

export interface SaleStatusResponse {
  status: SaleStatus;
  startsAt: string;
  endsAt: string;
  stockRemaining: number;
  totalStock: number;
}

/* ── Purchase ────────────────────────────────────────────── */

export interface PurchaseResult {
  success: boolean;
  message: string;
  orderId?: string;
}

export interface PurchaseStatusResponse {
  purchased: boolean;
  orderId?: string;
  userId: string;
  purchasedAt?: string;
}

/* ── Error response from server ──────────────────────────── */

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
}
