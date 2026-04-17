# Contributing to Chamber

## Development Setup

```bash
git clone https://github.com/ianphil/chamber
cd chamber
npm install
npm start        # launch with hot reload
```

## Workflow

1. **File a GitHub Issue** — every change starts with an issue. Label it `now`, `next`, or `later` to indicate priority.
2. **Branch from `master`** — use a descriptive branch name referencing the issue: `fix/stale-model-picker-97`, `feat/auth-flow-42`.
3. **Make your changes** — keep commits focused. One logical change per commit.
4. **Open a PR** — reference the issue with `Fixes #N` or `Closes #N` in the PR body so it auto-closes on merge.

## Code Quality

### Lint

ESLint runs on every commit via a pre-commit hook.

```bash
npm run lint
```

Zero errors, zero warnings. Fix lint issues before pushing.

### Tests

```bash
npm test              # run all tests once
npm run test:watch    # re-run on file changes
npm run test:coverage # generate coverage report
npm run test:ui       # interactive test UI
```

All tests must pass before merging. If you change behavior, update or add tests to cover it.

### Type Checking

TypeScript strict mode. Run the compiler to catch type issues:

```bash
npx tsc --noEmit
```

## Versioning

Chamber follows [Semantic Versioning](https://semver.org/):

| Change | Bump | Example |
|--------|------|---------|
| Breaking API/behavior change | **Major** (`X.0.0`) | Remove a feature, change IPC contract |
| New feature, non-breaking enhancement | **Minor** (`0.X.0`) | Add a view type, new service |
| Bug fix, patch, internal cleanup | **Patch** (`0.0.X`) | Fix a cache bug, update a dependency |

Bump the version with:

```bash
npm version major|minor|patch --no-git-tag-version
```

Include the version bump in your PR commit — don't merge without bumping.

## Changelog

Every released version gets an entry in `CHANGELOG.md`. Follow the existing format:

```markdown
## vX.Y.Z (YYYY-MM-DD)

### Section Name

- **Short summary** — longer explanation of what changed and why. (#issue)
```

Guidelines:

- **Bold the lead phrase** — scan-friendly one-liner, then the detail after the dash.
- **Reference the issue** — append `(#N)` so readers can find the discussion.
- **Group by area** — use subsections like `### Chat`, `### SDK`, `### Fixes`.
- **Move unreleased items** — if there's an `## Unreleased` section, fold those entries into the new version header when you bump.

## Issues & Labels

All work is tracked via [GitHub Issues](https://github.com/ianphil/chamber/issues). Priority labels:

| Label | Meaning |
|-------|---------|
| `now` | Current sprint — actively being worked |
| `next` | Queued — will be picked up soon |
| `later` | Backlog — important but not urgent |

## Releases

1. Ensure all tests pass and lint is clean.
2. Bump the version in `package.json`.
3. Update `CHANGELOG.md` with the new version entry.
4. Merge the PR to `master`.
5. Tag the release: `git tag vX.Y.Z && git push --tags`.
6. Build the distributable: `npm run make`.

## Stack

- **Electron 41** + Forge + Vite
- **React 19**, TypeScript, Tailwind CSS v4
- **shadcn/ui** (Radix + CVA)
- **@github/copilot-sdk**
- **Vitest** for testing
