import { createAutoSync } from "./createAutoSync";

export const startChallengesAutoSync = createAutoSync({
    checkpointKey: "challengesCheckpoint_v1",
    pushPath: "/api/replication/challenges/push",
    pullPath: "/api/replication/challenges/pull",
    collectionName: "challenges",
});
