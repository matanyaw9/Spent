// Category color palette. Distinct hues, none colliding with the 16 seeded
// category colors; chroma matched to the L2 buttercream lift. Used both for
// deterministic auto-coloring of new categories (server) and as the swatch
// grid in the category color picker (client).
export const CATEGORY_COLOR_PALETTE = [
  "#A4C386", // light olive
  "#E7A875", // sandy orange
  "#65C1D1", // light cyan-blue
  "#D692BF", // bright pink
  "#9186D1", // medium violet
  "#73C4A8", // jade
  "#7D90CA", // dusty indigo
  "#A2ABBB", // medium slate
  "#BF9ED9", // mauve
  "#92D5B7", // mint
  "#D6C480", // sand gold
  "#BFB89B", // sage tan
] as const;
