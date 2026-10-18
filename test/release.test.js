import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { releaseChangelog } from '../scripts/release.mjs';

test('the Unreleased notes move under the new version', () => {
  const text = '# Changelog\n\nIntro.\n\n## Unreleased\n\n- New thing.\n\n## 0.1.0 - 2026-10-18\n\n- First.\n';
  const { notes, text: released } = releaseChangelog(text, '0.2.0', '2026-11-01');
  assert.equal(notes, '- New thing.');
  assert.equal(released, '# Changelog\n\nIntro.\n\n## Unreleased\n\n## 0.2.0 - 2026-11-01\n\n- New thing.\n\n## 0.1.0 - 2026-10-18\n\n- First.\n');
});

test('the last section runs to the end of the file', () => {
  const { notes, text } = releaseChangelog('# C\n\n## Unreleased\n\n- Only.\n', '1.0.0', '2027-01-01');
  assert.equal(notes, '- Only.');
  assert.equal(text, '# C\n\n## Unreleased\n\n## 1.0.0 - 2027-01-01\n\n- Only.\n\n');
});

test('a release needs notes', () => {
  assert.throws(() => releaseChangelog('# C\n\n## Unreleased\n\n## 0.1.0\n\n- x\n', '0.2.0', 'd'), /is empty/);
  assert.throws(() => releaseChangelog('# C\n', '0.2.0', 'd'), /no "## Unreleased"/);
});

test('the repository CHANGELOG keeps an Unreleased section at the top', () => {
  const text = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.match(text, /^## Unreleased$/m);
  assert.ok(text.indexOf('## Unreleased') < text.search(/^## \d+\.\d+\.\d+/m));
});

test('CRLF changelogs are releasable', () => {
  const { notes } = releaseChangelog('# C\r\n\r\n## Unreleased\r\n\r\n- Windows.\r\n', '0.2.0', 'd');
  assert.equal(notes, '- Windows.');
});
