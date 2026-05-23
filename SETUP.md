# Finance PWA — Setup

## One-time Google Cloud setup (~5 min)

### 1. Create OAuth credentials

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g. "Finance PWA") or reuse one
3. **APIs & Services → Library** → search "Google Sheets API" → Enable
4. **APIs & Services → Credentials → + Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins — add:
     - `http://localhost:8080` (for local testing)
     - `https://YOUR-USERNAME.github.io` (or your Netlify URL once deployed)
5. Click Create. Copy the **Client ID** (looks like `12345-abc.apps.googleusercontent.com`)

### 2. Get your Spreadsheet ID

Open your Google Sheet. The URL looks like:
```
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
```
Copy the long ID between `/d/` and `/edit`.

### 3. Fill in config.js

Open `js/config.js` and replace the two placeholder values:

```js
export const OAUTH_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
export const SPREADSHEET_ID  = 'YOUR_SPREADSHEET_ID';
```

---

## Test locally

You need a local HTTP server (not `file://` — the service worker requires HTTP).

```bash
# Python
cd finance-pwa
python3 -m http.server 8080

# Node (npx)
npx serve .
```

Open http://localhost:8080, sign in with Google, and your data should appear.

---

## Deploy to GitHub Pages

```bash
# From inside finance-pwa/
git init
git add .
git commit -m "initial"
git remote add origin https://github.com/YOUR_USERNAME/finance-pwa.git
git push -u origin main
```

Then in GitHub repo → Settings → Pages → Source: main branch / root.

After deploy, add `https://YOUR-USERNAME.github.io` to the OAuth credential's
Authorized JavaScript origins (back in Google Cloud Console).

---

## App icons (for iOS install)

The manifest references `icons/icon-192.png` and `icons/icon-512.png`.
Open `icons/icon.svg` in a browser, screenshot it, or use any tool
(e.g. [cloudconvert.com](https://cloudconvert.com/svg-to-png)) to export
192×192 and 512×512 PNG files. Place them in the `icons/` folder.

The app works without them — they're only needed for a proper home-screen icon.

---

## Adding the "Add Expense" page later

When you're ready to build it:
1. Change `SCOPES` in `js/config.js` to `https://www.googleapis.com/auth/spreadsheets`
2. Add a `POST` to the Sheets API in `js/api.js`:
   ```
   POST https://sheets.googleapis.com/v4/spreadsheets/{id}/values/Transactions:append
   ```
3. Build out the form in `js/pages/add.js`
