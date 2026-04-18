import { useEffect, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { authFetch } from "../auth";

export const CtfImage = Node.create({
    name: "ctfImage",
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,

    addAttributes() {
        return {
            imageId: {
                default: null as string | null,
                parseHTML: (el: HTMLElement) => el.getAttribute("data-image-id"),
                renderHTML: (attrs: { imageId: string | null }) =>
                    attrs.imageId ? { "data-image-id": attrs.imageId } : {},
            },
        };
    },

    parseHTML() {
        return [{ tag: "div[data-ctf-image]" }];
    },

    renderHTML({ HTMLAttributes }) {
        return ["div", mergeAttributes(HTMLAttributes, { "data-ctf-image": "" })];
    },

    addNodeView() {
        return ReactNodeViewRenderer(ImageNodeView);
    },
});

function ImageNodeView({ node, selected }: NodeViewProps) {
    const imageId = node.attrs.imageId as string | null;
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    const ringClass = selected ? " ring-2 ring-accent" : "";

    useEffect(() => {
        if (!imageId) return;
        let cancelled = false;
        let createdUrl: string | null = null;

        (async () => {
            try {
                const res = await authFetch(`/api/images/${imageId}`);
                if (!res.ok) throw new Error(String(res.status));
                const blob = await res.blob();
                if (cancelled) return;
                createdUrl = URL.createObjectURL(blob);
                setBlobUrl(createdUrl);
            } catch {
                if (!cancelled) setFailed(true);
            }
        })();

        return () => {
            cancelled = true;
            if (createdUrl) URL.revokeObjectURL(createdUrl);
        };
    }, [imageId]);

    if (!imageId) {
        return <NodeViewWrapper className={ringClass.trim() || undefined}><span className="text-muted text-[13px]">[image missing]</span></NodeViewWrapper>;
    }

    if (blobUrl) {
        return (
            <NodeViewWrapper className={`my-2${ringClass}`}>
                <img src={blobUrl} className={`max-w-full rounded border border-border${ringClass}`} />
            </NodeViewWrapper>
        );
    }

    if (failed) {
        return (
            <NodeViewWrapper className={`my-2${ringClass}`}>
                <span className="text-muted text-[13px] font-mono">&lt;@img{imageId}&gt;</span>
            </NodeViewWrapper>
        );
    }

    return (
        <NodeViewWrapper className={`my-2${ringClass}`}>
            <span className="text-muted text-[13px]">Loading image...</span>
        </NodeViewWrapper>
    );
}

export async function uploadImage(file: File, eventId: string): Promise<string | null> {
    const fd = new FormData();
    fd.append("eventId", eventId);
    fd.append("file", file);
    try {
        const res = await authFetch("/api/images", { method: "POST", body: fd });
        if (!res.ok) return null;
        const json = await res.json();
        return json.id as string;
    } catch {
        return null;
    }
}