# Password Manager Mobile

Android-first Expo mobile app for the self-hosted password manager.

## Current Scope

- Import an existing encrypted web vault backup by QR code instead of generating a new vault key.
- Work offline from a local encrypted credential cache.
- Sync with the Rails server on unlock when the network is available.
- Exclude browser-extension connection and CSV import features.
- Add Android keyboard suggestions and autofill after the core vault flows are stable.

## Requirements

- Node.js 18 or newer
- npm
- Expo CLI through `npx expo`
- Android Studio or a physical Android device for primary development

## Environment

Copy `.env.example` to `.env` for local development and replace placeholders.

Do not commit real API tokens, passwords, private keys, vault backups, or QR payload captures.

## Commands

```bash
npm install
npm run android
npm run typecheck
npm run style
npm test
npm run security
```
