import { createRxDatabase, removeRxDatabase } from "rxdb";
import type { RxDatabase } from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";

export type NoteDoc = {
    id: string;
    title: string;
    updatedAt: number;
    isDeleted: boolean;
};

export type EventDoc = {
    id: string;
    name: string;
    description: string;
    createdBy: string;
    createdAt: number;
    updatedAt: number;
    isDeleted: boolean;
    startAt: number | null;
    endAt: number | null;
    ctftimeId: number | null;
    flagFormat?: string;
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
    noteId: string | null;
    solved: boolean;
    flag: string | null;
    solvedBy: string | null;
    solvers?: string[];
    description: string;
    ctfdId: number | null;
    fileCount: number;
};

const noteSchema = {
    title: "note schema",
    version: 0,
    primaryKey: "id",
    type: "object",
    properties: {
        id: { type: "string", maxLength: 128 },
        title: { type: "string" },
        updatedAt: { type: "number" },
        isDeleted: { type: "boolean" }
    },
    required: ["id", "title", "updatedAt", "isDeleted"]
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
        createdBy: { type: "string" },
        createdAt: { type: "number" },
        updatedAt: { type: "number" },
        isDeleted: { type: "boolean" },
        startAt: { type: ["number", "null"] },
        endAt: { type: ["number", "null"] },
        ctftimeId: { type: ["number", "null"] },
        flagFormat: { type: "string" }
    },
    required: ["id", "name", "description", "createdBy", "createdAt", "updatedAt", "isDeleted"]
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
        isDeleted: { type: "boolean" },
        noteId: { type: ["string", "null"] },
        solved: { type: "boolean" },
        flag: { type: ["string", "null"] },
        solvedBy: { type: ["string", "null"] },
        solvers: { type: "array", items: { type: "string" } },
        description: { type: "string" },
        ctfdId: { type: ["number", "null"] },
        fileCount: { type: "number" },
    },
    required: ["id", "eventId", "title", "category", "points", "url", "createdAt", "updatedAt", "isDeleted"]
} as const;

export type AppCollections = {
    notes: any;
    events: any;
    challenges: any;
};

let dbPromise: Promise<RxDatabase<AppCollections>> | null = null;

export function resetDb() {
    dbPromise = null;
}

async function deleteIndexedDb(name: string): Promise<void> {
    return new Promise(resolve => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
}

// Used to fix schema miss-match between frontend and backend
export async function clearLocalData() {
    // Close the RxDB handle cleanly if it's healthy, then force-wipe via removeRxDatabase.
    try {
        const db = await getDb();
        await db.close();
    } catch {}
    resetDb();

    try {
        await removeRxDatabase("ctfpad_poc", getRxStorageDexie());
    } catch {}

    // Wipe every remaining IndexedDB database for this origin.
    // Covers per-note Yjs stores ("note-<id>") and any Dexie tables RxDB left behind.
    if (indexedDB.databases) {
        const dbs = await indexedDB.databases();
        await Promise.all(dbs.map(d => d.name ? deleteIndexedDb(d.name) : Promise.resolve()));
    }

    localStorage.removeItem("eventsCheckpoint");
    localStorage.removeItem("challengesCheckpoint");
    localStorage.removeItem("notesCheckpoint");
}

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
