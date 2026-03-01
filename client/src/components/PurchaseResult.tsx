import type { PurchaseResult } from '../types';

interface Props {
  result: PurchaseResult | null;
  error: string | null;
  onReset: () => void;
}

export function PurchaseResultPanel({ result, error, onReset }: Props) {
  if (!result && !error) return null;

  const isSuccess = result?.success === true;

  return (
    <div className={`purchase-result ${isSuccess ? 'result-success' : 'result-error'}`}>
      {isSuccess ? (
        <>
          <div className="result-icon">✅</div>
          <h3>Purchase Successful!</h3>
          {result.orderId && (
            <p className="order-id">
              Order ID: <code>{result.orderId}</code>
            </p>
          )}
          <p>{result.message}</p>
        </>
      ) : (
        <>
          <div className="result-icon">❌</div>
          <h3>Purchase Failed</h3>
          <p>{error || result?.message}</p>
        </>
      )}

      <button className="reset-button" onClick={onReset}>
        ← Back
      </button>
    </div>
  );
}
