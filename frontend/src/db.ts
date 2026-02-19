import { createRxDatabase } from "rxdb";
import type { RxDatabase } from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";

export type NoteDoc = {
    id: string;
    title: string;
    content: string;
    updatedAt: number;
    isDeleted: boolean;
};

export type EventDoc = {
    id: string;
    name: string;
    description: string;
    createdAt: number;
    updatedAt: number;
    isDeleted: boolean;
};

export type ChallengeDoc = {
    id: string;
    eventId: string;
    title: string;
    category: string;
    points: number;
    url: string;
    createdAt: number;
    updatedAt: number;
    isDeleted: boolean;
};

const noteSchema = {
    title: "note schema",
    version: 0,
    primaryKey: "id",
    type: "object",
    properties: {
        id: { type: "string", maxLength: 128 },
        title: { type: "string" },
        content: { type: "string" },
        updatedAt: { type: "number" },
        isDeleted: { type: "boolean" }
    },
    required: ["id", "title", "content", "updatedAt", "isDeleted"]
} as const;

const eventSchema = {
    title: "event schema",
    version: 0,
    primaryKey: "id",
    type: "object",
    properties: {
        id: { type: "string", maxLength: 128 },
        name: { type: "string" },
        description: { type: "string" },
        createdAt: { type: "number" },
        updatedAt: { type: "number" },
        isDeleted: { type: "boolean" }
    },
    required: ["id", "name", "description", "createdAt", "updatedAt", "isDeleted"]
} as const;

const challengeSchema = {
    title: "challenge schema",
    version: 0,
    primaryKey: "id",
    type: "object",
    properties: {
        id: { type: "string", maxLength: 128 },
        eventId: { type: "string" },
        title: { type: "string" },
        category: { type: "string" },
        points: { type: "number" },
        url: { type: "string" },
        createdAt: { type: "number" },
        updatedAt: { type: "number" },
        isDeleted: { type: "boolean" }
    },
    required: ["id", "eventId", "title", "category", "points", "url", "createdAt", "updatedAt", "isDeleted"]
} as const;

export type AppCollections = {
    notes: any;
    events: any;
    challenges: any;
};

let dbPromise: Promise<RxDatabase<AppCollections>> | null = null;

export async function getDb() {
    if (!dbPromise) {
        dbPromise = (async () => {
            const db = await createRxDatabase<AppCollections>({
                name: "ctfpad_poc",
                storage: getRxStorageDexie()
            });

            await db.addCollections({
                notes: { schema: noteSchema },
                events: { schema: eventSchema },
                challenges: { schema: challengeSchema }
            });

            return db;
        })();
    }
    return dbPromise;
}
