// A stand-in for the campus code execution engine, implementing the API from
// its integration guide: GET /health, GET /api/v2/stats and
// POST /api/v2/code/run, over HTTPS with its own private CA.
//
// Programs really run (in the local bubblewrap sandbox), and output comparison
// is exact, so the platform's handling of engine verdicts is exercised end to
// end without campus network access.
//
//   node scripts/mockEngine.js          # prints the env vars to point the app at it

import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { compileSource } from '../src/lib/judge/compile.js';
import { runOneTest } from '../src/lib/judge/run.js';

const openssl = (args, cwd) => execFileSync('openssl', args, { cwd, stdio: 'pipe' });

export const makeCertificates = (commonName = 'Mock SCIS Connect Internal CA') => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mock-engine-'));
  openssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt', '-days', '1', '-subj', `/CN=${commonName}`], dir);
  openssl(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'server.key', '-out', 'server.csr', '-subj', '/CN=127.0.0.1'], dir);
  writeFileSync(path.join(dir, 'san.ext'), 'subjectAltName=IP:127.0.0.1\n');
  openssl(['x509', '-req', '-in', 'server.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'server.crt', '-days', '1', '-extfile', 'san.ext'], dir);
  return { dir, caPath: path.join(dir, 'ca.crt'), keyPath: path.join(dir, 'server.key'), certPath: path.join(dir, 'server.crt') };
};

const verdictFor = (result, expected) => {
  if (!result.ok) return 'Internal Error';
  if (result.timedOut || result.signal === 'SIGXCPU' || result.signal === 'SIGKILL') return 'Time Limit Exceeded';
  if (result.outputTruncated) return 'Output Limit Exceeded';
  if (result.signal || result.exitCode !== 0) return 'Runtime Error';
  return result.stdout === expected ? 'Accepted' : 'Wrong Answer';
};

const handleRun = async (body) => {
  const { language, source_code: source, testcases, time_limit: timeLimit, memory_limit: memoryLimit } = body ?? {};
  if (language !== 'c' || typeof source !== 'string' || !Array.isArray(testcases) || !timeLimit || !memoryLimit) {
    return { status: 400, json: { error: 'missing or invalid field' } };
  }

  const workdir = await mkdtemp(path.join(tmpdir(), 'mock-run-'));
  try {
    const compiled = await compileSource({ source, workdir });
    if (!compiled.ok) {
      return {
        status: 200,
        json: {
          compile: { ok: false, output: compiled.diagnostics, time_ms: 0 },
          results: [],
          summary: { verdict: 'Compilation Error', passed: 0, total: testcases.length, executed: 0 },
        },
      };
    }

    const results = [];
    for (const [index, testcase] of testcases.entries()) {
      const run = await runOneTest({ binaryPath: compiled.binaryPath, input: testcase.input, timeLimitMs: timeLimit, memoryMb: memoryLimit });
      const verdict = verdictFor(run, testcase.output);
      results.push({ index, passed: verdict === 'Accepted', verdict, time_ms: run.wallMs, exit_code: run.exitCode, stdout: run.stdout, stderr: run.stderr });
      if (body.stop_on_first_failure && verdict !== 'Accepted') break;
    }

    const passed = results.filter((r) => r.passed).length;
    const firstFailure = results.find((r) => !r.passed);
    return {
      status: 200,
      json: {
        compile: { ok: true, output: compiled.diagnostics, time_ms: 0 },
        results,
        summary: { verdict: firstFailure ? firstFailure.verdict : 'Accepted', passed, total: testcases.length, executed: results.length },
      },
    };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
};

export const startMockEngine = async ({ apiKey = 'mock-key', busyFirstRun = true, certificates = makeCertificates() } = {}) => {
  let runs = 0;
  let busySent = !busyFirstRun;

  const server = https.createServer(
    { key: readFileSync(certificates.keyPath), cert: readFileSync(certificates.certPath) },
    (req, res) => {
      const reply = (status, json) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(json));
      };
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', async () => {
        const url = new URL(req.url, 'https://127.0.0.1');
        if (req.method === 'GET' && url.pathname === '/grader/health') {
          return reply(200, { status: 'ok', service: 'mca-connect-query-server', version: 'mock' });
        }
        if (req.headers['x-api-key'] !== apiKey) return reply(401, { error: 'invalid api key' });
        if (req.method === 'GET' && url.pathname === '/grader/api/v2/stats') {
          return reply(200, { running: 0, queued: 0, runs });
        }
        if (req.method === 'POST' && url.pathname === '/grader/api/v2/code/run') {
          if (!busySent) {
            busySent = true;
            return reply(503, { error: 'queue full' });
          }
          runs += 1;
          let body;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            return reply(400, { error: 'invalid json' });
          }
          const { status, json } = await handleRun(body);
          return reply(status, json);
        }
        return reply(404, { error: 'not found' });
      });
    }
  );

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    url: `https://127.0.0.1:${port}/grader`,
    caPath: certificates.caPath,
    apiKey,
    runs: () => runs,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          rmSync(certificates.dir, { recursive: true, force: true });
          resolve();
        });
        server.closeAllConnections?.();
      }),
  };
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const engine = await startMockEngine({ busyFirstRun: false });
  console.log('Mock engine running. Point the app at it with:\n');
  console.log(`JUDGE_BACKEND=engine QUERY_SERVER_URL=${engine.url} QUERY_SERVER_API_KEY=${engine.apiKey} QUERY_SERVER_CA_CERT=${engine.caPath}`);
  console.log('\nCtrl+C to stop.');
  process.on('SIGINT', async () => {
    await engine.close();
    process.exit(0);
  });
}
