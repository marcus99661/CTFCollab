import { useEffect, useRef, useState } from "react";
import { getToken, getCollabUser } from "../auth";
import { nodeToMarkdown, downloadBlob } from "../utils";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
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
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10,6 L19,6 C19.5522847,6 20,6.44771525 20,7 L20,7 C20,7.55228475 19.5522847,8 19,8 L10,8 C9.44771525,8 9,7.55228475 9,7 L9,7 L9,7 C9,6.44771525 9.44771525,6 10,6 Z M10,16 L19,16 C19.5522847,16 20,16.4477153 20,17 C20,17.5522847 19.5522847,18 19,18 L10,18 C9.44771525,18 9,17.5522847 9,17 C9,16.4477153 9.44771525,16 10,16 Z M10,11 L19,11 C19.5522847,11 20,11.4477153 20,12 C20,12.5522847 19.5522847,13 19,13 L10,13 C9.44771525,13 9,12.5522847 9,12 C9,11.4477153 9.44771525,11 10,11 Z M5,10.5 L5,10.5 C5.82842712,10.5 6.5,11.1715729 6.5,12 C6.5,12.8284271 5.82842712,13.5 5,13.5 C4.17157288,13.5 3.5,12.8284271 3.5,12 C3.5,11.1715729 4.17157288,10.5 5,10.5 L5,10.5 Z M5,5.5 L5,5.5 C5.82842712,5.5 6.5,6.17157288 6.5,7 L6.5,7 C6.5,7.82842712 5.82842712,8.5 5,8.5 C4.17157288,8.5 3.5,7.82842712 3.5,7 L3.5,7 L3.5,7 C3.5,6.17157288 4.17157288,5.5 5,5.5 L5,5.5 Z M5,15.5 L5,15.5 C5.82842712,15.5 6.5,16.1715729 6.5,17 C6.5,17.8284271 5.82842712,18.5 5,18.5 C4.17157288,18.5 3.5,17.8284271 3.5,17 C3.5,16.1715729 4.17157288,15.5 5,15.5 L5,15.5 Z" />
                </svg>
            </TBtn>
            <TBtn
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                active={editor.isActive("orderedList")}
                title="Numbered list"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5,7.99978522 L5,6.70798687 L4.85355339,6.85442299 C4.65829124,7.04967116 4.34170876,7.04967116 4.14644661,6.85442299 C3.95118446,6.65917483 3.95118446,6.342615 4.14644661,6.14736684 L5.14644661,5.14743843 C5.46142904,4.83247855 6,5.05554597 6,5.50096651 L6,7.99978522 L6.5000358,7.99978522 L6.5000358,7.99978522 C6.7761584,7.99978522 7,8.22362682 7,8.49974942 C7,8.77587203 6.7761584,8.99971363 6.5000358,8.99971363 L5.53191883,8.99971363 C5.52136474,9.00037848 5.51072178,9.00071593 5.5,9.00071593 C5.48927822,9.00071593 5.47863526,9.00037848 5.46808117,8.99971363 L4.4999642,8.99971363 L4.4999642,8.99971363 C4.2238416,8.99971363 4,8.77587203 4,8.49974942 C4,8.22362682 4.2238416,7.99978522 4.4999642,7.99978522 L4.4999642,7.99978522 L5,7.99978522 Z M9.99992841,5.99992841 L19.0000716,5.99992841 L19.0000716,5.99992841 C19.5523168,5.99992841 20,6.4476116 20,6.99985681 L20,6.99985681 L20,6.99985681 C20,7.55210202 19.5523168,7.99978522 19.0000716,7.99978522 L9.99992841,7.99978522 L9.99992841,7.99978522 C9.4476832,7.99978522 9,7.55210202 9,6.99985681 L9,6.99985681 L9,6.99985681 C9,6.4476116 9.4476832,5.99992841 9.99992841,5.99992841 Z M9.99992841,15.9992125 L19.0000716,15.9992125 L19.0000716,15.9992125 C19.5523168,15.9992125 20,16.4468957 20,16.9991409 L20,16.9991409 L20,16.9991409 C20,17.5513861 19.5523168,17.9990693 19.0000716,17.9990693 L9.99992841,17.9990693 C9.4476832,17.9990693 9,17.5513861 9,16.9991409 C9,16.4468957 9.4476832,15.9992125 9.99992841,15.9992125 Z M9.99992841,10.9995704 L19.0000716,10.9995704 L19.0000716,10.9995704 C19.5523168,10.9995704 20,11.4472536 20,11.9994988 L20,11.9994988 C20,12.5517441 19.5523168,12.9994273 19.0000716,12.9994273 L9.99992841,12.9994273 L9.99992841,12.9994273 C9.4476832,12.9994273 9,12.5517441 9,11.9994988 C9,11.4472536 9.4476832,10.9995704 9.99992841,10.9995704 Z M4.64644661,16.6466151 L5.29289322,16.0002148 L4.5,16.0002148 C4.22385763,16.0002148 4,15.7763732 4,15.5002506 C4,15.224128 4.22385763,15.0002864 4.5,15.0002864 L6.5,15.0002864 C6.94545243,15.0002864 7.16853582,15.5388188 6.85355339,15.8537787 L6.14380887,16.5634724 C6.64120863,16.728439 7,17.1973672 7,17.7500895 C7,18.440396 6.44035594,19 5.75,19 L4.5,19 C4.22385763,19 4,18.7761584 4,18.5000358 C4,18.2239132 4.22385763,18.0000716 4.5,18.0000716 L5.75,18.0000716 C5.88807119,18.0000716 6,17.8881508 6,17.7500895 C6,17.6120282 5.88807119,17.5001074 5.75,17.5001074 L5,17.5001074 C4.55454757,17.5001074 4.33146418,16.961575 4.64644661,16.6466151 Z M6.40096969,12.700451 L6.00096969,13.0004296 L6.50096969,13.0004296 C6.77711207,13.0004296 7.00096969,13.2242712 7.00096969,13.5003938 C7.00096969,13.7765164 6.77711207,14.000358 6.50096969,14.000358 L4.50096969,14.000358 C4.02046355,14.000358 3.81656478,13.3887054 4.20096969,13.1004224 L5.80096969,11.9005083 C5.92687261,11.8060879 6.00096969,11.6579043 6.00096969,11.5005369 L6.00096969,11.2505548 C6.00096969,11.1124935 5.88904088,11.0005727 5.75096969,11.0005727 L5.50096969,11.0005727 C5.22482732,11.0005727 5.00096969,11.2244143 5.00096969,11.5005369 C5.00096969,11.7766596 4.77711207,12.0005012 4.50096969,12.0005012 C4.22482732,12.0005012 4.00096969,11.7766596 4.00096969,11.5005369 C4.00096969,10.6721691 4.67254257,10.0006443 5.50096969,10.0006443 L5.75096969,10.0006443 C6.44132563,10.0006443 7.00096969,10.5602483 7.00096969,11.2505548 L7.00096969,11.5005369 C7.00096969,11.9726391 6.77867846,12.4171897 6.40096969,12.700451 Z" />
                </svg>
            </TBtn>
            <TBtn
                onClick={() => editor.chain().focus().toggleTaskList().run()}
                active={editor.isActive("taskList")}
                title="Task list"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9.99992841,5.99992841 L19.0000716,5.99992841 L19.0000716,5.99992841 C19.5523168,5.99992841 20,6.4476116 20,6.99985681 L20,6.99985681 C20,7.55210202 19.5523168,7.99978522 19.0000716,7.99978522 L9.99992841,7.99978522 L9.99992841,7.99978522 C9.4476832,7.99978522 9,7.55210202 9,6.99985681 C9,6.4476116 9.4476832,5.99992841 9.99992841,5.99992841 L9.99992841,5.99992841 Z M9.99992841,15.9992125 L19.0000716,15.9992125 L19.0000716,15.9992125 C19.5523168,15.9992125 20,16.4468957 20,16.9991409 L20,16.9991409 L20,16.9991409 C20,17.5513861 19.5523168,17.9990693 19.0000716,17.9990693 L9.99992841,17.9990693 C9.4476832,17.9990693 9,17.5513861 9,16.9991409 C9,16.4468957 9.4476832,15.9992125 9.99992841,15.9992125 Z M9.99992841,10.9995704 L19.0000716,10.9995704 L19.0000716,10.9995704 C19.5523168,10.9995704 20,11.4472536 20,11.9994988 L20,11.9994988 C20,12.5517441 19.5523168,12.9994273 19.0000716,12.9994273 L9.99992841,12.9994273 C9.4476832,12.9994273 9,12.5517441 9,11.9994988 C9,11.4472536 9.4476832,10.9995704 9.99992841,10.9995704 Z M5.22935099,7.69420576 L7.09998441,5.20002786 C7.26566855,4.97911569 7.57906677,4.93434451 7.79997895,5.10002864 C8.02089112,5.26571278 8.0656623,5.579111 7.89997817,5.80002318 L5.64999574,8.79999974 C5.45636149,9.05817875 5.07249394,9.06801504 4.86589123,8.82009178 L3.61590099,7.3201035 C3.43912033,7.10796671 3.46778214,6.79268682 3.67991893,6.61590616 C3.89205572,6.4391255 4.20733561,6.46778731 4.38411627,6.6799241 L5.22935099,7.69420576 Z M5.22935099,12.6942058 L7.09998441,10.2000279 C7.26566855,9.97911569 7.57906677,9.93434451 7.79997895,10.1000286 C8.02089112,10.2657128 8.0656623,10.579111 7.89997817,10.8000232 L5.64999574,13.7999997 C5.45636149,14.0581787 5.07249394,14.068015 4.86589123,13.8200918 L3.61590099,12.3201035 C3.43912033,12.1079667 3.46778214,11.7926868 3.67991893,11.6159062 C3.89205572,11.4391255 4.20733561,11.4677873 4.38411627,11.6799241 L5.22935099,12.6942058 Z M5.22935099,17.6942058 L7.09998441,15.2000279 C7.26566855,14.9791157 7.57906677,14.9343445 7.79997895,15.1000286 C8.02089112,15.2657128 8.0656623,15.579111 7.89997817,15.8000232 L5.64999574,18.7999997 C5.45636149,19.0581787 5.07249394,19.068015 4.86589123,18.8200918 L3.61590099,17.3201035 C3.43912033,17.1079667 3.46778214,16.7926868 3.67991893,16.6159062 C3.89205572,16.4391255 4.20733561,16.4677873 4.38411627,16.6799241 L5.22935099,17.6942058 Z" />
                </svg>
            </TBtn>
            <TBtn
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                active={editor.isActive("blockquote")}
                title="Blockquote"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7,11 L9.00208688,11 C10.1055038,11 11,11.8982606 11,12.9979131 L11,15.0020869 C11,16.1055038 10.1017394,17 9.00208688,17 L6.99791312,17 C5.89449617,17 5,16.1017394 5,15.0020869 L5,12.9989566 L5,11 C5,8.790861 6.790861,7 9,7 L10,7 C10.5522847,7 11,7.44771525 11,8 C11,8.55228475 10.5522847,9 10,9 L9,9 C7.8954305,9 7,9.8954305 7,11 Z M15,11 L17.0020869,11 C18.1055038,11 19,11.8982606 19,12.9979131 L19,15.0020869 C19,16.1055038 18.1017394,17 17.0020869,17 L14.9979131,17 C13.8944962,17 13,16.1017394 13,15.0020869 L13,12.9989566 L13,11 C13,8.790861 14.790861,7 17,7 L18,7 C18.5522847,7 19,7.44771525 19,8 C19,8.55228475 18.5522847,9 18,9 L17,9 C15.8954305,9 15,9.8954305 15,11 Z" />
                </svg>
            </TBtn>
            <TBtn
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                active={editor.isActive("codeBlock")}
                title="Code block"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.9806 19.1961C11.8723 19.7377 11.3454 20.0889 10.8039 19.9806C10.2623 19.8723 9.91111 19.3455 10.0194 18.8039L12.0194 4.80389C12.1277 4.26233 12.6546 3.91112 13.1961 4.01943C13.7377 4.12774 14.0889 4.65457 13.9806 5.19613L11.9806 19.1961ZM5.41421 12L8.70711 15.2929C9.09763 15.6834 9.09763 16.3166 8.70711 16.7071C8.31658 17.0976 7.68342 17.0976 7.29289 16.7071L3.29289 12.7071C2.90237 12.3166 2.90237 11.6834 3.29289 11.2929L7.29289 7.2929C7.68342 6.90238 8.31658 6.90238 8.70711 7.2929C9.09763 7.68343 9.09763 8.31659 8.70711 8.70712L5.41421 12ZM15.2929 15.2929L18.5858 12L15.2929 8.70712C14.9024 8.31659 14.9024 7.68343 15.2929 7.2929C15.6834 6.90238 16.3166 6.90238 16.7071 7.2929L20.7071 11.2929C21.0976 11.6834 21.0976 12.3166 20.7071 12.7071L16.7071 16.7071C16.3166 17.0976 15.6834 17.0976 15.2929 16.7071C14.9024 16.3166 14.9024 15.6834 15.2929 15.2929Z" />
                </svg>
            </TBtn>

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
            TaskList,
            TaskItem.configure({ nested: true }),
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
        connStatus === "connected"  ? "var(--color-success)" :
            connStatus === "connecting" ? "var(--color-warning)" : "var(--color-danger)";

    function downloadMarkdown() {
        if (!editor) return;
        const md = nodeToMarkdown(editor.getJSON());
        const blob = new Blob([md], { type: "text/markdown" });
        downloadBlob(blob, (downloadName ?? "note") + ".md");
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
