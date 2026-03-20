export type TigerAdapterLeg = {
  symbol: string;
  expiry: string;
  strike: number;
  putCall: 'CALL' | 'PUT';
  action: 'BUY' | 'SELL';
  quantity?: number;
  multiplier?: number;
};

export type TigerAdapterComboRequest = {
  account?: string;
  strategyType: string;
  symbol: string;
  quantity: number;
  netPrice: number;
  tif?: 'DAY' | 'GTC';
  clientOrderId?: string;
  legs: TigerAdapterLeg[];
};

export type TigerAdapterComboCancelRequest = {
  account?: string;
  orderId: string;
  symbol: string;
};

export type TigerAdapterComboPreviewResponse = {
  ok?: boolean;
  message?: string;
  previewId?: string;
  estimatedMargin?: number;
  requiredBuyingPower?: number;
  raw?: unknown;
};

export type TigerAdapterComboPlaceResponse = {
  orderId?: string;
  status?: string;
  message?: string;
  raw?: unknown;
};

export type TigerAdapterComboCancelResponse = {
  orderId?: string;
  status?: string;
  message?: string;
  raw?: unknown;
};

export type TigerAdapterOptionPosition = {
  symbol?: string;
  quantity?: number;
  putCall?: 'CALL' | 'PUT';
  strike?: number;
  expiry?: string;
  averageCost?: number;
  marketPrice?: number;
  marketValue?: number;
  raw?: unknown;
};

export type TigerAdapterOptionOrder = {
  orderId?: string;
  symbol?: string;
  status?: string;
  quantity?: number;
  filledQuantity?: number;
  action?: 'BUY' | 'SELL';
  orderType?: string;
  limitPrice?: number;
  netPrice?: number;
  raw?: unknown;
};

export type TigerAdapterClientOptions = {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
};

export type TigerAdapterEnv = Record<string, string | undefined>;

export type TigerAdapterClientFromEnvOptions = {
  env?: TigerAdapterEnv;
  fetchImpl?: typeof fetch;
};

export class TigerAdapterError extends Error {
  readonly status: number;
  readonly endpoint: string;
  readonly body: unknown;

  constructor(status: number, endpoint: string, body: unknown) {
    super(`Tiger adapter request failed with ${status} for ${endpoint}`);
    this.name = 'TigerAdapterError';
    this.status = status;
    this.endpoint = endpoint;
    this.body = body;
  }
}

export type TigerAdapterClient = {
  previewCombo(request: TigerAdapterComboRequest): Promise<TigerAdapterComboPreviewResponse>;
  placeCombo(request: TigerAdapterComboRequest): Promise<TigerAdapterComboPlaceResponse>;
  cancelCombo(request: TigerAdapterComboCancelRequest): Promise<TigerAdapterComboCancelResponse>;
  getOptionPositions(): Promise<TigerAdapterOptionPosition[]>;
  getOptionOrders(): Promise<TigerAdapterOptionOrder[]>;
};

const DEFAULT_BASE_URL = 'http://127.0.0.1:8000';

export function createTigerAdapterClient(options: TigerAdapterClientOptions): TigerAdapterClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = options.token?.trim() || '';

  return {
    previewCombo(request) {
      return requestJson<TigerAdapterComboPreviewResponse>(fetchImpl, baseUrl, '/api/v1/options/preview-combo', {
        method: 'POST',
        token,
        body: request,
      });
    },
    placeCombo(request) {
      return requestJson<TigerAdapterComboPlaceResponse>(fetchImpl, baseUrl, '/api/v1/options/place-combo', {
        method: 'POST',
        token,
        body: request,
      });
    },
    cancelCombo(request) {
      return requestJson<TigerAdapterComboCancelResponse>(fetchImpl, baseUrl, '/api/v1/options/cancel-combo', {
        method: 'POST',
        token,
        body: request,
      });
    },
    getOptionPositions() {
      return requestJson<TigerAdapterOptionPosition[]>(fetchImpl, baseUrl, '/api/v1/options/positions', {
        method: 'GET',
        token,
      });
    },
    getOptionOrders() {
      return requestJson<TigerAdapterOptionOrder[]>(fetchImpl, baseUrl, '/api/v1/options/orders', {
        method: 'GET',
        token,
      });
    },
  };
}

export function createTigerAdapterClientFromEnv(
  options: TigerAdapterClientFromEnvOptions = {}
): TigerAdapterClient {
  const env = options.env ?? process.env;
  const baseUrl = env.TIGER_ADAPTER_URL ?? env.TIGER_ADAPTER_BASE_URL ?? DEFAULT_BASE_URL;
  return createTigerAdapterClient({
    baseUrl,
    token: env.TIGER_ADAPTER_TOKEN,
    fetchImpl: options.fetchImpl,
  });
}

async function requestJson<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  endpoint: string,
  options: {
    method: 'GET' | 'POST';
    token?: string;
    body?: unknown;
  }
): Promise<T> {
  const response = await fetchImpl(makeUrl(baseUrl, endpoint), {
    method: options.method,
    headers: buildHeaders(options.token),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const parsedBody = await readResponseBody(response);
  if (!response.ok) {
    throw new TigerAdapterError(response.status, endpoint, parsedBody);
  }

  return parsedBody as T;
}

function buildHeaders(token?: string): Headers {
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  if (token && token.trim()) {
    headers.set('authorization', `Bearer ${token.trim()}`);
  }
  return headers;
}

function makeUrl(baseUrl: string, endpoint: string): string {
  return `${normalizeBaseUrl(baseUrl)}${endpoint}`;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  const text = await response.text();
  return text.length > 0 ? text : null;
}
