"use strict"
const stripe = require("stripe") (process.env.STRIPE_SECRET);
module.exports = async (event, context) => {

    const price =  ((event.body.amount)*100);

    const intent = await stripe.paymentIntents.create({
        payment_method: event.body.paymentMethod,
        amount: price,
        currency: 'eur',
        payment_method_types: ['card'],
        receipt_email: event.body.receipt_email,
    })
    return {secret: intent.client_secret}
}
