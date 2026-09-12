// Judge smoke test. Runs without MongoDB and without npm install: it exercises
// src/lib/judge directly, so it is the fastest way to confirm the sandbox works
// on a new box.
//
//   node scripts/testJudge.js

import { judgeSubmission } from '../src/lib/judge/index.js';
import { VERDICT } from '../src/lib/constants.js';

const problem = {
  points: 100,
  timeLimitMs: 2000,
  memoryMb: 256,
  comparison: 'trimmed',
  samples: [
    { input: '3\n', output: '6\n' },
    { input: '5\n', output: '120\n' },
  ],
  hiddenTests: [
    { input: '1\n', expectedOutput: '1\n' },
    { input: '7\n', expectedOutput: '5040\n' },
  ],
};

const cases = [
  {
    name: 'accepted',
    expect: VERDICT.ACCEPTED,
    source: `#include <stdio.h>
int main(void){int n;if(scanf("%d",&n)!=1)return 1;long f=1;for(int i=2;i<=n;i++)f*=i;printf("%ld\\n",f);return 0;}`,
  },
  {
    name: 'wrong answer',
    expect: VERDICT.WRONG_ANSWER,
    source: `#include <stdio.h>
int main(void){int n;scanf("%d",&n);printf("%d\\n",n);return 0;}`,
  },
  {
    name: 'compile error',
    expect: VERDICT.COMPILE_ERROR,
    source: `int main(void){ this is not c }`,
  },
  {
    name: 'runtime error (null deref)',
    expect: VERDICT.RUNTIME_ERROR,
    source: `#include <stdio.h>
int main(void){int*p=0;*p=1;return 0;}`,
  },
  {
    name: 'infinite loop -> TLE',
    expect: VERDICT.TIME_LIMIT_EXCEEDED,
    source: `int main(void){for(;;);return 0;}`,
  },
  {
    name: 'network egress blocked',
    expect: VERDICT.WRONG_ANSWER,
    source: `#include <stdio.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
int main(void){int s=socket(AF_INET,SOCK_STREAM,0);
struct sockaddr_in a={0};a.sin_family=AF_INET;a.sin_port=htons(80);a.sin_addr.s_addr=inet_addr("1.1.1.1");
printf("connect=%d\\n", s<0?-99:connect(s,(struct sockaddr*)&a,sizeof a));return 0;}`,
    inspect: (r) => {
      const out = r.testResults[0]?.actualOutput ?? '';
      if (!out.includes('connect=-')) throw new Error(`expected failed connect, got: ${out.trim()}`);
      return 'egress refused';
    },
  },
  {
    name: 'host filesystem hidden',
    expect: VERDICT.WRONG_ANSWER,
    source: `#include <stdio.h>
int main(void){FILE*f=fopen("/etc/passwd","r");printf("%s\\n", f?"READABLE":"absent");return 0;}`,
    inspect: (r) => {
      const out = r.testResults[0]?.actualOutput ?? '';
      if (out.includes('READABLE')) throw new Error('/etc/passwd was readable inside the sandbox');
      return '/etc not mounted';
    },
  },
  {
    name: 'fork bomb contained',
    expect: null,
    source: `#include <unistd.h>
int main(void){for(;;)fork();return 0;}`,
    inspect: () => 'survived',
  },
];

const run = async () => {
  let failures = 0;

  for (const testCase of cases) {
    const startedAt = Date.now();
    let result;
    try {
      result = await judgeSubmission({ source: testCase.source, problem });
    } catch (err) {
      console.log(`FAIL  ${testCase.name}: judge threw ${err.message}`);
      failures += 1;
      continue;
    }

    const elapsed = Date.now() - startedAt;
    const verdictOk = testCase.expect === null || result.verdict === testCase.expect;
    let note = `${result.verdict} ${result.passed}/${result.total} in ${elapsed}ms`;

    if (verdictOk && testCase.inspect) {
      try {
        note += ` (${testCase.inspect(result)})`;
      } catch (err) {
        console.log(`FAIL  ${testCase.name}: ${err.message}`);
        failures += 1;
        continue;
      }
    }

    if (verdictOk) {
      console.log(`ok    ${testCase.name}: ${note}`);
    } else {
      failures += 1;
      console.log(`FAIL  ${testCase.name}: expected ${testCase.expect}, got ${note}`);
      if (result.compileOutput) console.log(`      ${result.compileOutput.split('\n')[0]}`);
    }
  }

  console.log(failures === 0 ? '\nall judge checks passed' : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
};

run();
