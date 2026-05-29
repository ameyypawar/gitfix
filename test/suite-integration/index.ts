import * as path from 'path';
import * as fs from 'fs';
import Mocha from 'mocha';

export function run(): Promise<void> {
  // 30 s default; the live MCP test (conflict-tree-mcp) may take longer on
  // first run because gfix needs to analyse the fixture repo.
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 60000 });

  // Collect .test.js files from this directory (suite-integration/) AND from
  // the sibling integration/ directory where the actual test files live.
  // Previously only this directory was scanned, so all tests in integration/
  // were compiled but never executed — that was the no-op bug fixed here.
  const dirs = [
    path.resolve(__dirname, '.'),
    path.resolve(__dirname, '..', 'integration'),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.js'));
    files.forEach((f) => mocha.addFile(path.resolve(dir, f)));
  }

  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} integration test(s) failed.`));
      } else {
        resolve();
      }
    });
  });
}
