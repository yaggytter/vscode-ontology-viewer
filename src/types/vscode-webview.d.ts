/** Injected by VS Code into every webview's global scope; not an npm package. */
interface VsCodeWebviewApi<StateT = unknown> {
  postMessage(message: unknown): void;
  getState(): StateT | undefined;
  setState(state: StateT): void;
}

declare function acquireVsCodeApi<StateT = unknown>(): VsCodeWebviewApi<StateT>;
