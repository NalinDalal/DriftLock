export type FlatSchema = Record<string, string>;

export function flattenPayload(
    obj: Record<string, unknown>,
    prefix = "",
): FlatSchema {
    const result: FlatSchema = {};
    for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;

        if (Array.isArray(value)) {
            result[path] = "array";
            if (
                value.length > 0 &&
                typeof value[0] === "object" &&
                value[0] !== null &&
                !Array.isArray(value[0])
            ) {
                Object.assign(
                    result,
                    flattenPayload(
                        value[0] as Record<string, unknown>,
                        `${path}[]`,
                    ),
                );
            }
        } else if (value !== null && typeof value === "object") {
            Object.assign(
                result,
                flattenPayload(value as Record<string, unknown>, path),
            );
        } else {
            result[path] = value === null ? "null" : typeof value;
        }
    }
    return result;
}
