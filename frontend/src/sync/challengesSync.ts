import { createAutoSync } from "./createAutoSync";

export const startChallengesAutoSync = createAutoSync({
    checkpointKey: "challengesCheckpoint_v1",
    pushPath: "/replication/challenges/push",
    pullPath: "/replication/challenges/pull",
    collectionName: "challenges",
});
