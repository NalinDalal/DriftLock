import {
    P5_VENDOR,
    STRIPE_VENDOR,
    TWILIO_VENDOR,
    type VendorConfig,
} from "@driftlock/core";

const KNOWN_VENDORS: Record<string, VendorConfig> = {
    stripe: STRIPE_VENDOR,
    twilio: TWILIO_VENDOR,
    p5: P5_VENDOR,
};

/**
 * SDK package name → vendor config. Unknown packages stay unknown: the
 * caller degrades to a draft run rather than guessing a vendor.
 */
export function vendorForPackage(packageName: string): VendorConfig | undefined {
    return KNOWN_VENDORS[packageName.trim().toLowerCase()];
}

/**
 * Webhook endpoint id → vendor config. Unknown endpoints stay unknown.
 */
export function vendorForEndpoint(endpointId: string): VendorConfig | undefined {
    return KNOWN_VENDORS[endpointId.trim().toLowerCase()];
}
