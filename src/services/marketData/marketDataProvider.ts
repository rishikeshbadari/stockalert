import { PriceUpdate } from '@/domain/alarm';

export type ConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'paused'
  | 'stale'
  | 'error';

export interface MarketDataProvider {
  connect(): Promise<void>;
  disconnect(): void;
  subscribe(tickers: string[]): void;
  unsubscribe(tickers: string[]): void;
  onPriceUpdate(callback: (update: PriceUpdate) => void): () => void;
  onStatusChange(callback: (status: ConnectionStatus) => void): () => void;
  getConnectionStatus(): ConnectionStatus;
  getErrorMessage(): string | null;
}
