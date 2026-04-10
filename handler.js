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

function toCents(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100);
}

function extractConnectDestination(body) {
    const v =
        body?.destination ??
        body?.destinationAccount ??
        body?.destination_account ??
        body?.connectedAccount ??
        body?.connectedAccountId ??
        body?.stripeAccountDestination;

    if (typeof v !== "string") return null;
    const trimmed = v.trim();
    if (!trimmed) return null;
    if (!/^acct_/.test(trimmed)) return null;
    return trimmed;
}

function computeApplicationFeeAmount(amountCents, body) {
    const direct = body?.applicationFee ?? body?.application_fee ?? body?.applicationFeeAmount ?? body?.application_fee_amount;
    const percent = body?.applicationFeePercent ?? body?.application_fee_percent;

    if (direct !== undefined && direct !== null && direct !== "") {
        const feeCents = toCents(direct);
        if (feeCents === null) return null;
        if (feeCents >= amountCents) return null;
        return feeCents;
    }

    if (percent !== undefined && percent !== null && percent !== "") {
        const p = Number(percent);
        if (!Number.isFinite(p) || p < 0 || p >= 100) return null;
        const feeCents = Math.round(amountCents * (p / 100));
        if (feeCents <= 0) return 0;
        if (feeCents >= amountCents) return null;
        return feeCents;
    }

    return undefined;
}

async function createStripeConnectPaymentIntent(body, { log } = {}) {
    const amountCents = toCents(body?.amount);
    if (amountCents === null) {
        return { status: 400, json: { error: "Invalid amount" } };
    }

    const currency = typeof body?.currency === "string" && body.currency.trim() ? body.currency.trim().toLowerCase() : "eur";
    const destination = extractConnectDestination(body);
    if (!destination) {
        return { status: 400, json: { error: "Missing/invalid destination account (expected acct_...)" } };
    }

    const feeCents = computeApplicationFeeAmount(amountCents, body);
    if (feeCents === null) {
        return { status: 400, json: { error: "Invalid application fee" } };
    }

    const paymentMethodIdRaw = extractPaymentMethodId(body);
    const paymentMethodId = typeof paymentMethodIdRaw === "string" ? paymentMethodIdRaw.trim() : "";
    const token = typeof body?.token === "string" ? body.token.trim() : "";

    const stripe = getStripe();

    let resolvedPaymentMethodId = paymentMethodId;
    if (token) {
        const created = await stripe.paymentMethods.create({ type: "card", card: { token } });
        resolvedPaymentMethodId = created.id;
    }

    if (resolvedPaymentMethodId && !isProbablyPaymentMethodId(resolvedPaymentMethodId)) {
        return { status: 400, json: { error: "Invalid payment method (expected pm_... or token)" } };
    }

    const transferGroup = typeof body?.transfer_group === "string"
        ? body.transfer_group.trim()
        : (typeof body?.transferGroup === "string" ? body.transferGroup.trim() : "");

    const params = {
        amount: amountCents,
        currency,
        payment_method_types: ["card"],
        receipt_email: typeof body?.receipt_email === "string" && body.receipt_email.trim() ? body.receipt_email.trim() : undefined,
        transfer_data: { destination },
        application_fee_amount: typeof feeCents === "number" ? feeCents : undefined,
        transfer_group: transferGroup || undefined,
        on_behalf_of: destination
    };

    if (resolvedPaymentMethodId) {
        params.payment_method = resolvedPaymentMethodId;
    }

    const intent = await stripe.paymentIntents.create(params);

    if (typeof log === "function") {
        log(`Created Connect PaymentIntent ${intent.id} destination=${destination}`);
    }

    return { status: 200, json: { secret: intent.client_secret, id: intent.id } };
}

let paypalClient;
let paypalOrdersController;
let paypalSdk;
function getPaypalOrdersController() {
    if (paypalClient && paypalOrdersController && paypalSdk) {
        return { client: paypalClient, ordersController: paypalOrdersController, paypal: paypalSdk };
    }
    const id = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    if (typeof id !== "string" || !id.trim()) {
        throw new Error("Missing PAYPAL_CLIENT_ID");
    }
    if (typeof secret !== "string" || !secret.trim()) {
        throw new Error("Missing PAYPAL_CLIENT_SECRET");
    }
    paypalSdk = require("@paypal/paypal-server-sdk");
    const envName = typeof process.env.PAYPAL_ENV === "string" ? process.env.PAYPAL_ENV.toLowerCase().trim() : "sandbox";
    const environment = envName === "live" ? paypalSdk.Environment.Production : paypalSdk.Environment.Sandbox;
    paypalClient = new paypalSdk.Client({
        clientCredentialsAuthCredentials: {
            oAuthClientId: id.trim(),
            oAuthClientSecret: secret.trim()
        },
        environment
    });
    paypalOrdersController = new paypalSdk.OrdersController(paypalClient);
    return { client: paypalClient, ordersController: paypalOrdersController, paypal: paypalSdk };
}

function toAmountString(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return (Math.round(n * 100) / 100).toFixed(2);
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

module.exports.createStripeConnectPaymentIntent = createStripeConnectPaymentIntent;

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
    app.post("/stripe/connect/create-payment-intent", async (req, res) => {
        try {
            const result = await createStripeConnectPaymentIntent(req.body, { log: console.log });
            return res.status(result.status).json(result.json);
        } catch (e) {
            return res.status(500).json({ error: e?.message ?? "Internal error" });
        }
    });
    app.post("/paypal/create-order", async (req, res) => {
        try {
            const body = req.body || {};
            const value = toAmountString(body.amount);
            if (!value) return res.status(400).json({ error: "Invalid amount" });
            const currency = typeof body.currency === "string" && body.currency.trim() ? body.currency.trim().toUpperCase() : "EUR";
            const { ordersController, paypal } = getPaypalOrdersController();
            const collect = {
                body: {
                    intent: paypal.CheckoutPaymentIntent.Capture,
                    purchaseUnits: [{ amount: { currencyCode: currency, value } }]
                },
                prefer: "return=minimal"
            };
            const { result } = await ordersController.createOrder(collect);
            return res.status(200).json({ id: result.id, status: result.status });
        } catch (e) {
            const paypal = paypalSdk;
            if (paypal?.ApiError && e instanceof paypal.ApiError) {
                const details = e.result;
                const message = e.message || details?.error_description || details?.message || "PayPal API error";
                return res.status(e.statusCode || 500).json({ error: message, details });
            }
            return res.status(500).json({ error: e?.message ?? "Internal error" });
        }
    });
    app.post("/paypal/capture-order", async (req, res) => {
        try {
            const body = req.body || {};
            const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
            if (!orderId) return res.status(400).json({ error: "Missing orderId" });
            const { ordersController } = getPaypalOrdersController();
            const collect = { id: orderId, prefer: "return=minimal" };
            const { result } = await ordersController.captureOrder(collect);
            return res.status(200).json({ id: result.id, status: result.status });
        } catch (e) {
            const paypal = paypalSdk;
            if (paypal?.ApiError && e instanceof paypal.ApiError) {
                const details = e.result;
                const message = e.message || details?.error_description || details?.message || "PayPal API error";
                return res.status(e.statusCode || 500).json({ error: message, details });
            }
            return res.status(500).json({ error: e?.message ?? "Internal error" });
        }
    });
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
