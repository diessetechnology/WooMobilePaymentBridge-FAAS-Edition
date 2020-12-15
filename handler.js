"use strict"

import axios from "axios"
const stripe = require("stripe") (process.env.STRIPE_SECRET);
module.exports = async (event, context) => {

    const woo = axios.create({
        baseURL: 'https://www.apecalessinotaranto.it/',
        timeout: 1000,
        headers: {'X-Custom-Header': 'foobar'}
    });

    const price =  ((event.body.amount)*100);

    const intent = await stripe.paymentIntents.create({
        payment_method: event.body.paymentMethod,
        amount: price,
        currency: 'eur',
        payment_method_types: ['card'],
        confirm: true,
        confirmation_method: "automatic",
        receipt_email: event.body.receipt_email,
        capture_method: "automatic"
    })
    return {status: intent.status}
}
