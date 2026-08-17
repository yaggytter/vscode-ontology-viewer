import { h } from "../dom";

export interface PromptFormOptions {
  label: string;
  okLabel: string;
  cancelLabel: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
}

/**
 * A small modal text-input overlay, used for the two write-back flows that
 * need one free-text value up front (new class name, new relation name).
 * Not `window.prompt()` — VS Code webviews run in a sandboxed iframe that
 * does not reliably support native dialogs, and this keeps the ask (and its
 * cancel affordance) visually consistent with the rest of the panel.
 */
export function showPromptForm(options: PromptFormOptions): void {
  const overlay = h("div", { className: "prompt-overlay" });
  const box = h("div", { className: "prompt-box" });
  box.appendChild(h("label", { className: "prompt-label", text: options.label }));
  const input = h("input", {
    className: "prompt-input",
    attrs: { type: "text", placeholder: options.placeholder ?? "" },
  });
  box.appendChild(input);

  const buttons = h("div", { className: "prompt-buttons" });
  const close = () => overlay.remove();
  const submit = () => {
    const value = input.value.trim();
    close();
    if (value) {
      options.onSubmit(value);
    } else {
      options.onCancel?.();
    }
  };
  const cancel = () => {
    close();
    options.onCancel?.();
  };

  buttons.appendChild(h("button", { className: "prompt-ok", text: options.okLabel, onClick: submit }));
  buttons.appendChild(h("button", { className: "prompt-cancel", text: options.cancelLabel, onClick: cancel }));
  box.appendChild(buttons);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      submit();
    } else if (e.key === "Escape") {
      cancel();
    }
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      cancel();
    }
  });

  input.focus();
}
