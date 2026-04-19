export function makeId(): string {
    return crypto.randomUUID();
}

export function nodeToMarkdown(node: any, listDepth = 0): string {
    if (!node) return "";

    if (node.type === "text") {
        let text = node.text ?? "";
        const marks: any[] = node.marks ?? [];
        const types = marks.map((m: any) => m.type);

        if (types.includes("code")) {
            text = "`" + text + "`";
        } else {
            if (types.includes("bold")) text = "**" + text + "**";
            if (types.includes("italic")) text = "*" + text + "*";
            if (types.includes("strike")) text = "~~" + text + "~~";
        }

        const link = marks.find((m: any) => m.type === "link");
        if (link) text = "[" + text + "](" + (link.attrs?.href ?? "") + ")";

        return text;
    }

    const children = (node.content ?? []).map((c: any) => nodeToMarkdown(c, listDepth)).join("");

    switch (node.type) {
        case "doc":
            return (node.content ?? []).map((c: any) => nodeToMarkdown(c, listDepth)).join("\n\n").trim();
        case "heading":
            return "#".repeat(node.attrs?.level ?? 1) + " " + children;
        case "paragraph":
            return children;
        case "hardBreak":
            return "\n";
        case "horizontalRule":
            return "---";
        case "codeBlock": {
            const lang = node.attrs?.language ?? "";
            return "```" + lang + "\n" + children + "\n```";
        }
        case "blockquote":
            return (node.content ?? [])
                .map((c: any) => nodeToMarkdown(c, listDepth).split("\n").map((l: string) => "> " + l).join("\n"))
                .join("\n\n");
        case "bulletList":
            return (node.content ?? [])
                .map((c: any) => " ".repeat(listDepth * 2) + "- " + nodeToMarkdown(c, listDepth + 1))
                .join("\n");
        case "orderedList":
            return (node.content ?? [])
                .map((c: any, i: number) => " ".repeat(listDepth * 2) + (i + 1) + ". " + nodeToMarkdown(c, listDepth + 1))
                .join("\n");
        case "listItem":
            return (node.content ?? []).map((c: any) => nodeToMarkdown(c, listDepth)).join("\n");
        case "taskList":
            return (node.content ?? [])
                .map((c: any) => " ".repeat(listDepth * 2) + nodeToMarkdown(c, listDepth + 1))
                .join("\n");
        case "taskItem": {
            const mark = node.attrs?.checked ? "[x]" : "[ ]";
            return "- " + mark + " " + (node.content ?? []).map((c: any) => nodeToMarkdown(c, listDepth)).join("\n");
        }
        default:
            return children;
    }
}

export function formatDate(ts: number | null): string {
    if (!ts) return "-";
    return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", hour12: false });
}
