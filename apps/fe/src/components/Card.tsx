import type { ReactNode } from "react";

export function Card({
    children,
    className = "",
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={`rounded-lg border border-neutral-200 bg-white ${className}`}
        >
            {children}
        </div>
    );
}