"use strict"
let stripeClient;

function getStripe() {
    if (stripeClient) return stripeClient;
    const key = process.env.STRIPE_SECRET;
    if (typeof key !== "string" || !key.trim()) {
        throw new Error("Missing STRIPE_SECRET");
    }
    stripeClient = require("stripe")(key.trim());
    return stripeClient;
}

function parseJsonBody(req) {
    const body = req?.bodyRaw ?? req?.body ?? "";
    if (body && typeof body === "object") return body;
    if (typeof body !== "string") return {};
    const trimmed = body.trim();
    if (!trimmed) return {};
    try {
        return JSON.parse(trimmed);
    }
    catch (_) {
        return {};
    }
}

module.exports = async ({ req, res, log, error }) => {
    try {
        const body = parseJsonBody(req);
        const stripe = getStripe();

        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.json({ error: "Invalid amount" }, 400);
        }

        const price = Math.round(amount * 100);
        const currency = typeof body.currency === "string" && body.currency.trim() ? body.currency.trim().toLowerCase() : "eur";

        let paymentMethodId = typeof body.paymentMethod === "string" ? body.paymentMethod : undefined;
        const token = typeof body.token === "string" ? body.token.trim() : "";

        if (token) {
            const created = await stripe.paymentMethods.create({
                type: "card",
                card: { token },
            });
            paymentMethodId = created.id;
        }

        if (typeof paymentMethodId !== "string" || !paymentMethodId.trim()) {
            return res.json({ error: "Missing payment method" }, 400);
        }

        const intent = await stripe.paymentIntents.create({
            payment_method: paymentMethodId.trim(),
            amount: price,
            currency,
            payment_method_types: ["card"],
            receipt_email: typeof body.receipt_email === "string" && body.receipt_email.trim() ? body.receipt_email.trim() : undefined,
        });

        if (typeof log === "function") {
            log(`Created PaymentIntent ${intent.id}`);
        }

        return res.json({ secret: intent.client_secret });
    }
    catch (e) {
        if (typeof error === "function") {
            error(e?.message ?? String(e));
        }
        return res.json({ error: "Internal error" }, 500);
    }
};
