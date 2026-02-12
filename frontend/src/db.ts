import { createRxDatabase } from "rxdb";
import type { RxDatabase } from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";

export type SharedNoteDoc = {
    id: string;
    content: string;
    updatedAt: number;
};

const sharedNoteSchema = {
    title: "shared note schema",
    version: 0,
    primaryKey: "id",
    type: "object",
    properties: {
        id: { type: "string", maxLength: 64 },
        content: { type: "string" },
        updatedAt: { type: "number" }
    },
    required: ["id", "content", "updatedAt"]
} as const;

export type AppCollections = {
    notes: any; // keep loose for PoC
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
                notes: {
                    schema: sharedNoteSchema
                }
            });

            // Ensure the shared doc exists
            const existing = await db.notes.findOne("shared").exec();
            if (!existing) {
                await db.notes.insert({
                    id: "shared",
                    content: "Hello! This is the shared note.",
                    updatedAt: Date.now()
                });
            }

            return db;
        })();
    }
    return dbPromise;
}
