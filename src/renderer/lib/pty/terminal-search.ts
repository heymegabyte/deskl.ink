export interface TerminalSearchBufferLineLike {
  isWrapped?: boolean;
  length?: number;
  getCell?(column: number): { getChars(): string; getWidth(): number } | undefined;
  translateToString(trimRight?: boolean, startColumn?: number, endColumn?: number): string;
}

export interface TerminalSearchBufferLike {
  length: number;
  getLine(index: number): TerminalSearchBufferLineLike | undefined;
}

export interface TerminalSearchMatch {
  row: number;
  col: number;
  length: number;
}

interface SearchCell {
  row: number;
  col: number;
  offset: number;
  width: number;
}

interface LogicalLine {
  text: string;
  cells: SearchCell[];
}

function buildLogicalLines(buffer: TerminalSearchBufferLike, columns?: number): LogicalLine[] {
  const logicalLines: LogicalLine[] = [];
  let current: LogicalLine | null = null;
  let cellOffset = 0;

  for (let row = 0; row < buffer.length; row += 1) {
    const line = buffer.getLine(row);
    if (!line) continue;
    if (!current || !line.isWrapped) {
      if (current) logicalLines.push(current);
      current = { text: '', cells: [] };
      cellOffset = 0;
    }

    const logicalLine = current;
    const appendCell = (chars: string, col: number, width: number) => {
      logicalLine.text += chars;
      // Every folded code unit points to its complete terminal cell. Lowercase the
      // whole logical line below to preserve contextual mappings such as Greek sigma.
      const foldedLength = chars.toLowerCase().length;
      for (let index = 0; index < foldedLength; index += 1) {
        logicalLine.cells.push({ row, col, offset: cellOffset + col, width });
      }
    };

    if (line.getCell && line.length !== undefined) {
      const length = Math.min(line.length, columns ?? line.length);
      for (let col = 0; col < length; col += 1) {
        const cell = line.getCell(col);
        if (!cell || cell.getWidth() === 0) continue;
        appendCell(cell.getChars() || ' ', col, cell.getWidth());
      }
      cellOffset += columns ?? length;
    } else {
      // Structural text-only buffers are used by non-xterm callers and ASCII tests.
      const text = line.translateToString(false);
      for (let col = 0; col < text.length; col += 1) appendCell(text[col], col, 1);
      cellOffset += columns ?? text.length;
    }
  }

  if (current) logicalLines.push(current);
  return logicalLines;
}

export function collectTerminalSearchMatches(
  buffer: TerminalSearchBufferLike,
  query: string,
  columns?: number
): TerminalSearchMatch[] {
  if (!query) return [];

  const normalizedQuery = query.toLowerCase();
  if (!normalizedQuery) return [];

  const matches: TerminalSearchMatch[] = [];
  const logicalLines = buildLogicalLines(buffer, columns);

  for (const logicalLine of logicalLines) {
    const haystack = logicalLine.text.toLowerCase();
    let fromIndex = 0;

    while (fromIndex <= haystack.length - normalizedQuery.length) {
      const matchIndex = haystack.indexOf(normalizedQuery, fromIndex);
      if (matchIndex === -1) break;

      const start = logicalLine.cells[matchIndex];
      const end = logicalLine.cells[matchIndex + normalizedQuery.length - 1];
      const match = {
        row: start.row,
        col: start.col,
        length: end.offset + end.width - start.offset,
      };
      const previous = matches[matches.length - 1];
      if (!previous || compareMatchPosition(previous, match) !== 0) matches.push(match);

      fromIndex = matchIndex + Math.max(1, normalizedQuery.length);
    }
  }

  return matches;
}

function compareMatchPosition(left: TerminalSearchMatch, right: TerminalSearchMatch): number {
  if (left.row !== right.row) return left.row - right.row;
  if (left.col !== right.col) return left.col - right.col;
  return left.length - right.length;
}

function findExactCurrentMatchIndex(
  matches: TerminalSearchMatch[],
  currentMatch: TerminalSearchMatch | null
): number {
  if (!currentMatch) return -1;

  return matches.findIndex(
    (candidate) =>
      candidate.row === currentMatch.row &&
      candidate.col === currentMatch.col &&
      candidate.length === currentMatch.length
  );
}

export function getNextTerminalSearchIndex(
  matches: TerminalSearchMatch[],
  currentMatch: TerminalSearchMatch | null,
  direction: 'next' | 'prev'
): number {
  if (matches.length === 0) return -1;

  const currentMatchIndex = findExactCurrentMatchIndex(matches, currentMatch);
  if (currentMatchIndex === -1 && currentMatch) {
    if (direction === 'prev') {
      for (let index = matches.length - 1; index >= 0; index -= 1) {
        if (compareMatchPosition(matches[index], currentMatch) < 0) {
          return index;
        }
      }
      return matches.length - 1;
    }

    const nextIndex = matches.findIndex(
      (candidate) => compareMatchPosition(candidate, currentMatch) > 0
    );
    return nextIndex === -1 ? 0 : nextIndex;
  }

  if (currentMatchIndex === -1) {
    return direction === 'prev' ? matches.length - 1 : 0;
  }

  if (direction === 'prev') {
    return currentMatchIndex === 0 ? matches.length - 1 : currentMatchIndex - 1;
  }

  return currentMatchIndex === matches.length - 1 ? 0 : currentMatchIndex + 1;
}
