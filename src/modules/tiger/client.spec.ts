import test from 'node:test';
import assert from 'node:assert/strict';

import {
  type TigerAdapterComboCancelResponse,
  type TigerAdapterComboPlaceResponse,
  type TigerAdapterComboPreviewResponse,
  type TigerAdapterOptionOrder,
  type TigerAdapterOptionPosition,
  TigerAdapterError,
  createTigerAdapterClient,
  createTigerAdapterClientFromEnv,
} from './client.js';

test('preview request payload mapping', async () => {
  let capturedInput: RequestInfo | URL | undefined;
  let capturedInit: RequestInit | undefined;

  const client = createTigerAdapterClient({
    baseUrl: 'http://127.0.0.1:8000',
    token: 'secret-token',
    fetchImpl: async (input, init) => {
      capturedInput = input;
      capturedInit = init;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const preview: TigerAdapterComboPreviewResponse = await client.previewCombo({
    account: 'ACC-1',
    strategyType: 'BULL_PUT_CREDIT',
    symbol: 'AAPL',
    quantity: 2,
    netPrice: 1.25,
    tif: 'DAY',
    clientOrderId: 'preview-1',
    legs: [
      { symbol: 'AAPL', expiry: '20260327', strike: 190, putCall: 'PUT', action: 'SELL' },
      { symbol: 'AAPL', expiry: '20260327', strike: 188, putCall: 'PUT', action: 'BUY' },
    ],
  });

  assert.equal(preview.ok, true);
  assert.equal(String(capturedInput), 'http://127.0.0.1:8000/api/v1/options/preview-combo');
  assert.equal(capturedInit?.method, 'POST');
  assert.equal(capturedInit?.headers instanceof Headers ? capturedInit.headers.get('authorization') : undefined, 'Bearer secret-token');
  const body = JSON.parse(String(capturedInit?.body));
  assert.deepEqual(body, {
    account: 'ACC-1',
    strategyType: 'BULL_PUT_CREDIT',
    symbol: 'AAPL',
    quantity: 2,
    netPrice: 1.25,
    tif: 'DAY',
    clientOrderId: 'preview-1',
    legs: [
      { symbol: 'AAPL', expiry: '20260327', strike: 190, putCall: 'PUT', action: 'SELL' },
      { symbol: 'AAPL', expiry: '20260327', strike: 188, putCall: 'PUT', action: 'BUY' },
    ],
  });
});

test('combo placement payload mapping', async () => {
  let capturedInit: RequestInit | undefined;

  const client = createTigerAdapterClient({
    baseUrl: 'http://127.0.0.1:8000',
    token: 'secret-token',
    fetchImpl: async (_input, init) => {
      capturedInit = init;
      return new Response(JSON.stringify({ orderId: 'T-100' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const place: TigerAdapterComboPlaceResponse = await client.placeCombo({
    account: 'ACC-1',
    strategyType: 'BEAR_CALL_CREDIT',
    symbol: 'AAPL',
    quantity: 1,
    netPrice: 0.95,
    tif: 'GTC',
    clientOrderId: 'place-1',
    legs: [
      { symbol: 'AAPL', expiry: '20260327', strike: 105, putCall: 'CALL', action: 'SELL' },
      { symbol: 'AAPL', expiry: '20260327', strike: 110, putCall: 'CALL', action: 'BUY' },
    ],
  });

  assert.equal(place.orderId, 'T-100');
  const body = JSON.parse(String(capturedInit?.body));
  assert.equal(capturedInit?.method, 'POST');
  assert.deepEqual(body, {
    account: 'ACC-1',
    strategyType: 'BEAR_CALL_CREDIT',
    symbol: 'AAPL',
    quantity: 1,
    netPrice: 0.95,
    tif: 'GTC',
    clientOrderId: 'place-1',
    legs: [
      { symbol: 'AAPL', expiry: '20260327', strike: 105, putCall: 'CALL', action: 'SELL' },
      { symbol: 'AAPL', expiry: '20260327', strike: 110, putCall: 'CALL', action: 'BUY' },
    ],
  });
});

test('authorization header handling', async () => {
  let capturedHeaders: Headers | undefined;

  const client = createTigerAdapterClient({
    baseUrl: 'http://127.0.0.1:8000',
    fetchImpl: async (_input, init) => {
      capturedHeaders = init?.headers instanceof Headers ? init.headers : undefined;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const orders: TigerAdapterOptionOrder[] = await client.getOptionOrders();

  assert.deepEqual(orders, []);
  assert.equal(capturedHeaders?.get('authorization'), null);
  assert.equal(capturedHeaders?.get('content-type'), 'application/json');
});

test('non-200 responses return normalized errors', async () => {
  const client = createTigerAdapterClient({
    baseUrl: 'http://127.0.0.1:8000',
    fetchImpl: async () =>
      new Response('upstream exploded', {
        status: 502,
        headers: { 'content-type': 'text/plain' },
      }),
  });

  await assert.rejects(
    async () => {
      const cancel: TigerAdapterComboCancelResponse = await client.cancelCombo({
        account: 'ACC-1',
        orderId: 'T-100',
        symbol: 'AAPL',
      });
      assert.ok(cancel);
    },
    (error: unknown) => {
      assert.ok(error instanceof TigerAdapterError);
      assert.equal(error.status, 502);
      assert.equal(error.endpoint, '/api/v1/options/cancel-combo');
      assert.equal(error.body, 'upstream exploded');
      return true;
    }
  );
});

test('client can be created from env using TIGER_ADAPTER_API_KEY', async () => {
  let capturedInput: RequestInfo | URL | undefined;
  let capturedInit: RequestInit | undefined;

  const client = createTigerAdapterClientFromEnv({
    env: {
      TIGER_ADAPTER_URL: 'http://tiger.local:8000',
      TIGER_ADAPTER_API_KEY: 'env-api-key',
    },
    fetchImpl: async (input, init) => {
      capturedInput = input;
      capturedInit = init;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.ok(client);
  const orders: TigerAdapterOptionOrder[] = await client.getOptionOrders();
  assert.equal(String(capturedInput), 'http://tiger.local:8000/api/v1/options/orders');
  assert.equal(capturedInit?.headers instanceof Headers ? capturedInit.headers.get('authorization') : undefined, 'Bearer env-api-key');
  assert.deepEqual(orders, []);
});

test('client ignores the legacy Tiger adapter token env', async () => {
  let capturedInit: RequestInit | undefined;
  const legacyEnvName = ['TIGER', 'ADAPTER', 'TOKEN'].join('_');

  const client = createTigerAdapterClientFromEnv({
    env: {
      TIGER_ADAPTER_URL: 'http://tiger.local:8000',
      [legacyEnvName]: 'legacy-token',
    },
    fetchImpl: async (_input, init) => {
      capturedInit = init;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const orders: TigerAdapterOptionOrder[] = await client.getOptionOrders();
  assert.equal(capturedInit?.headers instanceof Headers ? capturedInit.headers.get('authorization') : undefined, null);
  assert.deepEqual(orders, []);
});
