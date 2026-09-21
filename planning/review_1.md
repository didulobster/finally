# Review 1

Compared the working tree with `HEAD` (`5b828e9 remove everything to start over`).

## Findings

### [P1] Ensure the plugin is installed/enabled for this repository

The change removes the active `Stop` hook from `.claude/settings.json`, while the new `.claude-plugin/marketplace.json` only declares `independent-reviewer` as an available marketplace plugin. There is no corresponding enabled-plugin entry or installation configuration in this repository. On a fresh checkout, the new hook therefore will not run unless a user manually installs and enables the plugin, so the review automation is effectively disabled by this change.

Affected files: `.claude/settings.json:2-6`, `.claude-plugin/marketplace.json:7-16`.

### [P2] Avoid running an expensive external agent on every Stop event without a guard

`independent-reviewer/hooks/hooks.json:3-9` invokes `codex exec` for every Claude `Stop` event. The hook has no change-detection, recursion protection, or opt-in condition, so every stop can launch another agent even when there are no changes to review. This adds avoidable latency/token usage and can repeatedly rewrite `planning/review_1.md`; it is also risky in automated or nested agent sessions. Add a guard (for example, check for a non-empty diff and an explicit opt-in) and ensure the invoked command cannot trigger the same workflow recursively.

## Verification

- `git diff --check`: passed.
- All changed JSON files parse structurally from inspection; no application source or test suite exists in this checkout to exercise the plugin behavior.
- The three new files under `.claude-plugin/` and `independent-reviewer/` are currently untracked and must be included in the eventual commit for the feature to exist.

