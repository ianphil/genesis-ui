---
name: pr
description: End-to-end pull request workflow for the chamber repo. Use this when the user asks to open, prepare, ship, or finalize a PR. It rebases on master, runs smoke tests, optionally invokes Uncle Bob review and a sandbox packaging test, confirms the version bump and changelog, links any closing issue, and creates the PR via `gh`.
---

# PR Skill

Drive the chamber pull-request workflow from a feature branch to a created PR. Steps may be skipped or reordered if the user has already done one of them in this session, but never silently — always confirm.

The user is `ianphil`. The default base branch is `master`. Commits must include the chamber Co-authored-by trailer (already configured via `<git_commit_trailer>`). Use `gh` for all GitHub operations — never the MCP server.

## Prerequisites

Before doing anything, verify:

1. `git status` is clean (no uncommitted changes). If dirty, ask the user whether to commit, stash, or abort.
2. The current branch is **not** `master`. If it is, abort.
3. `gh auth status` succeeds.

## Workflow

Run these phases in order. Phases marked **ASK** must use the `ask_user` tool (not plain prose). Phases marked **AGENT** are autonomous but report results before moving on.

### 1. AGENT — Rebase on master

```powershell
git fetch origin master --quiet
git rebase origin/master
```

If the rebase has conflicts, stop and surface them. Do not attempt automatic resolution unless the user explicitly approves.

### 2. ASK — Version bump recommendation

Inspect the diff against `origin/master` (`git --no-pager diff origin/master --stat` plus a quick read of the changed files). Recommend **patch** vs **minor** vs **none** based on:

- **patch** — bug fixes, internal refactors, doc-only or test-only changes
- **minor** — new user-visible feature, new mind capability, new Lens view type, new cron job kind, new tool, schema additions
- **major** — breaking changes (call out explicitly; chamber is pre-1.0 so prefer minor with a clear changelog warning)

Use `ask_user` to confirm the bump. Do not edit `package.json` until the user accepts. When they do, bump `package.json` and run `npm install --package-lock-only` so the lockfile updates, then stage both.

### 3. AGENT — Changelog check

Read `CHANGELOG.md`. Confirm the top section matches the new version and describes the change. If missing or stale, draft an entry following the existing format (version + date heading, grouped sub-headings, bold lead-in per bullet) and ask the user to confirm before writing it.

### 4. AGENT — Closing issue check

Inspect commit messages on the branch (`git --no-pager log origin/master..HEAD --oneline`) and the diff for issue references (`#NNN`, `Fixes #`, `Closes #`). Cross-check with `gh issue list --state open --limit 30` for likely matches. If a closing relationship is plausible, surface it and ask the user to confirm so the PR body can include `Closes #NNN`.

### 5. ASK — Run Uncle Bob review?

Ask the user whether to run the **Uncle Bob** agent (`.github/agents/uncle-bob.agent.md`) for a craftsmanship review of the diff. If yes, delegate via the `task` tool with `agent_type: "Uncle Bob"` and pass:

- the diff range (`origin/master..HEAD`)
- the list of changed files
- a request for a focused critique (not style nits)

Surface the agent's findings. Ask the user which to address before opening the PR.

### 6. AGENT — Smoke tests

Run, in order, surfacing any failure immediately:

```powershell
npm run lint
npm test
```

If a SDK-touching path was modified, also run:

```powershell
npm run test:sdk-smoke
```

(`scripts/run-sdk-smoke-test.js` exists for this.) Do not run the full `npm run make` — that is the next, optional step.

### 7. ASK — Run `make:sandbox` to test packaging?

If the diff touches packaging, runtime wiring, the copilot runtime, electron-forge config, or first-launch behavior, recommend **yes**. Otherwise default to **no** but still ask. If yes, run `npm run make:sandbox`. Surface any failures and stop.

### 8. AGENT — Push and open the PR

```powershell
git push -u origin HEAD
```

Then open the PR with `gh`. Construct the title from the lead commit (`feat:`, `fix:`, `refactor:`, etc., per the existing changelog tone). The body must include:

- A short summary (1–3 sentences)
- A bulleted list of notable changes
- The `Closes #NNN` line if step 4 surfaced one
- The test evidence: which of `npm run lint`, `npm test`, `npm run test:sdk-smoke`, `npm run make:sandbox` passed

```powershell
gh pr create --base master --head <branch> --title "<title>" --body "<body>"
```

Print the resulting PR URL.

## Failure modes

- **Rebase conflicts** — stop, surface conflicts, ask for direction.
- **Lint or test failure** — stop, show the failure, do **not** push.
- **Sandbox failure** — stop, show the failure, do **not** push. A green sandbox is required if it was requested.
- **No changelog entry for a non-trivial change** — block until one exists.
- **Dirty working tree at the end** — never push with uncommitted changes; commit or stash first and confirm with the user.

## Notes

- Chamber's CI lives in `.github/workflows/ci.yml` and `governance-check.yml`. Local smoke tests are not a substitute, but they catch most regressions before push.
- The Co-authored-by Copilot trailer is mandatory and already configured globally for this CLI session — do not strip it.
- Never modify `.working-memory/` files in a PR. They are agent-managed.
