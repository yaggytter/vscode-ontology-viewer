# Contributing to Ontology Viewer

[日本語](CONTRIBUTING.ja.md)

Thank you for helping make ontology work more approachable in VS Code. Bug fixes, accessibility improvements, documentation, localization, and focused feature proposals are welcome.

## Before you start

- Search [existing issues](https://github.com/yaggytter/vscode-ontology-viewer/issues) before opening a duplicate.
- Use an issue to discuss a substantial behavior or format-support change before investing in implementation.
- For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Development setup

Requirements: Git, Node.js 22 or later, npm, and VS Code 1.96 or later.

```bash
git clone https://github.com/yaggytter/vscode-ontology-viewer.git
cd vscode-ontology-viewer
npm ci
npm run verify
```

Open the repository in VS Code and press `F5` to launch an Extension Development Host. Open a sample `.ttl` file there and run **Ontology Viewer: Open Diagram Preview**.

## Make a change

1. Create a focused branch from `main`.
2. Add or update tests before changing behavior when practical.
3. Keep parsing, graph transformation, and source mutation separate. Diagram writes must remain transactional: generate a candidate, parse it, verify the intended change, then apply it.
4. Keep the UI usable with light/dark/high-contrast themes, keyboard navigation, and narrow editor groups.
5. Update both English and Japanese user-facing text. Manifest strings belong in `package.nls.json` and `package.nls.ja.json`; runtime strings belong in the two files under `l10n/`.
6. Run the verification commands below and review the final diff.

Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages, for example `fix(preview): keep inspector visible on narrow panes`.

## Verification

```bash
npm run verify
npm run test:integration
npm run package
```

`npm run package` creates a `.vsix`. Install it into a clean VS Code profile with **Extensions: Install from VSIX...** and check both English and Japanese display languages for changes that affect the UI or Marketplace text.

Marketplace publication is handled by maintainers only; see the internal publishing runbook if you have release access.

## Pull requests

Keep pull requests small enough to review. Explain the user problem, the chosen behavior, tests performed, and screenshots for visual changes. Link the relevant issue and call out compatibility or migration concerns.

Unless stated otherwise, contributions are accepted under the repository's [MIT License](LICENSE).
