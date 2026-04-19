import { useEffect, useRef, useState } from "react";
import { getToken, getCollabUser } from "../auth";
import { nodeToMarkdown } from "../utils";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import Link from "@tiptap/extension-link";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import { markNoteActive, unmarkNoteActive } from "../notePrefetch";
import { CtfImage, uploadImage } from "../extensions/CtfImage";
import "../styles/noteEditor.css";

function getUserInfo(): { name: string; color: string } {
    return getCollabUser()!;
}

function getWsBaseUrl(): string {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/api/yjs`;
}


interface TBtnProps {
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    title: string;
    children: React.ReactNode;
}

function TBtn({ onClick, active, disabled, title, children }: TBtnProps) {
    return (
        <button
            type="button"
            onMouseDown={(e) => {
                e.preventDefault(); // keep editor focus
                onClick();
            }}
            disabled={disabled}
            title={title}
            className={`tb-btn${active ? " tb-btn--active" : ""}`}
        >
            {children}
        </button>
    );
}

function Divider() {
    return <span className="tb-divider" />;
}

function promptLink(editor: Editor) {
    const previous = editor.getAttributes("link").href ?? "";
    const url = window.prompt("URL", previous);

    if (url === null) return;

    if (url === "") {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
        return;
    }

    if (!/^https?:\/\//i.test(url)) {
        window.alert("Only http:// and https:// URLs are allowed.");
        return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
}

function Toolbar({ editor, onDownload, onInsertImage }: { editor: Editor; onDownload: () => void; onInsertImage: () => void }) {
    return (
        <div className="note-toolbar">
            <TBtn
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().undo()}
                title="Undo (Ctrl+Z)"
            >↶</TBtn>
            <TBtn
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().redo()}
                title="Redo (Ctrl+Y)"
            >↷</TBtn>

            <Divider />

            <TBtn
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                active={editor.isActive("heading", { level: 1 })}
                title="Heading 1"
            >H1</TBtn>
            <TBtn
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                active={editor.isActive("heading", { level: 2 })}
                title="Heading 2"
            >H2</TBtn>
            <TBtn
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                active={editor.isActive("heading", { level: 3 })}
                title="Heading 3"
            >H3</TBtn>

            <Divider />

            <TBtn
                onClick={() => editor.chain().focus().toggleBold().run()}
                active={editor.isActive("bold")}
                title="Bold (Ctrl+B)"
            ><b>B</b></TBtn>
            <TBtn
                onClick={() => editor.chain().focus().toggleItalic().run()}
                active={editor.isActive("italic")}
                title="Italic (Ctrl+I)"
            ><i>I</i></TBtn>
            <TBtn
                onClick={() => editor.chain().focus().toggleStrike().run()}
                active={editor.isActive("strike")}
                title="Strikethrough"
            ><s>S</s></TBtn>
            <TBtn
                onClick={() => editor.chain().focus().toggleCode().run()}
                active={editor.isActive("code")}
                title="Inline code"
            >{"<>"}</TBtn>

            <Divider />

            <TBtn
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                active={editor.isActive("bulletList")}
                title="Bullet list"
            >• List</TBtn>
            <TBtn
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                active={editor.isActive("orderedList")}
                title="Numbered list"
            >1. List</TBtn>
            <TBtn
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                active={editor.isActive("blockquote")}
                title="Blockquote"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
                    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
                </svg>
            </TBtn>
            <TBtn
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                active={editor.isActive("codeBlock")}
                title="Code block"
            >{"{ }"}</TBtn>

            <Divider />

            <TBtn
                onClick={() => editor.chain().focus().setHorizontalRule().run()}
                title="Horizontal rule"
            >---</TBtn>

            <Divider />

            <TBtn onClick={onInsertImage} title="Insert image">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                </svg>
            </TBtn>

            <TBtn
                onClick={() => promptLink(editor)}
                active={editor.isActive("link")}
                title="Add or edit link"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 1 0-7.07-7.07l-1.5 1.5" />
                    <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 1 0 7.07 7.07l1.5-1.5" />
                </svg>
            </TBtn>

            <div className="ml-auto">
                <TBtn onClick={onDownload} title="Download as Markdown">Download note</TBtn>
            </div>
        </div>
    );
}


interface Props {
    noteId: string;
    eventId: string;
    downloadName?: string;
}

// Parent must use key={noteId} so this component is fully remounted on note switch.
export default function NoteEditor({ noteId, eventId, downloadName }: Props) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const pickInsertPos = useRef<number | null>(null);
    const [connStatus, setConnStatus] = useState("connecting");
    const [ydoc] = useState(() => new Y.Doc());
    (window as any).ydoc = ydoc; // DEBUG - ydoc.getXmlFragment("default").toString()
    const [wsProvider] = useState(
        () => new WebsocketProvider(getWsBaseUrl(), `${noteId}?token=${getToken()}`, ydoc, { connect: false })
    );

    useEffect(() => {
        markNoteActive(noteId);
        const idb = new IndexeddbPersistence(`note-${noteId}`, ydoc);
        const onStatus = ({ status }: { status: string }) => setConnStatus(status);
        wsProvider.on("status", onStatus);
        wsProvider.connect();

        return () => {
            wsProvider.off("status", onStatus);
            wsProvider.destroy();
            idb.destroy();
            ydoc.destroy();
            unmarkNoteActive(noteId);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const editor = useEditor({
        extensions: [
            StarterKit.configure({ history: false }),
            Collaboration.configure({ document: ydoc }),
            CollaborationCursor.configure({
                provider: wsProvider,
                user: getUserInfo(),
            }),
            Link.configure({
                openOnClick: true,
                autolink: true,
                linkOnPaste: true,
                protocols: ["http", "https"],
                HTMLAttributes: {
                    rel: "noopener noreferrer nofollow",
                    target: "_blank",
                },
                validate: (href: string) => /^https?:\/\//i.test(href),
            }),
            CtfImage,
        ],
        editorProps: {
            handlePaste(view, event) {
                const items = event.clipboardData?.items;
                if (!items) return false;
                for (const item of items) {
                    if (item.type.startsWith("image/")) {
                        const file = item.getAsFile();
                        if (file) {
                            event.preventDefault();
                            insertImageFile(file, view.state.selection.to);
                            return true;
                        }
                    }
                }
                return false;
            },
            handleDrop(view, event) {
                const files = (event as DragEvent).dataTransfer?.files;

                if (!files || files.length === 0) return false;

                const imageFiles = Array.from(files).filter(f => f.type.startsWith("image/"));

                if (imageFiles.length === 0) return false;

                const de = event as DragEvent;
                const coords = view.posAtCoords({ left: de.clientX, top: de.clientY });
                const dropPos = coords?.pos ?? view.state.selection.to;
                event.preventDefault();

                for (const f of imageFiles) insertImageFile(f, dropPos);

                return true;
            },
        },
    });

    async function insertImageFile(file: File, atPos?: number) {
        if (!editor) return;

        const pos = atPos ?? editor.state.selection.to;
        const id = await uploadImage(file, eventId);

        if (!id || !editor) return;

        editor
            .chain()
            .insertContentAt(pos, { type: "ctfImage", attrs: { imageId: id } })
            .focus()
            .run();
    }

    function pickImage() {
        pickInsertPos.current = editor?.state.selection.to ?? null;
        fileInputRef.current?.click();
    }

    async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        const pos = pickInsertPos.current ?? undefined;
        pickInsertPos.current = null;
        await insertImageFile(file, pos);
    }

    const statusColor =
        connStatus === "connected"  ? "#4caf50" :
        connStatus === "connecting" ? "#ff9800" : "#f44336";

    function downloadMarkdown() {
        if (!editor) return;
        const md = nodeToMarkdown(editor.getJSON());
        const blob = new Blob([md], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = (downloadName ?? "note") + ".md";
        a.click();
        URL.revokeObjectURL(url);
    }

    return (
        <div className="note-editor-wrap">
            {editor && <Toolbar editor={editor} onDownload={downloadMarkdown} onInsertImage={pickImage} />}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFileChosen}
            />
            <div className="note-editor-status">
                <span style={{ color: statusColor }}>●</span> {connStatus}
            </div>
            <EditorContent editor={editor} className="note-editor" />
        </div>
    );
}
