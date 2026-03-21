import Header from "./Header";

export default function PageShell({ children }: { children: React.ReactNode }) {
    return (
        <>
            <Header />
            <main className="app-main">{children}</main>
        </>
    );
}
