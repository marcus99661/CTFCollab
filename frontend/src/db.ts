import { createRxDatabase } from "rxdb";
import type { RxDatabase } from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";

export type NoteDoc = {
    id: string;
    title: string;
    content: string;
    updatedAt: number;
    isDeleted: boolean; // <- rename
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

export type AppCollections = {
    notes: any;
};

let dbPromise: Promise<RxDatabase<AppCollections>> | null = null;

function makeId() {
    // Works in modern browsers; fallback for older
    return (globalThis.crypto?.randomUUID?.() ?? `note_${Date.now()}_${Math.random().toString(16).slice(2)}`);
}

export async function getDb() {
    if (!dbPromise) {
        dbPromise = (async () => {
            const db = await createRxDatabase<AppCollections>({
                name: "ctfpad_poc",
                storage: getRxStorageDexie()
            });

            await db.addCollections({
                notes: { schema: noteSchema }
            });

            return db;
        })();
    }
    return dbPromise;
}
