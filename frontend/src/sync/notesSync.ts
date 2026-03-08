import { createAutoSync } from "./createAutoSync";

export const startNotesAutoSync = createAutoSync({
    checkpointKey: "notesCheckpoint_v1",
    pushPath: "/api/replication/push",
    pullPath: "/api/replication/pull",
    collectionName: "notes",
});
