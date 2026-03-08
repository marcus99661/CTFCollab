import { createAutoSync } from "./createAutoSync";

export const startEventsAutoSync = createAutoSync({
    checkpointKey: "eventsCheckpoint_v1",
    pushPath: "/api/replication/events/push",
    pullPath: "/api/replication/events/pull",
    collectionName: "events",
});
