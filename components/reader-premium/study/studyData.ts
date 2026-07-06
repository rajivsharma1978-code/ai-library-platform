// ── Phase 2: AI Notes, Highlights, Bookmarks, Study Workspace ─────────
// Barrel re-export only. The real implementation now lives split across:
//   - types.ts      shared interfaces (StoredHighlight, StoredNote, ...)
//   - constants.ts  highlight color swatches + localStorage keys
//   - storage.ts    localStorage load/save helpers + newId()
// This file exists so nothing importing "studyData" has to change.
export * from "./types";
export * from "./constants";
export * from "./storage";