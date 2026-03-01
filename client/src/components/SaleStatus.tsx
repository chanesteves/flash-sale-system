import { useEffect, useState } from 'react';
import { SaleStatus } from '../types';
import type { SaleStatusResponse } from '../types';

interface Props {
  data: SaleStatusResponse;
}

function formatTime(totalSeconds: number): string {
  if (totalSeconds <= 0) return '00:00:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export function SaleStatusPanel({ data }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const startsAt = new Date(data.startsAt).getTime();
  const endsAt = new Date(data.endsAt).getTime();

  const statusConfig = {
    [SaleStatus.UPCOMING]: {
      icon: '⏱',
      label: 'UPCOMING',
      className: 'status-upcoming',
      countdown: Math.max(0, Math.floor((startsAt - now) / 1000)),
      countdownLabel: 'Starts in',
    },
    [SaleStatus.ACTIVE]: {
      icon: '🔥',
      label: 'LIVE!',
      className: 'status-active',
      countdown: Math.max(0, Math.floor((endsAt - now) / 1000)),
      countdownLabel: 'Ends in',
    },
    [SaleStatus.ENDED]: {
      icon: '🏁',
      label: 'ENDED',
      className: 'status-ended',
      countdown: 0,
      countdownLabel: '',
    },
  };

  const cfg = statusConfig[data.status];

  return (
    <div className={`sale-status-panel ${cfg.className}`}>
      <h2>
        {cfg.icon} Flash Sale — {cfg.label}
      </h2>

      {data.status !== SaleStatus.ENDED && (
        <div className="countdown">
          <span className="countdown-label">{cfg.countdownLabel}:</span>{' '}
          <span className="countdown-value">{formatTime(cfg.countdown)}</span>
        </div>
      )}

      <div className="stock-info">
        <div className="stock-bar-container">
          <div
            className="stock-bar"
            style={{
              width: `${data.totalStock > 0 ? (data.stockRemaining / data.totalStock) * 100 : 0}%`,
            }}
          />
        </div>
        <span className="stock-text">
          {data.stockRemaining} / {data.totalStock} remaining
        </span>
      </div>
    </div>
  );
}
