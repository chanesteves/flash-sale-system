import { useState } from 'react';

interface Props {
  disabled: boolean;
  loading: boolean;
  onSubmit: (userId: string) => void;
}

export function PurchaseForm({ disabled, loading, onSubmit }: Props) {
  const [userId, setUserId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = userId.trim();
    if (trimmed) {
      onSubmit(trimmed);
    }
  };

  return (
    <form className="purchase-form" onSubmit={handleSubmit}>
      <div className="input-group">
        <label htmlFor="userId">User ID</label>
        <input
          id="userId"
          type="text"
          placeholder="e.g. alice@example.com"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          disabled={disabled || loading}
          maxLength={255}
          autoComplete="off"
        />
      </div>

      <button
        type="submit"
        className="buy-button"
        disabled={disabled || loading || !userId.trim()}
      >
        {loading ? (
          <span className="spinner" />
        ) : (
          '🛒 Buy Now'
        )}
      </button>
    </form>
  );
}
