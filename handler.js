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

function getStripeAccount(body) {
    const candidate = typeof body?.stripeAccount === "string" ? body.stripeAccount : process.env.STRIPE_ACCOUNT;
    if (typeof candidate !== "string") return undefined;
    const trimmed = candidate.trim();
    if (!trimmed) return undefined;
    return trimmed;
}

function extractPaymentMethodId(body) {
    const direct =
        body?.paymentMethodId ??
        body?.payment_method ??
        body?.paymentMethod ??
        body?.payment_method_id;

    if (direct && typeof direct === "object" && typeof direct.id === "string") {
        return direct.id;
    }

    if (typeof direct === "string") return direct;
    return undefined;
}

function isProbablyPaymentMethodId(value) {
    if (typeof value !== "string") return false;
    const v = value.trim();
    if (!v) return false;
    if (v === "card") return false;
    return /^pm_/.test(v) || /^card_/.test(v);
}

module.exports = async ({ req, res, log, error }) => {
    try {
        const body = parseJsonBody(req);
        const stripe = getStripe();
        const stripeAccount = getStripeAccount(body);
        const requestOptions = stripeAccount ? { stripeAccount } : undefined;

        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.json({ error: "Invalid amount" }, 400);
        }

        const price = Math.round(amount * 100);
        const currency = typeof body.currency === "string" && body.currency.trim() ? body.currency.trim().toLowerCase() : "eur";

        let paymentMethodId = extractPaymentMethodId(body);
        const token = typeof body.token === "string" ? body.token.trim() : "";

        if (token) {
            const created = await stripe.paymentMethods.create({
                type: "card",
                card: { token },
            }, requestOptions);
            paymentMethodId = created.id;
        }

        if (typeof paymentMethodId !== "string" || !paymentMethodId.trim()) {
            const intent = await stripe.paymentIntents.create({
                amount: price,
                currency,
                payment_method_types: ["card"],
                receipt_email: typeof body.receipt_email === "string" && body.receipt_email.trim() ? body.receipt_email.trim() : undefined,
            }, requestOptions);
            if (typeof log === "function") {
                log(`Created PaymentIntent ${intent.id} (no payment_method)`);
            }
            return res.json({ secret: intent.client_secret });
        }
        if (!isProbablyPaymentMethodId(paymentMethodId)) {
            return res.json({ error: "Invalid payment method (expected pm_... or token)" }, 400);
        }

        const intent = await stripe.paymentIntents.create({
            payment_method: paymentMethodId.trim(),
            amount: price,
            currency,
            payment_method_types: ["card"],
            receipt_email: typeof body.receipt_email === "string" && body.receipt_email.trim() ? body.receipt_email.trim() : undefined,
        }, requestOptions);

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

if (require.main === module) {
    const express = require("express");
    const app = express();
    app.use(express.json({
        verify: (req, _res, buf) => {
            try { req.bodyRaw = buf?.toString(); } catch (_) {}
        }
    }));
    const wrapRes = (res) => ({
        json: (obj, status) => {
            if (status) res.status(status);
            res.json(obj);
        }
    });
    const callHandler = async (req, res) => {
        await module.exports({
            req,
            res: wrapRes(res),
            log: console.log,
            error: console.error
        });
    };
    app.get("/", (_req, res) => res.status(200).json({ ok: true }));
    app.get("/create-payment-intent", (_req, res) => {
        res.status(200).json({ error: "Use POST /create-payment-intent" });
    });
    app.post("/create-payment-intent", callHandler);
    app.post("/intent", callHandler);
    const port = Number(process.env.PORT) || 3000;
    const host = typeof process.env.HOST === "string" && process.env.HOST.trim() ? process.env.HOST.trim() : "0.0.0.0";
    const server = app.listen(port, host, () => {
        console.log(`server listening on http://${host}:${port}`);
    });
    const shutdown = () => {
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 5000).unref();
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
}
