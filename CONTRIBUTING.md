# Contributing

```bash
npm install
npm test                  # unit tests
npx playwright install chromium
npx playwright test       # browser tests and screenshots
npm run typecheck
```

- **Screenshots.** After an intentional visual change, regenerate with `npx playwright test --update-snapshots` and look at every changed PNG before committing. Small changes can stay under the tolerance: delete the reference to force a rewrite.
- **A new tool adapter.** Record a real session file, scrub prompts, outputs and personal paths, save it under `tests/fixtures/<tool>/`, and write the decoder in `src/adapters/<tool>/` against it. Add it to `src/adapters/index.ts` and document it in `docs/connecting-tools.md`.
- **A new theme.** See [docs/themes.md](docs/themes.md). The theme test checks validity, assets and walkability.
- **Art.** Only art you drew or that is CC0/MIT/CC-BY compatible with redistribution. Credit it in `ASSETS.md`.
- **Privacy.** Never add fields that carry prompt text, file contents or tool output to events.
- **Commits.** Small and focused. The subject is one plain sentence naming the user-visible change, with no type prefix (`Standing from behind with both feet together, not mid-stride`); the body, when any, says what was wrong and what changed. See `git log`.
- **CI.** Every pull request runs the type check, the unit tests and the browser tests ([ci.yml](.github/workflows/ci.yml)); they must pass before a merge.

Ideas waiting for someone: [docs/BACKLOG.md](docs/BACKLOG.md). Planned work: [docs/ROADMAP.md](docs/ROADMAP.md).
