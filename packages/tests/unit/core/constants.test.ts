import { describe, expect, test } from "bun:test";
import {
    API_ENDPOINTS,
    HTTP_METHODS,
    DRIFT_CONFIDENCE,
    FIX_TYPES,
    TEST_CLASSIFICATION,
    ERROR_CODES,
} from "@driftlock/core";

describe("API_ENDPOINTS", () => {
    test("has Stripe config", () => {
        expect(API_ENDPOINTS.STRIPE.BASE).toBe("https://api.stripe.com");
        expect(API_ENDPOINTS.STRIPE.VERSION).toBe("v1");
    });
});

describe("HTTP_METHODS", () => {
    test("contains all HTTP methods", () => {
        expect(HTTP_METHODS.GET).toBe("GET");
        expect(HTTP_METHODS.POST).toBe("POST");
        expect(HTTP_METHODS.PUT).toBe("PUT");
        expect(HTTP_METHODS.DELETE).toBe("DELETE");
        expect(HTTP_METHODS.PATCH).toBe("PATCH");
    });

    test("has exactly 5 methods", () => {
        expect(Object.keys(HTTP_METHODS)).toHaveLength(5);
    });
});

describe("DRIFT_CONFIDENCE", () => {
    test("has three levels", () => {
        expect(DRIFT_CONFIDENCE.HIGH).toBe("high");
        expect(DRIFT_CONFIDENCE.MEDIUM).toBe("medium");
        expect(DRIFT_CONFIDENCE.LOW).toBe("low");
    });
});

describe("FIX_TYPES", () => {
    test("contains all fix types", () => {
        expect(FIX_TYPES.FIELD_RENAME).toBe("field_rename");
        expect(FIX_TYPES.TYPE_COERCION).toBe("type_coercion");
        expect(FIX_TYPES.NULL_CHECK).toBe("null_check");
        expect(FIX_TYPES.DEFAULT_VALUE).toBe("default_value");
        expect(FIX_TYPES.CUSTOM).toBe("custom");
    });

    test("has exactly 5 types", () => {
        expect(Object.keys(FIX_TYPES)).toHaveLength(5);
    });
});

describe("TEST_CLASSIFICATION", () => {
    test("contains all classifications", () => {
        expect(TEST_CLASSIFICATION.MONITORED).toBe("monitored");
        expect(TEST_CLASSIFICATION.TESTED_BUT_BLIND).toBe("tested_but_blind");
        expect(TEST_CLASSIFICATION.UNTESTED).toBe("untested");
    });
});

describe("ERROR_CODES", () => {
    test("contains all error codes", () => {
        expect(ERROR_CODES.PARSER_ERROR).toBe("PARSER_ERROR");
        expect(ERROR_CODES.SANDBOX_ERROR).toBe("SANDBOX_ERROR");
        expect(ERROR_CODES.AGENT_ERROR).toBe("AGENT_ERROR");
        expect(ERROR_CODES.GIT_ERROR).toBe("GIT_ERROR");
        expect(ERROR_CODES.PR_ERROR).toBe("PR_ERROR");
    });

    test("has exactly 5 codes", () => {
        expect(Object.keys(ERROR_CODES)).toHaveLength(5);
    });
});
