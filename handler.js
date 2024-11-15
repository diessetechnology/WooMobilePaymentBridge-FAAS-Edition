"use strict"
const stripe = require("stripe") (process.env.STRIPE_SECRET);
module.exports = async (event, context) => {

    const price =  ((event.body.amount)*100);

    let paymentMethod;

    if (event.body.token === "" || event.body.token == null || typeof event.body.token != "string"){
        paymentMethod = event.body.paymentMethod
    }
    else {
        await stripe.paymentMethods.create({type: "card",card: {token: event.body.token}}).then((result) => {
            paymentMethod = result.paymentMethod.id
        });
    }
    console.log(paymentMethod)
    const intent = await stripe.paymentIntents.create({
        payment_method: paymentMethod,
        amount: price,
        currency: 'eur',
        payment_method_types: ['card'],
        receipt_email: event.body.receipt_email,
    })
    return {secret: intent.client_secret}
}
