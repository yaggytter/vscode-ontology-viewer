/** cytoscape-fcose ships no .d.ts; minimal ambient declaration for the surface we use. */
declare module "cytoscape-fcose" {
  import type cytoscape from "cytoscape";
  const fcose: cytoscape.Ext;
  export = fcose;
}
