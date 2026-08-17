# Privacy Notice

[日本語](PRIVACY.ja.md)

Effective date: August 9, 2026

Ontology Viewer is designed to work locally. The extension does not collect or transmit telemetry, ontology contents, file paths, search queries, diagram edits, or account identifiers to a service operated by this project.

## Data processed locally

To provide its features, the extension reads the ontology document open in VS Code and builds an in-memory graph. The graph is sent only to the extension's own VS Code webview for rendering. Diagram edits are processed locally and, after validation, are written to the document you opened.

Dragged node positions and view preferences may be stored in VS Code workspace state. They remain under VS Code's storage controls and can be removed by uninstalling the extension and clearing its stored data or by using a fresh VS Code profile.

## Network access

The extension runtime does not make extension-owned network requests. Installing or updating it through the VS Code Marketplace, opening links in documentation, synchronizing VS Code settings, or using a remotely hosted workspace may involve Microsoft, GitHub, your remote-workspace provider, or your organization under their own privacy terms. Those actions are outside this project's data collection.

## Logs and reports

Diagnostic messages may appear locally in VS Code's Output or developer tools. They are not uploaded automatically. If you submit an issue, you choose what to share with GitHub and this project's maintainers. Remove confidential ontology content, paths, and personal information before posting.

## Changes and questions

Material changes to this notice will be recorded in the repository. For a privacy question, open a GitHub issue without including private data. Report suspected unintended disclosure through the private process in [SECURITY.md](SECURITY.md).

As of the pre-publication review, the extension does not contain extension-owned HTTP request code, an external analytics SDK, user identifier storage, ontology uploads to a backend, or forwarding of edit activity to an external log.
