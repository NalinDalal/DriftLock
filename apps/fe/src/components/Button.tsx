import type { ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

// Every colour routes through a token. --color-ink inverts per theme, so a
// primary button stays legible in light and dark without a second value.
const VARIANTS: Record<ButtonVariant, string> = {
    primary:
        "bg-[var(--color-ink)] text-[var(--color-paper)] hover:opacity-90 active:scale-[0.98]",
    secondary:
        "border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:bg-[var(--color-paper)] active:scale-[0.98]",
    ghost: "text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface)] active:scale-[0.98]",
};

const SIZES: Record<ButtonSize, string> = {
    sm: "min-h-[36px] px-3 text-xs",
    md: "min-h-[40px] px-3.5 text-[13px]",
};

export function Button({
    variant = "primary",
    size = "md",
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            className={`inline-flex items-center justify-center gap-1.5 rounded-[8px] font-medium transition-[background-color,color,opacity,transform] duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
            {...props}
        />
    );
}

