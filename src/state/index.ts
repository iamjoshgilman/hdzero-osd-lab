// Public surface of the state module — project doc type, reactive store,
// undo stack, IndexedDB-backed asset cache, JSON persistence.
export * from "./project";
export {
  project,
  mutate,
  replaceProject,
  undo,
  redo,
  canUndo,
  canRedo,
  resetStore,
} from "./store";
export { UndoStack } from "./undo";
export {
  hashBytes,
  putAsset,
  getAsset,
  deleteAsset,
  listAssets,
  evictUnused,
} from "./assets";
export { projectToJson, projectFromJson } from "./persistence";
