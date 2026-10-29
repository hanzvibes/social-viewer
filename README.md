# Social Viewer

An Instagram follower/following comparison tool built with Vite and JavaScript.

## Features
- Open an Instagram data export ZIP or select followers JSON and following JSON.
- Compare non-follow-backs, fans, and mutual follows.
- Search results, copy usernames, and export CSV.
- Analyze data in the browser without an app backend or Instagram password.

## Local development
Requires Node.js 20.19 or newer.

Run npm install, then npm run dev. Create a production build with npm run build.

## Vercel
Import this repository in Vercel. Build command: npm run build. Output directory: dist.

## Export format
From Instagram Accounts Center, request an export that includes followers and following in JSON format. Upload the ZIP directly. Results reflect that export snapshot, not live Instagram data.