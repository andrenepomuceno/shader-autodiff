// Local release, no CI: node scripts/release.mjs <version> [--dry-run]
//
// Checks a clean, up-to-date main, runs the tests, moves the CHANGELOG "Unreleased" notes under the
// new version, bumps package.json, commits, tags, publishes to npm, pushes and creates the GitHub
// release. --dry-run runs every check plus `npm publish --dry-run` and changes nothing.
import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [version, ...flags] = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
const root = new URL('../', import.meta.url);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, { capture = false } = {}) {
  console.log(`$ ${command} ${args.join(' ')}`);
  const output = execFileSync(command, args, { cwd: root, stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8', shell: process.platform === 'win32' && command === npm });
  return capture ? output.trim() : '';
}

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

function compareVersions(a, b) {
  const parts = (text) => text.split('.').map(Number);
  const [x, y] = [parts(a), parts(b)];
  for (let index = 0; index < 3; index += 1) if (x[index] !== y[index]) return x[index] - y[index];
  return 0;
}

/** Splits the CHANGELOG into the Unreleased notes and the text with those notes released. */
export function releaseChangelog(source, version, date) {
  const text = source.replace(/\r\n/g, '\n');
  const match = /^## Unreleased\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  if (!match) throw new Error('CHANGELOG.md has no "## Unreleased" section');
  const notes = match[1].trim();
  if (!notes) throw new Error('the "## Unreleased" section of CHANGELOG.md is empty');
  const released = `## Unreleased\n\n## ${version} - ${date}\n\n${notes}\n\n`;
  return { notes, text: text.slice(0, match.index) + released + text.slice(match.index + match[0].length) };
}

function main() {
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) fail('usage: node scripts/release.mjs <major.minor.patch> [--dry-run]');
  const packagePath = new URL('package.json', root);
  const changelogPath = new URL('CHANGELOG.md', root);
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  if (compareVersions(version, pkg.version) <= 0) fail(`version ${version} is not above ${pkg.version}`);

  if (run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { capture: true }) !== 'main') fail('not on main');
  if (run('git', ['status', '--porcelain'], { capture: true })) fail('working tree is not clean');
  run('git', ['fetch', 'origin', 'main']);
  if (run('git', ['rev-parse', 'HEAD'], { capture: true }) !== run('git', ['rev-parse', 'origin/main'], { capture: true })) {
    fail('main is not in sync with origin/main');
  }
  if (run('git', ['tag', '--list', `v${version}`], { capture: true })) fail(`tag v${version} already exists`);

  const date = new Date().toISOString().slice(0, 10);
  const changelog = releaseChangelog(readFileSync(changelogPath, 'utf8'), version, date);
  run(process.execPath, ['--test']);

  run(npm, ['publish', '--dry-run', '--access', 'public']);
  if (dryRun) {
    console.log(`\nDry run OK. Release notes for v${version}:\n\n${changelog.notes}\n`);
    return;
  }

  writeFileSync(changelogPath, changelog.text);
  writeFileSync(packagePath, readFileSync(packagePath, 'utf8').replace(/"version": "[^"]*"/, `"version": "${version}"`));
  run('git', ['commit', '-am', `Release v${version}`]);
  run('git', ['tag', '-a', `v${version}`, '-m', `v${version}`]);

  // Push before publishing, so a published version always has its tag on GitHub; each step that can
  // fail says how to resume instead of leaving the repository half released.
  const githubRelease = `gh release create v${version} --title v${version} --notes-file <notes>`;
  step(() => run('git', ['push', 'origin', 'main', '--follow-tags']),
    `push failed; the release commit and tag v${version} are local. Fix it, then run: git push origin main --follow-tags && npm publish --access public && ${githubRelease}`);
  step(() => run(npm, ['publish', '--access', 'public']),
    `npm publish failed; v${version} is tagged and pushed. Fix it, then run: npm publish --access public && ${githubRelease}`);
  const notesPath = fileURLToPath(new URL(`.release-notes-${version}.md`, root));
  writeFileSync(notesPath, `${changelog.notes}\n`);
  try {
    step(() => run('gh', ['release', 'create', `v${version}`, '--title', `v${version}`, '--notes-file', notesPath]),
      `GitHub release failed; v${version} is published. Create it by hand: ${githubRelease}`);
  } finally {
    unlinkSync(notesPath);
  }
}

function step(action, recovery) {
  try {
    action();
  } catch {
    fail(recovery);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
