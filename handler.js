"use strict"

import axios from "axios"
const stripe = require("stripe") (process.env.STRIPE_SECRET);
module.exports = async (event, context) => {

    const woo = axios.create({
        baseURL: 'https://www.apecalessinotaranto.it/',
        timeout: 1000,
        headers: {'X-Custom-Header': 'foobar'}
    });

    const intent = await stripe.paymentIntents.create({
        payment_method: event.body.paymentMethod,
        amount: event.body.amount,
        currency: 'eur',
        payment_method_types: ['card'],
        confirm: true,
        confirmation_method: "automatic",
        receipt_email: event.body.receipt_email,
        capture_method: "automatic"
    }).then(async (res) => {
        if (res.status === "succeeded")
        {
            await woo.post("wp-json/wc/v3/orders/" + id, {}, {
                auth: {
                    username: process.env.WOOAPICK,
                    password: process.env.WOOAPICS
                }
            }).then().catch().done()
        }
    })
    return {status: intent.id}
}
