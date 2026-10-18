# Kigali Maintenance Daily Checklist

Fill in the original Kigali maintenance form and download a completed PDF. The checklist has the original 24 checks.

## Use the local app

1. Double-click `START.bat`.
2. Enter the name of the person on duty. The app asks for this each time it opens and keeps a separate local draft for each name.
3. Answer all 24 checks. Click **Add comment** under any check to open its optional comment box; comments are included in that check's section of the downloaded PDF.
4. Enter the date. Other personnel must draw their own signature; Masengesho Pascal's saved signature is applied automatically when his exact name is selected.
5. Select **Download completed PDF**.

The generated PDF retains the original two-page checklist. Form entries and hand-drawn signatures stay in this browser and are never sent to a server. Pascal's saved signature is a public static asset in the app. Keep the terminal window open while using the local app.

## Build and test

Requires Node.js 20 or newer and npm.

```powershell
npm ci
npm run build:browser
npm test
npm run build:site
```

The GitHub Actions workflow in `.github/workflows/pages.yml` builds the static site and deploys it using GitHub Pages. The site processes forms locally in each visitor's browser.

**Private access requirement:** a private GitHub repository alone does not make its Pages site private. GitHub restricts private Pages access to repositories owned by a GitHub Enterprise Cloud organization. The organization must enable private Pages, and the coworker must be an organization member with at least read access to the repository. The Pages visibility must be explicitly set to **Private** in the repository's Pages settings. Do not publish a public Pages site if checklist access must be restricted.

The public app includes Masengesho Pascal's signature image and applies it automatically when the on-duty name is “Masengesho Pascal.” Anyone with access to the public app can download and reuse that signature. Other on-duty personnel must draw their own signature.

## Install on a phone

Open the GitHub Pages link over HTTPS. On Android, use Chrome's **Install app** button or choose **Install app**/**Add to Home screen** from the browser menu. On iPhone, open the link in Safari, tap **Share**, then choose **Add to Home Screen**. The installed app can load its checklist shell offline after the first successful visit; completed form data remains only in that browser on that device.
