import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

export default function InstallSuccessPage() {
    const navigate = useNavigate();
    const params = new URLSearchParams(window.location.search);
    const installationId = params.get("installation_id");
    const action = params.get("action") || params.get("setup_action") || "install";

    useEffect(() => {
        // Auto-refresh accounts after a short delay so dashboard shows newly installed repos
        const t = setTimeout(() => {}, 800);
        return () => clearTimeout(t);
    }, []);

    return (
        <div className="mx-auto max-w-[640px] text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center border border-[#0F172A] bg-[#0F172A] text-white">✓</div>
            <h1 className="mt-4 font-display text-[26px] tracking-[-0.02em] text-[#0F172A]">GitHub App {action === "update" ? "updated" : "installed"}</h1>
            <p className="mx-auto mt-2 max-w-[520px] font-mono text-xs leading-5 text-[#64748B]">
                DriftLock{installationId ? ` installation ${installationId}` : ""} was {action === "update" ? "updated" : "installed"} for your account. Your selected repos are now watched.
            </p>
            <div className="mt-6 flex justify-center gap-2">
                <Link to="/accounts" className="bg-[#0F172A] px-5 py-2.5 font-mono text-xs tracking-wide text-white hover:bg-[#1E293B]">VIEW REPOS →</Link>
                <Link to="/settings" className="border border-[#E6E7EE] bg-white px-5 py-2.5 font-mono text-xs tracking-wide text-[#0F172A] hover:bg-[#FFFBF5]">OPEN SETTINGS</Link>
            </div>
            <p className="mt-6 font-mono text-[11px] tracking-wide text-[#94A3B8]">
                If you do not see your repos, <button onClick={() => navigate({ to: "/install" })} className="underline underline-offset-2 hover:text-[#0F172A]">go to Install again</button> or refresh <Link to="/accounts" className="underline underline-offset-2">/accounts</Link>.
            </p>
        </div>
    );
}
