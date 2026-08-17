# Security Policy

[日本語](SECURITY.ja.md)

Ontology Viewer opens and transforms local ontology documents. We treat unexpected source modification, unsafe webview behavior, and unintended disclosure of document contents as security-relevant.

## Supported versions

Security fixes are provided for the latest Marketplace release. Please reproduce a report on the latest version before submitting it when possible.

## Report a vulnerability privately

Do not open a public issue for a suspected vulnerability. Use [GitHub Private Vulnerability Reporting](https://github.com/yaggytter/vscode-ontology-viewer/security/advisories/new). Include:

- affected version and VS Code version;
- operating system and workspace trust state;
- a minimal ontology or reproduction steps, with sensitive data removed;
- expected and actual behavior;
- impact and any known workaround.

If private reporting is unavailable, open a minimal public issue asking for a private contact channel without including exploit details or confidential ontology data.

We aim to acknowledge complete reports within five business days. Timelines for validation and fixes depend on severity and complexity. Please allow time for a patched release before public disclosure.

## Security model

- Ontology parsing and rendering run locally in the VS Code extension host and a content-security-policy-restricted webview.
- Diagram edits are generated as candidates and re-parsed before they replace document text.
- The extension has no telemetry endpoint, account system, or extension-owned cloud service.
- RDF/XML and JSON-LD are view-only until converted into a new Turtle document.

These safeguards reduce risk but do not replace source control and review. Treat ontologies from unknown sources as untrusted data and keep backups of important work.
