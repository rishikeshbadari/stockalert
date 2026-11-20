# Stock Alert

A foreground-only iPhone app for creating and monitoring stock price-zone alarms. It uses local persistence and a clearly labeled demo market-data provider.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

3. Run unit tests

   ```bash
   npm test
   ```

## Market data and notifications

The app currently runs in DEMO mode. The mock provider emits simulated prices, so it must not be interpreted as live market data.

For local Alpaca testing, copy `.env.example` to `.env.local` and enter your **rotated** Alpaca key and secret there. `.env.local` is ignored by Git. Reload the app after editing the file. With valid credentials the app connects to Alpaca's IEX stock-trade stream; otherwise it stays in clearly labeled DEMO mode. The selected feed can be changed with `EXPO_PUBLIC_ALPACA_FEED` (`iex`, `sip`, or `delayed_sip`), subject to account entitlements.

**Local-development security note:** Expo inlines `EXPO_PUBLIC_` values into the app bundle. This direct client connection is only suitable for a private local app; anyone with access to the installed app can extract the credentials. Do not distribute the app or use valuable/reused credentials. A backend is required to keep keys private. The Alpaca key previously pasted into chat should be revoked and replaced before testing.

Local notifications work in Expo Go; remote push notifications and background monitoring require a development build and a backend.

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **src/app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **example** directory and create a blank **src/app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
