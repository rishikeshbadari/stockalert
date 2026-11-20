import { PriceUpdate } from '@/domain/alarm';
import { ConnectionStatus, MarketDataProvider } from './marketDataProvider';

type AlpacaMessage = {
  T?: string;
  msg?: string;
  code?: number;
  S?: string;
  bp?: number;
  ap?: number;
  t?: string;
};

type LatestQuoteResponse = {
  quotes?: Record<string, { bp?: number; ap?: number; t?: string }>;
};

const RECONNECT_LIMIT_MS = 30_000;

export class AlpacaMarketDataProvider implements MarketDataProvider {
  private status: ConnectionStatus = 'disconnected';
  private socket: WebSocket | null = null;
  private desiredTickers = new Set<string>();
  private priceCallbacks = new Set<(update: PriceUpdate) => void>();
  private statusCallbacks = new Set<(status: ConnectionStatus) => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private shouldReconnect = false;
  private authenticated = false;
  private errorMessage: string | null = null;

  constructor(
    private readonly key: string,
    private readonly secret: string,
    private readonly feed: 'iex' | 'sip' | 'delayed_sip' = 'iex'
  ) {}

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    this.statusCallbacks.forEach((callback) => callback(status));
  }

  private setErrorMessage(message: string | null) {
    if (this.errorMessage === message) return;
    this.errorMessage = message;
    this.statusCallbacks.forEach((callback) => callback(this.status));
  }

  async connect() {
    this.shouldReconnect = true;
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.setErrorMessage(null);
    this.setStatus('connecting');
    const socket = new WebSocket(`wss://stream.data.alpaca.markets/v2/${this.feed}`);
    this.socket = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({
        action: 'auth',
        key: this.key,
        secret: this.secret,
      }));
    };

    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onerror = () => {
      this.setErrorMessage('Unable to connect to Alpaca market data. Check your network and try again.');
      this.setStatus('error');
    };
    socket.onclose = () => {
      this.authenticated = false;
      if (this.socket === socket) this.socket = null;
      if (this.shouldReconnect) this.scheduleReconnect();
      else if (this.status !== 'error') this.setStatus('paused');
    };
  }

  disconnect() {
    this.shouldReconnect = false;
    this.authenticated = false;
    this.setErrorMessage(null);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    this.setStatus('paused');
  }

  subscribe(tickers: string[]) {
    const nextTickers = new Set(tickers.map((ticker) => ticker.toUpperCase()));
    const removed = [...this.desiredTickers].filter((ticker) => !nextTickers.has(ticker));
    const added = [...nextTickers].filter((ticker) => !this.desiredTickers.has(ticker));
    this.desiredTickers = nextTickers;
    if (this.authenticated) {
      this.sendSubscription('unsubscribe', removed);
      this.sendSubscription('subscribe', added);
      void this.fetchLatestPrices([...nextTickers]);
    }
  }

  unsubscribe(tickers: string[]) {
    const removed = tickers.map((ticker) => ticker.toUpperCase());
    removed.forEach((ticker) => this.desiredTickers.delete(ticker));
    if (this.authenticated) this.sendSubscription('unsubscribe', removed);
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
    return this.errorMessage;
  }

  private handleMessage(data: unknown) {
    let messages: AlpacaMessage[];
    try {
      const parsed: unknown = JSON.parse(String(data));
      if (!Array.isArray(parsed)) throw new Error('Unexpected Alpaca message format');
      messages = parsed as AlpacaMessage[];
    } catch (error) {
      console.error('Unable to parse Alpaca market-data message', error);
      this.errorMessage = 'Received an invalid response from Alpaca market data.';
      this.setStatus('error');
      return;
    }

    messages.forEach((message) => {
      if (message.T === 'success' && message.msg === 'authenticated') {
        this.authenticated = true;
        this.reconnectAttempts = 0;
        this.setErrorMessage(null);
        this.setStatus('connected');
        this.sendSubscription('subscribe', [...this.desiredTickers]);
        void this.fetchLatestPrices([...this.desiredTickers]);
        return;
      }

      if (message.T === 'error') {
        console.warn(`Alpaca market-data error${message.code ? ` (${message.code})` : ''}: ${message.msg ?? 'Unknown error'}`);
        this.setErrorMessage(message.code === 406
          ? 'Alpaca allows one active stream per account. Close other apps using this key, then reopen Stock Alert.'
          : `Alpaca market-data error${message.code ? ` (${message.code})` : ''}: ${message.msg ?? 'Unknown error'}`);
        this.setStatus('error');
        if (message.code === 401 || message.code === 403 || message.code === 406) {
          this.shouldReconnect = false;
          this.socket?.close();
        }
        return;
      }

      const bid = message.bp;
      const ask = message.ap;
      if (message.T !== 'q' || !message.S || typeof bid !== 'number' ||
        typeof ask !== 'number' || !Number.isFinite(bid) || !Number.isFinite(ask) ||
        !message.t || bid <= 0 || ask <= 0 || ask < bid) return;
      const update: PriceUpdate = {
        ticker: message.S.toUpperCase(),
        price: (bid + ask) / 2,
        timestamp: message.t,
        source: `Alpaca ${this.feed.toUpperCase()} midpoint`,
      };
      this.setErrorMessage(null);
      this.priceCallbacks.forEach((callback) => callback(update));
    });
  }

  private async fetchLatestPrices(tickers: string[]) {
    if (!tickers.length) return;
    const url = new URL('https://data.alpaca.markets/v2/stocks/quotes/latest');
    url.searchParams.set('symbols', tickers.join(','));
    url.searchParams.set('feed', this.feed);

    try {
      const response = await fetch(url.toString(), {
        headers: {
          'APCA-API-KEY-ID': this.key,
          'APCA-API-SECRET-KEY': this.secret,
        },
      });
      if (!response.ok) {
        const message = `Alpaca latest-quote snapshot failed (${response.status}); waiting for the live stream.`;
        console.warn(message);
        this.setErrorMessage(message);
        return;
      }

      const body = await response.json() as LatestQuoteResponse;
      Object.entries(body.quotes ?? {}).forEach(([ticker, quote]) => {
        const bid = quote.bp;
        const ask = quote.ap;
        const timestamp = quote.t;
        if (typeof bid !== 'number' || typeof ask !== 'number' ||
          !Number.isFinite(bid) || !Number.isFinite(ask) ||
          bid <= 0 || ask <= 0 || ask < bid || typeof timestamp !== 'string') return;
        this.priceCallbacks.forEach((callback) => callback({
          ticker: ticker.toUpperCase(),
          price: (bid + ask) / 2,
          timestamp,
          source: `Alpaca ${this.feed.toUpperCase()} midpoint`,
          isSnapshot: true,
        }));
      });
    } catch (error) {
      console.warn('Unable to retrieve Alpaca latest-quote snapshot', error);
      this.setErrorMessage('Alpaca latest-quote snapshot unavailable; waiting for the live stream.');
    }
  }

  private sendSubscription(action: 'subscribe' | 'unsubscribe', tickers: string[]) {
    if (!tickers.length || this.socket?.readyState !== WebSocket.OPEN || !this.authenticated) return;
    this.socket.send(JSON.stringify({ action, quotes: tickers }));
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || !this.shouldReconnect) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, RECONNECT_LIMIT_MS);
    this.reconnectAttempts += 1;
    this.setStatus('disconnected');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }
}
