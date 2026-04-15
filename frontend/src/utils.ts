export function makeId(): string {
    return crypto.randomUUID();
}

export function nodeToMarkdown(node: any, listDepth = 0): string {
    if (!node) return "";

    if (node.type === "text") {
        let text = node.text ?? "";
        const marks: string[] = (node.marks ?? []).map((m: any) => m.type);
        if (marks.includes("code")) return "`" + text + "`";
        if (marks.includes("bold")) text = "**" + text + "**";
        if (marks.includes("italic")) text = "*" + text + "*";
        if (marks.includes("strike")) text = "~~" + text + "~~";
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
        default:
            return children;
    }
}

export function formatDate(ts: number | null): string {
    if (!ts) return "-";
    return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", hour12: false });
}
