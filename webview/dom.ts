/**
 * Every element in this file is built via DOM APIs and `textContent`, never
 * `innerHTML` — enforced mechanically by eslint.config.mjs's
 * no-restricted-properties rule for `webview/**`. `.ttl`/`.rdf` documents are
 * untrusted input; a label, comment, IRI, unit, or enum value that reached
 * `innerHTML` would turn "open a malicious ontology file" into "run script
 * in a webview that can postMessage the host into editing files."
 */

export interface ElementOptions {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
  children?: (Node | string)[];
  onClick?: (e: MouseEvent) => void;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, options: ElementOptions = {}): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (options.className) {
    el.className = options.className;
  }
  if (options.text !== undefined) {
    el.textContent = options.text;
  }
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      el.setAttribute(key, value);
    }
  }
  if (options.children) {
    for (const child of options.children) {
      el.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
  }
  if (options.onClick) {
    el.addEventListener("click", options.onClick as EventListener);
  }
  return el;
}

export function clear(el: Element): void {
  el.replaceChildren();
}
