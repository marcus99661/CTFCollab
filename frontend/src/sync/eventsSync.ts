import { createAutoSync } from "./createAutoSync";

export const startEventsAutoSync = createAutoSync({
    checkpointKey: "eventsCheckpoint",
    pushPath: "/api/replication/events/push",
    pullPath: "/api/replication/events/pull",
    collectionName: "events",
    cleanupField: "id",
});
