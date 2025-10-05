<p align="center">
  <a href="https://www.medusajs.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://user-images.githubusercontent.com/59018053/229103275-b5e482bb-4601-46e6-8142-244f531cebdb.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
    <img alt="Medusa logo" src="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
    </picture>
  </a>
</p>
<h1 align="center">
  Medusa EmailPass Verified Auth Plugin
</h1>

A plugin for implementing authentication with email and password, with added security through email verification.

## Compatibility

This starter is compatible with versions >= 2.10.3 of `@medusajs/medusa`. Lower version were not tested

## Pre requisites
- Email Notification Module installed in your Medusa application as the verification code will be sent via email. You can check existent plugins [here](https://medusajs.com/integrations/?category=Notification)
- Subscriber listening to the `EmailPassVerifiedEvents.CODE_GENERATED` event to send the email verification. Example implementation:
```js
// src/subscribers/auth-send-verification-email.ts

import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { CodeGeneratedEventData, EmailPassVerifiedEvents } from "@nicogorga/medusa-auth-emailpass-verified/providers/emailpass-verified/types";
import { Modules } from "@medusajs/framework/utils";

export default async function({ container, event }: SubscriberArgs<CodeGeneratedEventData>) {
    const notificationService = container.resolve(Modules.NOTIFICATION)
    const { email, code, callbackUrl } = event.data

    await notificationService.createNotifications({
        to: email,
        channel: 'email',
        template: 'verification-code',
        content: {
            subject: 'Account Verification',
            html: `
                <h1>Verify your account</h1>
                <p>Please verify your email address by clicking the link below:</p>
                <p>
                    <a href="${callbackUrl}?email=${encodeURIComponent(email)}&code=${code}"
                       style="background-color: #4CAF50; color: white; padding: 14px 20px; text-align: center; text-decoration: none; display: inline-block; border-radius: 4px;">
                        Verify Email
                    </a>
                </p>
                <p>If you didn't request this verification, please ignore this email.</p>
            `
        }
    })
}

export const config: SubscriberConfig = {
    event: EmailPassVerifiedEvents.CODE_GENERATED,
    context: {
        subscriberId: 'emailpass-verified-verification-code-sender'
    }
}
```

## Installation
1. Install the plugin

```bash
yarn add @nicogorga/medusa-auth-emailpass-verification
# or
npm install @nicogorga/medusa-auth-emailpass-verification
```

2. Add the plugin to your `medusa-config.ts`:

```js
{
  // ... other configs
  modules: [
    // ... other modules
    {
      resolve: "@medusajs/medusa/auth",
      dependencies: [Modules.CACHE, ContainerRegistrationKeys.LOGGER],
      options: {
        providers: [
          // ... other auth providers
          {
            resolve: "@nicogorga/medusa-auth-emailpass-verified",
            id: "emailpass-verified",
          }
        ]
      }
    },
  ]
}
```

## Usage

> ℹ️ If you want to see an example of an auth flow implementation for this plugin, you can check the [following repository](https://github.com/NicolasGorga/medusa-auth-emailpass-verified-storefront), which showcases authenticating customers in the NextJS starter

1. Call the authentication route 

```json
POST /auth/customer/emailpass-verified
{
  "email": "test@test.com",
  "password": "supersecret",
  "callback_url": "localhost:8000/auth/emailpass-verified/customer"
}
```

2. An email will be sent to the address matching the `email` from the previous point. When the user clicks on the link received in the email, they should be redirected to `callback_url?email=email&code=code`

3. Call the validate callback route from the `callback_url` passing the query parameters as they are.

```
POST /auth/customer/emailpass-verified/callback?email=email&code=code
```

4. With the received token, call the relevant endpoint to create the corresponding entity, like the Customer. 