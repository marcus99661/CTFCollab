export default function Footer() {
    return (
        <footer style={{
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
            padding: "12px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
        }}>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>baka · CTF tool</span>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>v0.1.0</span>
        </footer>
    );
}
