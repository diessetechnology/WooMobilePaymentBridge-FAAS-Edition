# MobilePaymentBridge FAAS Edition

MobilePaymentBridge FAAS Edition is a lightweight serverless script that streamlines payment processing with Stripe in mobile applications. I use this script daily in my apps to handle transactions securely and efficiently. Built on top of OpenFaaS, it allows for seamless deployment and scaling of functions without the overhead of managing server infrastructure.

## Features

- **Seamless Stripe Integration**: Easily process payments using Stripe's robust API.
- **Serverless Architecture**: Leverages OpenFaaS for efficient function deployment and scaling.
- **Easy to Deploy**: Quick setup with minimal configuration.
- **Open Source**: Licensed under the MIT License.

## Getting Started

### Prerequisites

- **OpenFaaS**: Installed and configured on your system.
- **faas-cli**: OpenFaaS CLI tool for building and deploying functions.
- **Stripe Account**: Sign up for a [Stripe](https://stripe.com) account to obtain API keys.

### Deployment Guide

Follow these steps to deploy the payment processing function on OpenFaaS without using a `stack.yml` file or a `Dockerfile`:

1. **Install OpenFaaS CLI**

   Make sure you have the `faas-cli` installed:

   ```bash
   curl -sSL https://cli.openfaas.com | sudo sh
   ```

2. **Clone the Repository**

   ```bash
   git clone https://github.com/yourusername/MobilePaymentBridge-FAAS-Edition.git
   ```

3. **Navigate to the Project Directory**

   ```bash
   cd MobilePaymentBridge-FAAS-Edition
   ```

4. **Build the Function**

   Use the `faas-cli` to build the function directly, specifying the function name, language, and handler directory:

   ```bash
   faas-cli build \
     --name mobilepaymentbridge \
     --lang node \
     --handler . \
     --shrinkwrap
   ```
   
5. **Deploy the Function**

   Deploy the function to OpenFaaS:

   ```bash
   faas-cli deploy \
     --name mobilepaymentbridge \
     --image mobilepaymentbridge:latest \
     --gateway http://127.0.0.1:8080 \
     --env STRIPE_SECRET=your_stripe_api_key
   ```

6. **Invoke the Function**

   Test the function by invoking it:

   ```bash
   echo -n '{"amount":1000,"currency":"usd"}' | faas-cli invoke mobilepaymentbridge
   ```

## Usage

Integrate the deployed function into your mobile application by making HTTP requests to the OpenFaaS gateway endpoint where the function is exposed.

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests to improve the project.

## License

This project is licensed under the [MIT License](LICENSE).
