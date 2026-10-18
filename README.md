# Kigali Maintenance Daily Checklist

Fill in the original Kigali maintenance form and download a completed PDF. The web app includes the original 24 checks plus an additional check for blenders, Robot Coupe food processors, and mixing machines.

## Use the local app

1. Double-click `START.bat`.
2. Enter the name of the person on duty. The app asks for this each time it opens and keeps a separate local draft for each name.
3. Answer all 25 checks. Every **No** needs a comment describing the issue or follow-up.
4. Enter the date and have the person on duty draw their own signature. The signature is required for download and is not saved in the draft; it must be drawn again after a reload.
5. Select **Download completed PDF**.

The generated PDF retains the original two-page checklist and includes the added blender check. Form entries and the signature stay in this browser and are never sent to a server. Keep the terminal window open while using the local app.

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

The signature image provided in chat is not copied into the app or repository. Each on-duty person must personally draw and confirm their own signature.
