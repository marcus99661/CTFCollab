import { createAutoSync } from "./createAutoSync";

export const startNotesAutoSync = createAutoSync({
    checkpointKey: "notesCheckpoint",
    pushPath: "/api/replication/notes/push",
    pullPath: "/api/replication/notes/pull",
    collectionName: "notes",
    cleanupField: "id",
});
