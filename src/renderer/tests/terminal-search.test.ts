import { describe, expect, it } from 'vitest';
import {
  collectTerminalSearchMatches,
  getNextTerminalSearchIndex,
  type TerminalSearchBufferLike,
  type TerminalSearchBufferLineLike,
  type TerminalSearchMatch,
} from '@renderer/lib/pty/terminal-search';

class MockBufferLine implements TerminalSearchBufferLineLike {
  constructor(
    private readonly text: string,
    readonly isWrapped: boolean = false
  ) {}

  translateToString(): string {
    return this.text;
  }
}

function makeBuffer(lines: Array<{ text: string; isWrapped?: boolean }>): TerminalSearchBufferLike {
  const bufferLines = lines.map((line) => new MockBufferLine(line.text, line.isWrapped ?? false));
  return {
    length: bufferLines.length,
    getLine: (index: number) => bufferLines[index],
  };
}

function makeCellBuffer(rows: Array<Array<[string, number]>>): TerminalSearchBufferLike {
  const lines = rows.map((cells, row) => {
    const physical = cells.flatMap(([chars, width]) => [
      { getChars: () => chars, getWidth: () => width },
      ...Array.from({ length: width - 1 }, () => ({ getChars: () => '', getWidth: () => 0 })),
    ]);
    return {
      isWrapped: row > 0,
      length: physical.length,
      getCell: (col: number) => physical[col],
      translateToString: () => cells.map(([chars]) => chars).join(''),
    };
  });
  return { length: lines.length, getLine: (row) => lines[row] };
}

describe('terminal-search', () => {
  it('finds case-insensitive matches on buffer rows', () => {
    const buffer = makeBuffer([{ text: 'Alpha beta' }, { text: 'beta gamma' }]);

    expect(collectTerminalSearchMatches(buffer, 'BETA')).toEqual<TerminalSearchMatch[]>([
      { row: 0, col: 6, length: 4 },
      { row: 1, col: 0, length: 4 },
    ]);
  });

  it('maps wrapped-line matches back to the physical row and column', () => {
    const buffer = makeBuffer([
      { text: 'Hello ', isWrapped: false },
      { text: 'world', isWrapped: true },
      { text: 'separate line', isWrapped: false },
    ]);

    expect(collectTerminalSearchMatches(buffer, 'world')).toEqual<TerminalSearchMatch[]>([
      { row: 1, col: 0, length: 5 },
    ]);
  });

  it.each([
    {
      cells: [
        ['界', 2],
        ['x', 1],
      ],
      query: 'x',
      col: 2,
      length: 1,
    },
    {
      cells: [
        ['界', 2],
        ['x', 1],
      ],
      query: '界',
      col: 0,
      length: 2,
    },
    {
      cells: [
        ['😀', 2],
        ['x', 1],
      ],
      query: 'x',
      col: 2,
      length: 1,
    },
    {
      cells: [
        ['e\u0301', 1],
        ['x', 1],
      ],
      query: 'e\u0301',
      col: 0,
      length: 1,
    },
    {
      cells: [
        ['İ', 1],
        ['x', 1],
      ],
      query: 'x',
      col: 1,
      length: 1,
    },
    { cells: [['İ', 1]], query: 'i\u0307', col: 0, length: 1 },
  ])('maps Unicode text to cells: $query in $cells', ({ cells, query, col, length }) => {
    expect(
      collectTerminalSearchMatches(makeCellBuffer([cells as Array<[string, number]>]), query)
    ).toEqual([{ row: 0, col, length }]);
  });

  it('measures a Unicode match across wrapped rows in cells', () => {
    const buffer = makeCellBuffer([
      [['界', 2]],
      [
        ['e\u0301', 1],
        ['x', 1],
      ],
    ]);
    expect(collectTerminalSearchMatches(buffer, '界e\u0301')).toEqual([
      { row: 0, col: 0, length: 3 },
    ]);
    expect(collectTerminalSearchMatches(buffer, 'x')).toEqual([{ row: 1, col: 1, length: 1 }]);
  });

  it('counts repeated matching marks in one cell as one selectable result', () => {
    expect(
      collectTerminalSearchMatches(
        makeCellBuffer([
          [
            ['e\u0301\u0301', 1],
            ['x', 1],
          ],
        ]),
        '\u0301'
      )
    ).toEqual([{ row: 0, col: 0, length: 1 }]);
  });

  it('preserves contextual Greek lowercasing', () => {
    expect(
      collectTerminalSearchMatches(
        makeCellBuffer([
          [
            ['Ο', 1],
            ['Σ', 1],
          ],
        ]),
        'ος'
      )
    ).toEqual([{ row: 0, col: 0, length: 2 }]);
  });

  it('does not join hard line breaks', () => {
    expect(
      collectTerminalSearchMatches(makeBuffer([{ text: 'ab' }, { text: 'cd' }]), 'bc')
    ).toEqual([]);
  });

  it('uses viewport columns rather than retained line capacity after a resize', () => {
    const buffer = makeCellBuffer([
      [
        ['a', 1],
        ['b', 1],
        ['z', 1],
      ],
      [
        ['c', 1],
        ['d', 1],
      ],
    ]);
    expect(collectTerminalSearchMatches(buffer, 'bc', 2)).toEqual([{ row: 0, col: 1, length: 2 }]);
    expect(collectTerminalSearchMatches(buffer, 'z', 2)).toEqual([]);
  });

  it('cycles forward and backward through matches', () => {
    const matches: TerminalSearchMatch[] = [
      { row: 0, col: 1, length: 3 },
      { row: 3, col: 2, length: 3 },
      { row: 7, col: 0, length: 3 },
    ];

    expect(getNextTerminalSearchIndex(matches, null, 'next')).toBe(0);
    expect(getNextTerminalSearchIndex(matches, null, 'prev')).toBe(2);
    expect(getNextTerminalSearchIndex(matches, matches[0], 'next')).toBe(1);
    expect(getNextTerminalSearchIndex(matches, matches[0], 'prev')).toBe(2);
    expect(getNextTerminalSearchIndex(matches, matches[2], 'next')).toBe(0);
  });
});
