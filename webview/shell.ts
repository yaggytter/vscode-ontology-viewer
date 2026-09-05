/**
 * The panel's static DOM skeleton.
 *
 * Extracted from main.ts so the app shell reads as markup rather than as a
 * 70-line string literal wedged between logic. This is the one place a
 * template literal is allowed to build markup: it contains no interpolation,
 * so no untrusted ontology content can reach it. Everything that renders
 * document data goes through webview/dom.ts's `h()` and `textContent` —
 * enforced for the rest of `webview/**` by eslint's no-restricted-properties
 * rule against innerHTML.
 *
 * Element ids here are the contract main.ts looks up; keep the two in sync.
 */
export const APP_TEMPLATE = `
  <div id="banner" class="banner" hidden></div>
  <div id="toolbar" class="toolbar">
    <div class="toolbar-leading">
      <div id="view-toggle" class="view-toggle" role="group">
        <button id="view-schema" type="button" class="view-toggle-btn"></button>
        <button id="view-triples" type="button" class="view-toggle-btn"></button>
      </div>
      <div id="search-container" class="search-container"></div>
    </div>
    <div class="toolbar-actions">
      <div class="layout-control">
        <label id="layout-label" for="layout-select"></label>
        <select id="layout-select">
          <option value="fcose">fCoSE</option>
          <option value="dagre">Dagre</option>
        </select>
      </div>
      <button id="add-class-btn" type="button" class="toolbar-btn toolbar-btn-primary" hidden></button>
      <button id="connect-btn" type="button" class="toolbar-btn" hidden></button>
      <button id="compact-triples-btn" type="button" class="toolbar-btn" aria-pressed="true" hidden></button>
      <button id="sparql-toggle-btn" type="button" class="toolbar-btn" aria-pressed="false"></button>
      <button id="inspector-toggle-btn" type="button" class="icon-btn inspector-toggle-btn" hidden>
        <span aria-hidden="true">◫</span>
      </button>
      <button id="export-png-btn" type="button" class="icon-btn">
        <span aria-hidden="true">⇩</span>
        <span id="export-png-label"></span>
      </button>
    </div>
  </div>
  <div id="body" class="body-row">
    <div id="stage">
      <div id="cy"></div>
      <div id="empty" class="empty" hidden></div>
      <div id="canvas-summary" class="canvas-summary" hidden>
        <strong id="canvas-title" class="canvas-title"></strong>
        <span id="canvas-meta" class="canvas-meta"></span>
      </div>
      <div id="connect-hint" class="connect-hint" hidden></div>
      <div id="sparql-panel-mount" class="sparql-panel-mount"></div>
      <div id="graph-controls" class="graph-controls" role="group">
        <button id="zoom-out-btn" type="button" class="graph-control-btn">−</button>
        <button id="zoom-level-btn" type="button" class="graph-control-btn graph-zoom-readout" aria-live="polite">100%</button>
        <button id="zoom-in-btn" type="button" class="graph-control-btn">+</button>
        <span class="graph-control-separator" aria-hidden="true"></span>
        <button id="fit-btn" type="button" class="graph-control-btn">⛶</button>
        <button id="run-layout-btn" type="button" class="graph-control-btn">↻</button>
      </div>
    </div>
    <div id="inspector-scrim" class="inspector-scrim" hidden></div>
    <aside id="inspector" class="inspector">
      <div class="inspector-toolbar">
        <div>
          <div class="inspector-eyebrow">Ontology</div>
          <h2 id="inspector-heading"></h2>
        </div>
        <button id="inspector-close-btn" type="button" class="icon-btn inspector-close-btn">×</button>
      </div>
      <section class="overview-card">
        <h3 id="overview-heading"></h3>
        <div id="inspector-stats"></div>
      </section>
      <div id="inspector-selection"></div>
      <div id="inspector-unattached"></div>
      <div id="inspector-legend"></div>
    </aside>
  </div>
  <div id="toast" class="toast" hidden></div>
`;
