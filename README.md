# Track My Weather

A red-and-black PWA that places hourly weather beside the matching hour of your primary Google Calendar.

## Run it

1. Install Node.js 22 or newer.
2. Open a terminal in this folder.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open the localhost address shown in the terminal (normally `http://localhost:5173`).

The weather works immediately through Open-Meteo and starts in Detroit. Search for another city or use the location button to save your local forecast.

## Connect Google Calendar

Google requires you to supply your own OAuth Client ID. No client secret is needed or safe to put in this browser app.

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Go to **APIs & Services → Library**, find **Google Calendar API**, and enable it.
4. Go to **APIs & Services → OAuth consent screen** and configure the app. If it is in Testing mode, add your Google account as a test user.
5. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
6. Choose **Web application** and add the exact local origin printed by the dev server under **Authorized JavaScript origins** (for example, `http://localhost:5173`).
7. Copy the Client ID. In Track My Weather, open the gear button, paste it, and save.
8. Select **Connect Google Calendar** and approve read-only Calendar access.

If you deploy the app later, add its HTTPS origin to the same OAuth Client ID.

## Privacy and API notes

- Google access is read-only.
- The access token is kept in memory and disappears when the page is closed or refreshed.
- The Client ID and chosen weather location are stored only in browser local storage.
- Weather and location lookup use Open-Meteo and do not require an API key.
- Internet access is required for live weather, location search, and Calendar data.
