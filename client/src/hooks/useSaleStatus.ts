import { useEffect, useRef, useState } from 'react';
import { SaleStatus } from '../types';
import type { SaleStatusResponse } from '../types';
import { getSaleStatus } from '../api/flashSaleApi';

const POLL_INTERVAL_MS = 3_000;

export interface UseSaleStatusReturn {
  data: SaleStatusResponse | null;
  error: string | null;
  loading: boolean;
}

export function useSaleStatus(): UseSaleStatusReturn {
  const [data, setData] = useState<SaleStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const status = await getSaleStatus();
        if (!cancelled) {
          setData(status);
          setError(null);
          setLoading(false);

          // Stop polling once the sale has ended and stock is 0
          if (
            status.status === SaleStatus.ENDED &&
            status.stockRemaining === 0 &&
            intervalRef.current
          ) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load sale status');
          setLoading(false);
        }
      }
    };

    // Initial fetch
    fetchStatus();

    // Start polling
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return { data, error, loading };
}
