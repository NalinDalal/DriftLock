import Stripe from "stripe";

const stripe = new Stripe("sk_test_123");

export async function createCharge(amount: number, currency: string) {
    const result = await stripe.charges.create({
        amount,
        currency,
        source: "tok_visa",
    });
    return result.status;
}

export async function createRefund(chargeId: string) {
    const refund = await stripe.refunds.create({
        charge: chargeId,
    });
    return refund.id;
}
