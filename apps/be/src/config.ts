export const config = {
    port: Number(process.env.PORT ?? 8787),
    corsOrigins: (
        process.env.CORS_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173"
    ).split(","),
    /** When set, every request needs `Authorization: Bearer <token>`. */
    bearerToken: process.env.BEARER_TOKEN ?? null,
} as const;