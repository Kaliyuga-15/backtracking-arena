// The backtracking level's cards.
//
// Each card lists sample inputs and hidden inputs but NO expected output: the
// seeder derives the answer key by compiling and running `referenceSolution`.
// That means a card can never ship an expected output that disagrees with its
// own reference, which is the usual way hand-written judge data goes wrong.
//
// To add a problem, append an entry and re-run `npm run seed:problems`.
// To retire one, drop it here and archive it via DELETE /api/arena/problems/:slug.
//
// Titles are intentionally neutral. Naming card 4 "N-Queens" would hand over
// the algorithm, and inferring the rule is the whole exercise.

import { PROBLEM_STATUS } from '../src/lib/constants.js';

const STARTER = `#include <stdio.h>

int main(void) {
    /* Read from stdin, print to stdout. */
    return 0;
}
`;

export const problemCards = [
  {
    slug: 'switches',
    title: 'Card 1 - Switches',
    order: 1,
    points: 100,
    timeLimitMs: 2000,
    statement:
      'Every example below is one complete run: the first line is the input, the block under it is the exact output. Work out the rule, then reproduce it.',
    hint: 'Each line of output is as long as the number you were given.',
    starterCode: STARTER,
    sampleInputs: ['1\n', '3\n'],
    hiddenInputs: ['2\n', '4\n', '7\n', '10\n'],
    referenceSolution: `#include <stdio.h>
static int n;
static char buf[40];
static void rec(int i) {
    if (i == n) { buf[n] = 0; printf("%s\\n", buf); return; }
    buf[i] = '0'; rec(i + 1);
    buf[i] = '1'; rec(i + 1);
}
int main(void) {
    if (scanf("%d", &n) != 1) return 1;
    rec(0);
    return 0;
}
`,
  },
  {
    slug: 'line-ups',
    title: 'Card 2 - Line-ups',
    order: 2,
    points: 150,
    timeLimitMs: 2000,
    statement:
      'One integer in, many lines out. The ordering of the lines is part of the pattern - match it exactly.',
    hint: 'Nothing repeats within a line.',
    starterCode: STARTER,
    sampleInputs: ['2\n', '3\n'],
    hiddenInputs: ['1\n', '4\n', '6\n', '7\n'],
    referenceSolution: `#include <stdio.h>
static int n, a[12], used[13];
static void rec(int d) {
    if (d == n) {
        for (int i = 0; i < n; i++) printf("%d%c", a[i], i + 1 == n ? '\\n' : ' ');
        return;
    }
    for (int v = 1; v <= n; v++) {
        if (used[v]) continue;
        used[v] = 1; a[d] = v;
        rec(d + 1);
        used[v] = 0;
    }
}
int main(void) {
    if (scanf("%d", &n) != 1) return 1;
    rec(0);
    return 0;
}
`,
  },
  {
    slug: 'committees',
    title: 'Card 3 - Committees',
    order: 3,
    points: 150,
    timeLimitMs: 2000,
    statement:
      'Two integers on the input line. Every output line holds numbers in increasing order, and the lines themselves are ordered too.',
    hint: 'The second input number fixes how many values appear on each line.',
    starterCode: STARTER,
    sampleInputs: ['4 2\n', '5 3\n'],
    hiddenInputs: ['3 1\n', '5 5\n', '6 3\n', '9 4\n'],
    referenceSolution: `#include <stdio.h>
static int n, k, a[32];
static void rec(int start, int d) {
    if (d == k) {
        for (int i = 0; i < k; i++) printf("%d%c", a[i], i + 1 == k ? '\\n' : ' ');
        return;
    }
    for (int v = start; v <= n; v++) { a[d] = v; rec(v + 1, d + 1); }
}
int main(void) {
    if (scanf("%d %d", &n, &k) != 2) return 1;
    rec(1, 0);
    return 0;
}
`,
  },
  {
    slug: 'matched-pairs',
    title: 'Card 4 - Matched Pairs',
    order: 4,
    points: 200,
    timeLimitMs: 2000,
    statement:
      'One integer in. Each output line has exactly twice that many characters, and the lines are in ascending order.',
    hint: 'Reading any line from the left, the count of the first character never falls behind the second.',
    starterCode: STARTER,
    sampleInputs: ['2\n', '3\n'],
    hiddenInputs: ['1\n', '4\n', '6\n', '9\n'],
    referenceSolution: `#include <stdio.h>
static int n;
static char buf[40];
static void rec(int i, int open, int close) {
    if (i == 2 * n) { buf[i] = 0; printf("%s\\n", buf); return; }
    if (open < n)    { buf[i] = '('; rec(i + 1, open + 1, close); }
    if (close < open) { buf[i] = ')'; rec(i + 1, open, close + 1); }
}
int main(void) {
    if (scanf("%d", &n) != 1) return 1;
    rec(0, 0, 0);
    return 0;
}
`,
  },
  {
    slug: 'safe-placements',
    title: 'Card 5 - Safe Placements',
    order: 5,
    points: 300,
    timeLimitMs: 3000,
    statement:
      'One integer in, one integer out. The sequence does not grow smoothly - look at what happens between 5 and 6 before you guess.',
    hint: 'Think about a square board and pieces that attack along rows, columns and both diagonals.',
    starterCode: STARTER,
    sampleInputs: ['4\n', '5\n', '6\n'],
    hiddenInputs: ['1\n', '2\n', '3\n', '8\n', '10\n', '11\n'],
    referenceSolution: `#include <stdio.h>
static int n, total;
static int col[16], d1[64], d2[64];
static void rec(int r) {
    if (r == n) { total++; return; }
    for (int c = 0; c < n; c++) {
        if (col[c] || d1[r + c] || d2[r - c + n]) continue;
        col[c] = d1[r + c] = d2[r - c + n] = 1;
        rec(r + 1);
        col[c] = d1[r + c] = d2[r - c + n] = 0;
    }
}
int main(void) {
    if (scanf("%d", &n) != 1) return 1;
    rec(0);
    printf("%d\\n", total);
    return 0;
}
`,
  },
].map((card) => ({ ...card, status: PROBLEM_STATUS.PUBLISHED }));
