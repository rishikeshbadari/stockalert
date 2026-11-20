import { PriceUpdate } from '@/domain/alarm';
import { ConnectionStatus, MarketDataProvider } from './marketDataProvider';

export class MockMarketDataProvider implements MarketDataProvider {
  private status: ConnectionStatus = 'disconnected';
  private tickers = new Set<string>();
  private priceCallbacks = new Set<(update: PriceUpdate) => void>();
  private statusCallbacks = new Set<(status: ConnectionStatus) => void>();
  private interval: ReturnType<typeof setInterval> | null = null;
  private phases = new Map<string, number>();

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    this.statusCallbacks.forEach((callback) => callback(status));
  }

  async connect() {
    this.setStatus('connecting');
    await new Promise((resolve) => setTimeout(resolve, 350));
    this.setStatus('connected');
    if (!this.interval) {
      this.interval = setInterval(() => this.emitPrices(), 2800);
    }
  }

  disconnect() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.setStatus('paused');
  }

  subscribe(tickers: string[]) {
    this.tickers.clear();
    tickers.forEach((ticker) => this.tickers.add(ticker.toUpperCase()));
  }

  unsubscribe(tickers: string[]) {
    tickers.forEach((ticker) => this.tickers.delete(ticker.toUpperCase()));
  }

  onPriceUpdate(callback: (update: PriceUpdate) => void) {
    this.priceCallbacks.add(callback);
    return () => this.priceCallbacks.delete(callback);
  }

  onStatusChange(callback: (status: ConnectionStatus) => void) {
    this.statusCallbacks.add(callback);
    callback(this.status);
    return () => this.statusCallbacks.delete(callback);
  }

  getConnectionStatus() {
    return this.status;
  }

  getErrorMessage() {
    return null;
  }

  private emitPrices() {
    if (this.status !== 'connected') return;
    this.tickers.forEach((ticker) => {
      const phase = this.phases.get(ticker) ?? 0;
      const offsets = [-1.8, -1.1, 0.15, -0.1, 1.8, 1.1, 0.05];
      const seed = ticker === 'NVDA' ? 180 : ticker === 'AAPL' ? 230 : 100;
      const price = seed * (1 + offsets[phase % offsets.length] / 100);
      this.phases.set(ticker, phase + 1);
      const update: PriceUpdate = {
        ticker,
        price: Number(price.toFixed(2)),
        timestamp: new Date().toISOString(),
        source: 'DEMO',
        session: 'regular',
      };
      this.priceCallbacks.forEach((callback) => callback(update));
    });
  }
}
