# Password Manager Mobile

Android-first Expo mobile app for the self-hosted password manager.

## Current Scope

- Set up or re-pair this device from the web app instead of generating a new vault key.
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

## Commands

```bash
npm install
npm run android
npm run typecheck
npm run style
npm test
npm run security
```

## Native Crypto Runtime

Vault crypto needs WebCrypto APIs such as `crypto.getRandomValues` and
`crypto.subtle`. The app installs `react-native-quick-crypto` lazily before
running vault crypto operations.

Because this is a native module, full crypto diagnostics require a custom Expo
development build. Expo Go can run the app shell, but it cannot load the native
crypto runtime. If you see `QuickBase64 could not be found`, you are running a
native binary that was built before the native crypto modules were installed, or
you are running Expo Go.

```bash
npx expo prebuild
npx expo run:android
```
