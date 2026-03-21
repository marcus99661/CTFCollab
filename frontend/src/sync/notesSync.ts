import { createAutoSync } from "./createAutoSync";

export const startNotesAutoSync = createAutoSync({
    checkpointKey: "notesCheckpoint",
    pushPath: "/api/replication/push",
    pullPath: "/api/replication/pull",
    collectionName: "notes",
});
