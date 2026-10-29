# Social Viewer

Instagram follower/following comparison tool built with Vite and JavaScript. The app reads exported Instagram relationship data in the browser and does not require Instagram credentials or upload the data to a server.

## Features

- Load the Instagram data export ZIP or select `followers_1.json` and `following.json` directly.
- Compare accounts that don't follow back, fans, and mutual follows.
- Search the result lists, copy usernames, and export a CSV.
- Client-side data processing; no backend or database required.
- Responsive interface for desktop and mobile.

## Run locally

Requires Node.js 20.19+.

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
npm run preview
```

## Deploy to Vercel

Import this repository in Vercel. Vercel should detect Vite automatically. Use the build command `npm run build` and output directory `dist`.

## Get your Instagram data

In Instagram, open **Accounts Center → Your information and permissions → Export your information** (wording may vary by app version). Request a download that includes followers and following, preferably JSON format. Upload the downloaded ZIP here without unzipping it.

The app accepts common Instagram export layouts such as `followers_1.json`, additional `followers_2.json` files, and `following.json`. Results reflect the exported snapshot, not live Instagram data.

## Privacy

Relationship files are read locally in the browser. No application backend receives those files. Do not upload files you do not own or have permission to analyze.