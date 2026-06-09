import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { authFetch } from "../auth";
import { sendOrQueue } from "../offlineQueue";
import { getDb } from "../db";
import { useEventRole } from "../hooks/useEventRole";
import "../styles/ui.css";

type Tab = "scoreboard" | "challenges";

interface CtfdConfig {
    ctfd_url: string;
    auth_type: string;
    has_credential: boolean;
    test_ok?: boolean;
    test_message?: string;
}

interface ScoreboardEntry {
    pos: number;
    account_id: number;
    name: string;
    score: number;
}

interface CtfdChallenge {
    id: number;
    name: string;
    value: number;
    solves: number;
    category: string;
}

export default function CtfdEventPage() {
    const { id } = useParams<{ id: string }>();

    const [config, setConfig] = useState<CtfdConfig | null>(null);
    const { role } = useEventRole(id);
    const isOwner = role === "owner";
    const [configLoading, setConfigLoading] = useState(true);
    const [showConfigForm, setShowConfigForm] = useState(false);
    const [urlInput, setUrlInput] = useState("");
    const [credentialInput, setCredentialInput] = useState("");
    const [authType, setAuthType] = useState<"token" | "cookie">("token");
    const [configError, setConfigError] = useState<string | null>(null);
    const [configSaving, setConfigSaving] = useState(false);

    const [tab, setTab] = useState<Tab>("scoreboard");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [scoreboard, setScoreboard] = useState<ScoreboardEntry[]>([]);
    const [challenges, setChallenges] = useState<CtfdChallenge[]>([]);

    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ added: number; updated: number; skipped: number } | null>(null);

    useEffect(() => {
        loadConfig();
    }, [id]);

    async function loadConfig() {
        setConfigLoading(true);
        try {
            const configRes = await authFetch(`/api/events/${id}/ctfd/config`);

            if (configRes.ok) {
                const data: CtfdConfig = await configRes.json();
                setConfig(data);
                setAuthType(data.auth_type as "token" | "cookie");
                fetchData("scoreboard");
            } else if (configRes.status === 400) {
                setConfig(null);
                await prefillUrlFromCtftime();
            } else if (configRes.status === 403) {
                fetchData("scoreboard");
            }
        } catch {
        } finally {
            setConfigLoading(false);
        }
    }

    async function prefillUrlFromCtftime() {
        try {
            const db = await getDb();
            const doc = await db.events.findOne(id).exec();
            if (!doc) return;
            const ctftimeId = doc.toJSON().ctftimeId;
            if (!ctftimeId) return;
            const res = await authFetch(`/api/ctftime/events/${ctftimeId}`);
            if (!res.ok) return;
            const event = await res.json();
            if (event.url) setUrlInput(event.url);
        } catch {
        }
    }

    async function fetchData(t: Tab) {
        setLoading(true);
        setError(null);
        try {
            const res = await authFetch(`/api/events/${id}/ctfd/${t}`);
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? `Failed to fetch ${t}`);
            if (t === "scoreboard") setScoreboard(json);
            if (t === "challenges") setChallenges(json);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    function switchTab(t: Tab) {
        setTab(t);
        setImportResult(null);
        fetchData(t);
    }

    async function saveConfig() {
        if (!urlInput.trim()) return;
        setConfigSaving(true);
        setConfigError(null);
        try {
            const res = await sendOrQueue(`ctfd-config:${id}`, `/api/events/${id}/ctfd/config`, {
                method: "PUT",
                body: JSON.stringify({
                    ctfd_url: urlInput.trim(),
                    credential: credentialInput.trim() || null,
                    auth_type: authType,
                }),
            });
            if (!res) {
                setConfigError("The configuration will be saved when you reconnect.");
                return;
            }
            const json = await res.json();
            if (!res.ok) { setConfigError(json.error ?? "Failed to save"); return; }
            setConfig(json);
            setShowConfigForm(false);
            setUrlInput("");
            setCredentialInput("");
            if (json.test_ok) fetchData(tab);
        } finally {
            setConfigSaving(false);
        }
    }

    async function deleteConfig() {
        if (!confirm("Remove CTFd configuration?")) return;
        await sendOrQueue(`ctfd-config:${id}`, `/api/events/${id}/ctfd/config`, { method: "DELETE" });
        setConfig(null);
        setScoreboard([]);
        setChallenges([]);
    }

    async function importChallenges() {
        setImporting(true);
        setImportResult(null);
        setError(null);
        try {
            const res = await sendOrQueue(`ctfd-import:${id}`, `/api/events/${id}/ctfd/import`, { method: "POST" });
            if (!res) {
                setError("The import will run when you reconnect.");
                return;
            }
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? "Failed to import challenges");
            setImportResult({ added: json.added, updated: json.updated, skipped: json.skipped });
            fetchData("challenges");
        } catch (e: any) {
            setError(e.message);
        } finally {
            setImporting(false);
        }
    }

    return (
        <div className="max-w-[900px] mx-auto my-8 px-4">
            <div className="mb-5">
                <Link to={`/events/${id}`} className="text-accent no-underline text-sm hover:underline">&lt; Back to event</Link>
            </div>

            <h2 className="text-text font-semibold text-xl m-0 mb-6">CTFd</h2>

            {!configLoading && isOwner && (
                <div className="panel mb-6">
                    <div className="panel-header">Configuration</div>
                    <div className="panel-body">
                        {config && !showConfigForm ? (
                            <>
                                <div className="text-sm text-text">{config.ctfd_url}</div>
                                <div className="text-xs text-muted">
                                    Auth: {config.auth_type === "cookie" ? "Session cookie" : "API token"} - {config.has_credential ? "set" : "not set"}
                                </div>
                                {config.test_message && (
                                    <div className={`text-xs mt-1 ${config.test_ok ? "text-success" : "text-warning"}`}>
                                        {config.test_message}
                                    </div>
                                )}
                                <div className="flex gap-2 mt-1">
                                    <button className="btn" onClick={() => { setUrlInput(config.ctfd_url); setCredentialInput(""); setAuthType(config.auth_type as "token" | "cookie"); setShowConfigForm(true); }}>Edit</button>
                                    <button className="btn btn-danger" onClick={deleteConfig}>Remove</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <label className="form-field">
                                    <span className="form-field-label">CTFd URL</span>
                                    <input className="input" value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://ctf.example.com" autoFocus />
                                </label>
                                <div className="form-field">
                                    <span className="form-field-label">Auth type</span>
                                    <div className="flex gap-4 text-sm">
                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                            <input type="radio" value="token" checked={authType === "token"} onChange={() => setAuthType("token")} />
                                            API token
                                        </label>
                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                            <input type="radio" value="cookie" checked={authType === "cookie"} onChange={() => setAuthType("cookie")} />
                                            Session cookie
                                        </label>
                                    </div>
                                </div>
                                <label className="form-field">
                                    <span className="form-field-label">
                                        {authType === "cookie" ? "Session cookie value" : "API token"}
                                        <span className="form-field-optional">(optional)</span>
                                    </span>
                                    <input
                                        className="input font-mono"
                                        type="password"
                                        value={credentialInput}
                                        onChange={e => setCredentialInput(e.target.value)}
                                        placeholder={authType === "cookie" ? "Paste your session cookie value" : "Paste your API token"}
                                    />
                                </label>
                                {authType === "cookie" && (
                                    <p className="text-muted text-xs m-0">Find this in browser dev tools - Application tab - Cookies - session</p>
                                )}
                                {configError && <p className="text-danger m-0 text-[13px]">{configError}</p>}
                                <div className="form-actions">
                                    <button className="btn btn-primary" onClick={saveConfig} disabled={configSaving || !urlInput.trim()}>
                                        {configSaving ? "Saving..." : "Save"}
                                    </button>
                                    {config && (
                                        <button className="btn" onClick={() => { setShowConfigForm(false); setConfigError(null); }}>Cancel</button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {configLoading ? (
                <div className="text-muted text-sm py-8 text-center">Loading...</div>
            ) : !config && isOwner ? (
                <div className="text-muted text-sm py-8 text-center">No CTFd instance configured for this event yet.</div>
            ) : (
                <>
                    <div className="flex items-end gap-0 border-b border-border mb-4">
                        {(["scoreboard", "challenges"] as Tab[]).map(t => (
                            <button
                                key={t}
                                onClick={() => switchTab(t)}
                                className={`px-4 py-2 bg-transparent border-0 border-b-2 cursor-pointer text-[13px] font-[inherit] capitalize -mb-px ${
                                    tab === t
                                        ? "border-accent text-text font-semibold"
                                        : "border-transparent text-muted"
                                }`}
                            >
                                {t}
                            </button>
                        ))}
                        <div className="flex gap-2 ml-auto mb-1">
                            {tab === "challenges" && challenges.length > 0 && (
                                <button className="btn btn-primary" onClick={importChallenges} disabled={importing}>
                                    {importing ? "Importing..." : "Import challenges"}
                                </button>
                            )}
                            <button className="btn" onClick={() => fetchData(tab)} disabled={loading}>
                                {loading ? "Loading..." : "Refresh"}
                            </button>
                        </div>
                    </div>

                    {error && <p className="text-danger text-[13px] mb-4">{error}</p>}

                    {importResult && (
                        <p className="text-[13px] text-muted mb-4">
                            Imported {importResult.added} new {importResult.added === 1 ? "challenge" : "challenges"}{importResult.updated > 0 ? `, updated ${importResult.updated}` : ""}{importResult.skipped > 0 ? `, skipped ${importResult.skipped} unchanged` : ""}.
                        </p>
                    )}

                    {loading ? (
                        <div className="text-muted text-sm py-8 text-center">Loading...</div>
                    ) : (
                        <>
                            {tab === "scoreboard" && (
                                scoreboard.length === 0 ? (
                                    <div className="text-muted text-sm py-8 text-center">No data.</div>
                                ) : (
                                    <div className="card p-0">
                                        <table className="table">
                                            <thead>
                                                <tr>
                                                    <th>#</th>
                                                    <th>Name</th>
                                                    <th>Score</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {scoreboard.map(e => (
                                                    <tr key={e.account_id}>
                                                        <td className="text-muted w-12">{e.pos}</td>
                                                        <td className="font-medium">{e.name}</td>
                                                        <td className="text-accent font-semibold">{e.score}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )
                            )}

                            {tab === "challenges" && (
                                challenges.length === 0 ? (
                                    <div className="text-muted text-sm py-8 text-center">No data.</div>
                                ) : (
                                    <div className="card p-0">
                                        <table className="table">
                                            <thead>
                                                <tr>
                                                    <th>Name</th>
                                                    <th>Category</th>
                                                    <th>Points</th>
                                                    <th>Solves</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {challenges.map(c => (
                                                    <tr key={c.id}>
                                                        <td className="font-medium">{c.name}</td>
                                                        <td className="text-muted">{c.category}</td>
                                                        <td>{c.value}</td>
                                                        <td className="text-muted">{c.solves}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
}
