# Ontology Viewerへのコントリビューション

[English](CONTRIBUTING.md)

VS Codeでのオントロジー作業を、より親しみやすくするための協力を歓迎します。対象は、不具合修正、アクセシビリティ改善、ドキュメント、翻訳、具体的な機能提案です。小さな改善でも構いません。

## 作業を始める前に

- 重複を避けるため、[既存のIssue](https://github.com/yaggytter/vscode-ontology-viewer/issues)を検索してください。
- 大きな挙動変更や対応形式の追加は、実装に入る前にIssueで方針を相談してください。
- セキュリティ上の問題は公開Issueにせず、[SECURITY.ja.md](SECURITY.ja.md)に沿って報告してください。

## 開発環境

必要なものは、Git、Node.js 22以降、npm、VS Code 1.96以降です。

```bash
git clone https://github.com/yaggytter/vscode-ontology-viewer.git
cd vscode-ontology-viewer
npm ci
npm run verify
```

リポジトリをVS Codeで開き、`F5`を押すとExtension Development Hostが起動します。起動後、そのウィンドウでサンプルの`.ttl`ファイルを開きます。最後に、**Ontology Viewer: 図でプレビューを開く**を実行してください。

## 変更の進め方

1. `main`から目的を絞ったブランチを作成します。
2. 挙動を変える場合は、可能な限り先にテストを追加または更新します。
3. パース、グラフ変換、ソース変更の責務を分けます。図からの書き込みでは、変更候補の生成、パース、意図した変更の検証、ソースへの反映という順序を守ってください。
4. ライト・ダーク・ハイコントラストテーマ、キーボード操作、幅の狭いエディタグループでも使えるUIにします。
5. 利用者に見える文言は英語と日本語を更新します。マニフェストの文言は`package.nls.json`と`package.nls.ja.json`、実行時の文言は`l10n/`内の2ファイルで管理します。
6. 下記の検証を実行し、最後に差分を確認します。

コミットメッセージには[Conventional Commits](https://www.conventionalcommits.org/)を使います。例: `fix(preview): keep inspector visible on narrow panes`

## 検証

```bash
npm run verify
npm run test:integration
npm run package
```

`npm run package`で`.vsix`が作成されます。**Extensions: Install from VSIX...**から新しいVS Codeプロファイルへインストールし、UIやMarketplace表示に関わる変更は英語・日本語の両方で確認してください。

Marketplaceへの公開はメンテナーのみが行います。リリース権限がある場合は、内部の公開手順を参照してください。

## Pull Request

レビューできる大きさに変更を絞ってください。利用者が困っていたこと、採用した挙動、実行したテストを説明し、見た目を変えた場合はスクリーンショットを添えます。関連Issue、互換性、移行時の注意も明記してください。

別途記載がない限り、コントリビューションは本リポジトリの[MIT License](LICENSE)で受け入れます。
