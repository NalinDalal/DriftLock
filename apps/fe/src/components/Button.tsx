import type { ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
    primary: "bg-neutral-900 text-white hover:bg-neutral-700 active:bg-neutral-800",
    secondary:
        "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100 active:bg-neutral-200",
    ghost: "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100",
};

const SIZES: Record<ButtonSize, string> = {
    sm: "text-xs px-2.5 py-1.5",
    md: "text-sm px-3.5 py-2",
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
            className={`inline-flex items-center gap-1.5 rounded-md font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
            {...props}
        />
    );
}