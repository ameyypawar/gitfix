import * as assert from 'assert';

// Unit tests for the CodeLens conflict marker regex.
// We extract and test the regex independently of the vscode host so these run
// fast in the Mocha test suite without needing a real document.

/** Mirrors the regex used in ConflictCodeLensProvider.provideCodeLenses. */
const CONFLICT_START_RE = /^(<{6,8})( .*)?$/gm;

function findMarkerLines(text: string): number[] {
  const results: number[] = [];
  let match: RegExpExecArray | null;
  CONFLICT_START_RE.lastIndex = 0;
  while ((match = CONFLICT_START_RE.exec(text)) !== null) {
    // Compute line index from match.index
    const before = text.slice(0, match.index);
    const lineIndex = before.split('\n').length - 1;
    results.push(lineIndex);
  }
  return results;
}

suite('codelens — conflict marker regex', () => {
  test('detects a standard 7-char marker', () => {
    const text = [
      'some code',
      '<<<<<<< HEAD',
      'ours',
      '=======',
      'theirs',
      '>>>>>>> feature',
      'more code',
    ].join('\n');
    const lines = findMarkerLines(text);
    assert.deepStrictEqual(lines, [1]);
  });

  test('detects a 6-char marker (short form)', () => {
    const text = [
      '<<<<<<< HEAD',
      'ours',
      '======',
      'theirs',
      '>>>>>>> feature',
    ].join('\n');
    const lines = findMarkerLines(text);
    assert.deepStrictEqual(lines, [0]);
  });

  test('detects an 8-char marker', () => {
    const text = [
      '<<<<<<<< HEAD',
      'ours',
      '========',
      'theirs',
      '>>>>>>>> feature',
    ].join('\n');
    const lines = findMarkerLines(text);
    assert.deepStrictEqual(lines, [0]);
  });

  test('detects nested conflict markers', () => {
    const text = [
      '<<<<<<< HEAD',
      'outer ours',
      '<<<<<<< nested',
      'inner ours',
      '=======',
      'inner theirs',
      '>>>>>>> nested',
      '=======',
      'outer theirs',
      '>>>>>>> feature',
    ].join('\n');
    const lines = findMarkerLines(text);
    // Both outer and inner start markers should be detected
    assert.deepStrictEqual(lines, [0, 2]);
  });

  test('does not match inline occurrences (not at line start)', () => {
    const text = [
      'This is not a conflict: <<<<<<< fake',
      'normal line',
    ].join('\n');
    const lines = findMarkerLines(text);
    assert.deepStrictEqual(lines, []);
  });

  test('matches marker with label text (HEAD, branch name)', () => {
    const text = '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature-branch\n';
    const lines = findMarkerLines(text);
    assert.deepStrictEqual(lines, [0]);
  });

  test('matches marker without label text', () => {
    const text = '<<<<<<<\nours\n=======\ntheirs\n>>>>>>>\n';
    const lines = findMarkerLines(text);
    assert.deepStrictEqual(lines, [0]);
  });

  test('handles multiple separate conflict blocks', () => {
    const text = [
      'file content',
      '<<<<<<< HEAD',
      'ours A',
      '=======',
      'theirs A',
      '>>>>>>> feature',
      'middle content',
      '<<<<<<< HEAD',
      'ours B',
      '=======',
      'theirs B',
      '>>>>>>> feature',
      'end content',
    ].join('\n');
    const lines = findMarkerLines(text);
    assert.deepStrictEqual(lines, [1, 7]);
  });

  test('does not match 5-char sequences', () => {
    const text = '<<<<< not-a-marker\nnormal line\n';
    const lines = findMarkerLines(text);
    assert.deepStrictEqual(lines, []);
  });
});
