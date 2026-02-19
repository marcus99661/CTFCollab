import { createAutoSync } from "./createAutoSync";

export const startEventsAutoSync = createAutoSync({
    checkpointKey: "eventsCheckpoint_v1",
    pushPath: "/replication/events/push",
    pullPath: "/replication/events/pull",
    collectionName: "events",
});
