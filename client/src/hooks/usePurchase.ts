import { useCallback, useState } from 'react';
import type { PurchaseResult } from '../types';
import { purchase } from '../api/flashSaleApi';

export interface UsePurchaseReturn {
  result: PurchaseResult | null;
  error: string | null;
  loading: boolean;
  execute: (userId: string) => Promise<void>;
  reset: () => void;
}

export function usePurchase(): UsePurchaseReturn {
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = useCallback(async (userId: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await purchase(userId);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  return { result, error, loading, execute, reset };
}
