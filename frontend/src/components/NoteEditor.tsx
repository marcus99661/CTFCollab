import { useEffect, useState } from "react";
import { getToken, getCollabUser } from "../auth";
import { nodeToMarkdown } from "../utils";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import { markNoteActive, unmarkNoteActive } from "../notePrefetch";
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

function Toolbar({ editor, onDownload }: { editor: Editor; onDownload: () => void }) {
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
            >❝</TBtn>
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

            <div className="ml-auto">
                <TBtn onClick={onDownload} title="Download as Markdown">Download note</TBtn>
            </div>
        </div>
    );
}


interface Props {
    noteId: string;
    downloadName?: string;
}

// Parent must use key={noteId} so this component is fully remounted on note switch.
export default function NoteEditor({ noteId, downloadName }: Props) {
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
        ],
    });

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
            {editor && <Toolbar editor={editor} onDownload={downloadMarkdown} />}
            <div className="note-editor-status">
                <span style={{ color: statusColor }}>●</span> {connStatus}
            </div>
            <EditorContent editor={editor} className="note-editor" />
        </div>
    );
}
