// Scheduled task: regenerate the model price table and, if it moved, open a
// pull request so the change arrives as a reviewable diff rather than landing
// on main unseen.
//
// The behaviour lives here instead of inside the workflow YAML because a shell
// script embedded in YAML cannot be read, run or fixed on its own. GitHub only
// triggers this file; `node scripts/scheduled/refresh-prices.mjs` does exactly
// the same thing from a terminal.

import { execFileSync } from 'node:child_process';

const BRANCH = 'chore/refresh-model-prices';
const PRICE_FILE = 'src/prices.json';
const COMMIT_MESSAGE = 'Refresh model price table';
const PR_BODY = 'Automated refresh of `src/prices.json`. Both upstream feeds agreed on every value. Review the diff before merging.';

// The bot identity GitHub attributes Actions commits to.
const BOT_NAME = 'github-actions[bot]';
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';

const git = (...args) => execFileSync('git', args, { stdio: 'inherit' });
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();

/** `git diff --quiet` exits non-zero when the file differs, which is the signal. */
function priceTableChanged() {
  try {
    execFileSync('git', ['diff', '--quiet', '--', PRICE_FILE]);
    return false;
  } catch {
    return true;
  }
}

function pullRequestIsOpen() {
  try {
    return gh('pr', 'view', BRANCH, '--json', 'state', '--jq', '.state') === 'OPEN';
  } catch {
    return false;
  }
}

execFileSync(process.execPath, ['scripts/update-prices.mjs'], { stdio: 'inherit' });

if (!priceTableChanged()) {
  console.log('Prices unchanged. Nothing to do.');
  process.exit(0);
}

git('config', 'user.name', BOT_NAME);
git('config', 'user.email', BOT_EMAIL);

// A checkout fetches only the default branch, so git holds no remote-tracking
// ref for the rolling price branch. `--force-with-lease` then refuses the push
// with "stale info" rather than comparing against anything real.
try {
  git('fetch', 'origin', `+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`);
} catch {
  // First run, or the branch was merged and deleted. Nothing to compare against yet.
}

git('checkout', '-B', BRANCH);
git('add', PRICE_FILE);
git('commit', '-m', COMMIT_MESSAGE);
git('push', '--force-with-lease', 'origin', BRANCH);

if (pullRequestIsOpen()) {
  console.log(`Pushed the update to the open pull request on ${BRANCH}.`);
} else {
  gh('pr', 'create', '--base', 'main', '--head', BRANCH, '--title', COMMIT_MESSAGE, '--body', PR_BODY);
  console.log('Opened a pull request.');
}
