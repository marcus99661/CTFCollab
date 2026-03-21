import { createAutoSync } from "./createAutoSync";

export const startChallengesAutoSync = createAutoSync({
    checkpointKey: "challengesCheckpoint",
    pushPath: "/api/replication/challenges/push",
    pullPath: "/api/replication/challenges/pull",
    collectionName: "challenges",
});
