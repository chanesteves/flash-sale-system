import './App.css';
import { SaleStatus } from './types';
import { useSaleStatus } from './hooks/useSaleStatus';
import { usePurchase } from './hooks/usePurchase';
import { SaleStatusPanel } from './components/SaleStatus';
import { PurchaseForm } from './components/PurchaseForm';
import { PurchaseResultPanel } from './components/PurchaseResult';

function App() {
  const { data, error: statusError, loading } = useSaleStatus();
  const { result, error: purchaseError, loading: purchasing, execute, reset } = usePurchase();

  const saleIsActive = data?.status === SaleStatus.ACTIVE;
  const showResult = result !== null || purchaseError !== null;

  return (
    <div className="app">
      <header className="app-header">
        <h1>⚡ Flash Sale</h1>
      </header>

      <main className="app-main">
        {loading && <div className="loading-screen">Loading sale info…</div>}

        {statusError && (
          <div className="error-banner">
            Unable to reach server: {statusError}
          </div>
        )}

        {data && <SaleStatusPanel data={data} />}

        {data && !showResult && (
          <PurchaseForm
            disabled={!saleIsActive}
            loading={purchasing}
            onSubmit={execute}
          />
        )}

        {showResult && (
          <PurchaseResultPanel result={result} error={purchaseError} onReset={reset} />
        )}

        {data?.status === SaleStatus.ENDED && (
          <p className="ended-message">The sale has ended. Thank you for participating!</p>
        )}
      </main>

      <footer className="app-footer">
        Flash Sale System &mdash; High-Throughput Demo
      </footer>
    </div>
  );
}

export default App;
