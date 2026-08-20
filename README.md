# Gassi

A dog-walk companion app prototype — drop a pin when you head out, see who else is out nearby, send/accept join requests.

## Deploy to Vercel (no coding required)

1. **Create a GitHub account** (if you don't have one): https://github.com/signup
2. **Create a new repository**: on github.com click the "+" top right → "New repository" → name it `gassi-app` → Create.
3. **Upload these files**: on the new repo's page, click "uploading an existing file" and drag in this entire folder's contents (keep the `src` folder structure intact). Commit.
4. **Create a Vercel account**: https://vercel.com/signup — sign up with your GitHub account (one click, no separate password).
5. **Import the project**: on Vercel's dashboard, click "Add New" → "Project" → select your `gassi-app` repo → Import.
6. Vercel will auto-detect it's a Vite project. Leave all settings as default. Click **Deploy**.
7. Wait ~60 seconds. You'll get a live URL like `gassi-app-yourname.vercel.app` — that's a real, working link you can send to anyone.

## Important limitation to know

This version saves data in the browser's `localStorage` — meaning each phone/browser has its own separate data. The "demo phone" switcher still works for showing yourself how requests work, but two different real people on two different phones won't see each other's walks yet.

To make it truly multi-user (two real phones seeing each other live), the next step is connecting a real shared database — Supabase is a good free option for this.
