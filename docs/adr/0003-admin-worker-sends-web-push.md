# The admin Worker owns Web Push; the checker only asks it to send

The App badge is kept live with Declarative Web Push (iOS 18.4+, no service worker). The repo is public, so push subscriptions can't be stored in `state.json`. Instead, the admin Worker stores subscriptions in Cloudflare KV, holds the VAPID private key, and exposes a secret-protected endpoint. The checker calls that endpoint when a drop is alerted, and only needs one new secret to do it.

## Considered Options

- **Subscription in a GitHub secret, checker sends directly**: rejected because iOS can rotate a subscription, and the secret would then go stale silently with no way for the phone to update it.
- **Checker reads KV through Cloudflare's API and sends directly**: rejected because it spreads VAPID keys and Cloudflare credentials into Actions for no gain.

## Consequences

Only drops raise the badge while the app is closed. iOS doesn't allow silent pushes, so the count goes down only when the app is opened or when the next drop's push carries a new count. Discord stays the main alert channel, and push is only for drops.
