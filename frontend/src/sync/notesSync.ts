import { createAutoSync } from "./createAutoSync";

export const startNotesAutoSync = createAutoSync({
    checkpointKey: "notesCheckpoint_v1",
    pushPath: "/replication/push",
    pullPath: "/replication/pull",
    collectionName: "notes",
});
