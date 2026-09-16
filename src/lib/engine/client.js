import https from 'node:https';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Client for the campus code execution engine (see the engine's API
// integration guide). Server-side only: the API key never leaves this process.
//
// TLS is verified against the SCIS Connect Internal CA named by
// QUERY_SERVER_CA_CERT. Verification is never disabled; a missing certificate
// is a configuration error, not something to route around.

const state = globalThis.__arenaEngine ?? { agent: null, active: 0, waiting: [] };
globalThis.__arenaEngine = state;

const RETRYABLE = new Set([502, 503, 504]);
const REQUEST_TIMEOUT_MS = 300000;

// About 45 seconds of backoff in total before giving up on a busy engine.
const maxAttempts = () => {
  const parsed = Number.parseInt(process.env.ENGINE_RETRY_ATTEMPTS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
};

export class EngineError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'EngineError';
    this.status = status;
  }
}

const settings = () => {
  const concurrency = Number.parseInt(process.env.ENGINE_CONCURRENCY ?? '', 10);
  return {
    baseUrl: (process.env.QUERY_SERVER_URL ?? '').replace(/\/+$/, ''),
    apiKey: process.env.QUERY_SERVER_API_KEY ?? '',
    caPath: process.env.QUERY_SERVER_CA_CERT ?? '',
    // The engine runs 4 programs at once for every client it serves.
    concurrency: Number.isFinite(concurrency) && concurrency > 0 ? Math.min(concurrency, 4) : 3,
  };
};

const agent = () => {
  if (state.agent) return state.agent;
  const { caPath } = settings();
  if (!caPath) throw new EngineError('QUERY_SERVER_CA_CERT is not set.');

  let ca;
  try {
    ca = readFileSync(path.resolve(caPath));
  } catch (err) {
    throw new EngineError(`Cannot read the engine CA certificate at ${caPath}: ${err.message}`);
  }

  state.agent = new https.Agent({ ca, keepAlive: true, maxSockets: 8 });
  return state.agent;
};

// Bounded concurrency across the whole process, so a burst of submissions
// becomes a queue here instead of a burst against the engine.
const withSlot = (task) =>
  new Promise((resolve, reject) => {
    const start = () => {
      state.active += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          state.active -= 1;
          const next = state.waiting.shift();
          if (next) next();
        });
    };
    if (state.active < settings().concurrency) start();
    else state.waiting.push(start);
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const send = ({ method, pathname, body, authenticated }) =>
  new Promise((resolve, reject) => {
    const { baseUrl, apiKey } = settings();
    if (!baseUrl) {
      reject(new EngineError('QUERY_SERVER_URL is not set.'));
      return;
    }
    if (authenticated && !apiKey) {
      reject(new EngineError('QUERY_SERVER_API_KEY is not set.'));
      return;
    }

    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const url = new URL(`${baseUrl}${pathname}`);
    const request = https.request(
      url,
      {
        method,
        agent: agent(),
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
          ...(authenticated ? { 'x-api-key': apiKey } : {}),
        },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            // Proxies answer 502/504 with HTML; the status code carries the meaning.
          }
          resolve({ status: response.statusCode, json, text });
        });
      }
    );

    request.on('timeout', () => request.destroy(new EngineError('Engine request timed out.')));
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });

const describeFailure = (status, text) => {
  const detail = text ? `: ${text.slice(0, 300)}` : '';
  switch (status) {
    case 400:
      return `Engine rejected the request payload${detail}`;
    case 401:
      return 'Engine rejected the API key (check QUERY_SERVER_API_KEY).';
    case 403:
      return 'Engine refused the connection: this backend is not on the campus/private network.';
    case 413:
      return 'Engine request exceeds 16 MB.';
    case 422:
      return `Engine could not validate the request${detail}`;
    default:
      return `Engine HTTP ${status}${detail}`;
  }
};

const call = async (options) => {
  let lastError = null;

  const attempts = maxAttempts();
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await send(options);
      if (response.status >= 200 && response.status < 300) return response.json;
      if (!RETRYABLE.has(response.status)) {
        throw new EngineError(describeFailure(response.status, response.text), response.status);
      }
      lastError = new EngineError(describeFailure(response.status, response.text), response.status);
    } catch (err) {
      if (err instanceof EngineError && err.status && !RETRYABLE.has(err.status)) throw err;
      // Config errors and 300s timeouts are final; retrying a timeout would hold
      // the contestant's request for up to 40 minutes.
      if (err instanceof EngineError && !err.status) throw err;
      // TLS verification failures must surface, never be retried into silence.
      if (err.code && /CERT|SELF_SIGNED|UNABLE_TO_VERIFY/.test(err.code)) {
        throw new EngineError(`Engine TLS verification failed (${err.code}). Check QUERY_SERVER_CA_CERT.`);
      }
      lastError = err;
    }

    // 503 means busy/queue full: back off and try again, as the guide asks.
    if (attempt < attempts) await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));
  }

  throw lastError instanceof EngineError
    ? lastError
    : new EngineError(`Engine unreachable: ${lastError?.message ?? 'unknown error'}`);
};

export const engineHealth = () => call({ method: 'GET', pathname: '/health', authenticated: false });

export const engineStats = () => call({ method: 'GET', pathname: '/api/v2/stats', authenticated: true });

export const runOnEngine = ({ source, testcases, timeLimitMs, memoryMb, stopOnFirstFailure = false }) =>
  withSlot(() =>
    call({
      method: 'POST',
      pathname: '/api/v2/code/run',
      authenticated: true,
      body: {
        language: 'c',
        source_code: source,
        testcases,
        time_limit: timeLimitMs,
        memory_limit: memoryMb,
        stop_on_first_failure: stopOnFirstFailure,
      },
    })
  );
