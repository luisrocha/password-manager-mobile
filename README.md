# Password Manager Mobile

> 🚧 work-in-progress 🚧

Android-first mobile app for the self-hosted Password Manager.

The app imports an existing web vault, unlocks it locally, keeps an offline encrypted credential cache, syncs with the Rails server when available, and supports Android Autofill for browser and app login forms.

## Features

- Set up or re-pair a device with a web-generated pairing code.
- Unlock the imported vault locally with the master password.
- Browse, search, reveal, copy, create, edit, and delete credentials offline.
- Queue local changes and sync them when the server is reachable.
- Resolve sync conflicts on device.
- Use Android Autofill to fill existing credentials or add a new credential from an app/site login form.

## Requirements

- Node.js 18 or newer.
- npm.
- Android Studio, Android SDK, and either an emulator or physical Android device.
- A running [`password-manager-web`](https://github.com/luisrocha/password-manager) server reachable from the Android device.

## Local Setup

Install dependencies:

```bash
npm install
```

Create local environment config:

```bash
cp .env.example .env
```

Set `EXPO_PUBLIC_PASSWORD_MANAGER_API_BASE_URL` to the Rails server URL.

HTTP is allowed only in development builds. Non-development builds require HTTPS.
For HTTPS local testing, run the web app through its Docker/Caddy setup, trust
the local Caddy certificate on the Android device, and point the mobile app at
the HTTPS host.

## Run Locally

Start the Android app:

```bash
npm run android
```

If native modules changed or the app reports a missing native module such as `QuickBase64`, rebuild the native app:

```bash
npx expo run:android
```

Useful checks:

```bash
npm run typecheck
npm run style
npm test
npm run security
npm run ci
```

`npm run ci` runs typecheck, style, tests, and `npm audit --audit-level=high`.

## Install On Android

Install locally to a connected device or emulator:

```bash
npx expo run:android
```

For EAS builds, install the EAS CLI and link the project once:

```bash
npx --yes eas-cli@latest init
```

For an internal APK build with EAS:

```bash
npx --yes eas-cli@latest build --profile preview --platform android
```

After the build finishes, open the EAS build link on the Android device and install the APK.

For a production Android App Bundle:

```bash
npx --yes eas-cli@latest build --profile production --platform android
```

Production builds must point at an HTTPS server URL.

## First Use

1. Open the web app and unlock the vault.
2. Go to `Connected apps`.
3. Create a mobile pairing code.
4. Open the mobile app.
5. Choose `Set up device` and enter the pairing code.
6. Unlock locally with the vault master password.

## Android Autofill

1. Open the mobile app.
2. Go to `Autofill settings`.
3. Open Android settings and select Password Manager as the Autofill provider.
4. In a browser or app login form, choose Password Manager from the Android Autofill prompt.
