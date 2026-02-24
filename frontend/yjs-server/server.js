const http = require('http');
const { WebSocketServer } = require('ws');
const { setupWSConnection, setPersistence } = require('y-websocket/bin/utils');
const Y = require('yjs');
const { Pool } = require('pg');

const PORT = parseInt(process.env.PORT || '4444', 10);
const DB_URL = process.env.DATABASE_URL;

// In dev without DATABASE_URL the server runs fine but skips Postgres persistence
const pool = DB_URL ? new Pool({ connectionString: DB_URL }) : null;
if (!pool) console.warn('[yjs] No DATABASE_URL — running without Postgres persistence');

// Pending debounced writes: noteId -> setTimeout handle
const pendingWrites = new Map();
const WRITE_DEBOUNCE_MS = 1500;

// Extract plain text from TipTap's default XmlFragment for PostgreSQL FTS
function extractText(ydoc) {
    try {
        return ydoc.getXmlFragment('default').toString()
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    } catch {
        return '';
    }
}

setPersistence({
    // Called once when the first client connects to a room: load Yjs state from Postgres
    bindState: async (noteId, ydoc) => {
        if (!pool) return;
        try {
            const { rows } = await pool.query(
                'SELECT yjs_state FROM notes WHERE id = $1',
                [noteId]
            );
            if (rows.length > 0 && rows[0].yjs_state) {
                Y.applyUpdate(ydoc, rows[0].yjs_state);
            }
        } catch (err) {
            console.error(`[yjs] bindState failed for ${noteId}:`, err.message);
        }
    },

    // Called on every Yjs update; debounced so we don't hit Postgres on every keystroke
    writeState: async (noteId, ydoc) => {
        if (!pool) return;
        if (pendingWrites.has(noteId)) {
            clearTimeout(pendingWrites.get(noteId));
        }
        const handle = setTimeout(async () => {
            pendingWrites.delete(noteId);
            try {
                const state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
                const content = extractText(ydoc);
                await pool.query(
                    `UPDATE notes
                     SET yjs_state  = $1,
                         content    = $2,
                         updated_at = $3
                     WHERE id = $4`,
                    [state, content, Date.now(), noteId]
                );
            } catch (err) {
                console.error(`[yjs] writeState failed for ${noteId}:`, err.message);
            }
        }, WRITE_DEBOUNCE_MS);
        pendingWrites.set(noteId, handle);
    },
});

// ── Compaction ────────────────────────────────────────────────────────────────
// Notes idle for more than COMPACT_AFTER_MS get their Yjs state reloaded into a
// fresh Y.Doc so the garbage collector can remove tombstones from deleted content.
// This runs every hour and only touches notes with no pending WebSocket clients
// (active notes have live in-memory state that is already up to date).

const COMPACT_AFTER_MS  = 24 * 60 * 60 * 1000; // 24 h
const COMPACT_INTERVAL  =      60 * 60 * 1000;  //  1 h

async function compactStaleNotes() {
    if (!pool) return;
    const idleSince = Date.now() - COMPACT_AFTER_MS;

    let rows;
    try {
        ({ rows } = await pool.query(
            `SELECT id, yjs_state
               FROM notes
              WHERE yjs_state IS NOT NULL
                AND updated_at < $1`,
            [idleSince]
        ));
    } catch (err) {
        console.error('[yjs] compaction query failed:', err.message);
        return;
    }

    if (rows.length === 0) return;
    console.log(`[yjs] compacting ${rows.length} idle note(s)…`);

    for (const row of rows) {
        try {
            // Apply the stored state to a brand-new doc.
            // With no connected clients, GC has no restrictions and removes
            // as many tombstones as Yjs is able to collect safely.
            const freshDoc = new Y.Doc({ gc: true });
            Y.applyUpdate(freshDoc, row.yjs_state);

            const compacted = Buffer.from(Y.encodeStateAsUpdate(freshDoc));
            freshDoc.destroy();

            await pool.query(
                'UPDATE notes SET yjs_state = $1 WHERE id = $2',
                [compacted, row.id]
            );

            const saved = row.yjs_state.length - compacted.length;
            console.log(
                `[yjs] compacted ${row.id}: ${row.yjs_state.length} → ${compacted.length} bytes` +
                (saved > 0 ? ` (saved ${saved} bytes)` : ' (no change)')
            );
        } catch (err) {
            console.error(`[yjs] compaction failed for ${row.id}:`, err.message);
        }
    }
}

setInterval(compactStaleNotes, COMPACT_INTERVAL);

// ── HTTP + WebSocket server ───────────────────────────────────────────────────
const server = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end('yjs-server ok\n');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (conn, req) => {
    // nginx strips /yjs/ prefix so req.url is /<noteId>
    const noteId = decodeURIComponent(req.url.slice(1).split('?')[0]);
    if (!noteId) {
        conn.close();
        return;
    }
    setupWSConnection(conn, req, { docName: noteId });
});

server.listen(PORT, () => {
    console.log(`[yjs] listening on :${PORT}`);
});
