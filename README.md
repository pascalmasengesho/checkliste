# Kigali Maintenance Daily Checklist

Fill in the original Kigali maintenance form and download a completed PDF. The checklist has the original 24 checks.

Use **Open report generator** near the top of the app to open the separate report page in a new tab. This is an app-only link and does not appear in the downloaded checklist PDF.

## Use the local app

1. Double-click `START.bat`.
2. Enter the name of the person on duty. The app asks for this each time it opens and keeps a separate local draft for each name.
3. Answer all 24 checks. The date is set to the current day automatically. Click **Add comment** under any check to open its optional multiline comment box; long comments continue on extra pages in the downloaded PDF.
4. Masengesho Pascal and Mwumvaneza Fabrice's saved signatures are applied automatically when their exact names are selected; other personnel must draw their own signature.
5. Select **Download completed PDF**.

The generated PDF retains the original two-page checklist. Checklist form entries and hand-drawn signatures stay in this browser and are never sent to a server. The separate shared service log requires an internet connection and an invited staff sign-in. Pascal's saved signature is a public static asset in the app. Keep the terminal window open while using the local app.

## Set up the shared service log

The shared equipment history uses Supabase. It is unavailable until the project owner completes these one-time steps:

1. Create a Supabase project at [supabase.com/dashboard](https://supabase.com/dashboard) and save its database password privately.
2. In **Project Settings → API**, copy the **Project URL** and the **public anon/publishable key**. Never use or publish the `service_role` or secret key in this website.
3. In **SQL Editor**, run the contents of [`supabase/schema.sql`](./supabase/schema.sql). This creates an append-only service log, stamps each record with the authenticated staff account, and restricts reads and writes to authenticated users through row-level security.
4. In **Authentication → Providers → Email**, enable email sign-in. In **Authentication → URL Configuration**, add the deployed GitHub Pages URL (and the local app URL if needed) to the allowed redirect URLs. Disable public sign-ups.
5. In **Authentication → Users**, invite each staff member by email. In **SQL Editor**, add each invited address to the private staff allowlist, replacing the example email:

   ```sql
   insert into public.maintenance_service_staff (email)
   values (lower('staff@example.com'))
   on conflict (email) do nothing;
   ```

   The database checks this allowlist as well as authentication, so another signed-in account cannot read or write the service history.
6. Put the Project URL and public anon/publishable key in `window.MAINTENANCE_SUPABASE_CONFIG` near the top of `index.html`, replacing the empty strings. The public key is designed for browser use; the database policies, not secrecy of this key, protect staff records.
7. Build and deploy the site. Staff sign in with their invited email, then use **Equipment service & reminders** to record work or schedule the next service. Alerts appear on the checklist when an equipment item is overdue, due today, or due in the next 7 days.

Each new service entry is immutable and records the signed-in email automatically. To change a schedule, add a newer record for the same equipment; that new record becomes its active reminder. An entry without a next-service date clears the previous reminder for that equipment.

## Build and test

Requires Node.js 20 or newer and npm.

```powershell
npm ci
npm run build:browser
npm test
npm run build:site
```

The GitHub Actions workflow in `.github/workflows/pages.yml` builds the static site and deploys it using GitHub Pages. The checklist and work-order forms are processed locally in each visitor's browser. The shared service log is stored in the configured Supabase project and is protected by its row-level security policies.

**Private access requirement:** a private GitHub repository alone does not make its Pages site private. GitHub restricts private Pages access to repositories owned by a GitHub Enterprise Cloud organization. The organization must enable private Pages, and the coworker must be an organization member with at least read access to the repository. The Pages visibility must be explicitly set to **Private** in the repository's Pages settings. Do not publish a public Pages site if checklist access must be restricted.

The public app includes signature images for Masengesho Pascal and Mwumvaneza Fabrice, and applies each automatically when the matching on-duty name is selected. Anyone with access to the public app can download and reuse these signatures. Other on-duty personnel must draw their own signature.

## Install on a phone

Open the GitHub Pages link over HTTPS. On Android, use Chrome's **Install app** button or choose **Install app**/**Add to Home screen** from the browser menu. On iPhone, open the link in Safari, tap **Share**, then choose **Add to Home Screen**. The installed app can load its checklist shell offline after the first successful visit; completed form data remains only in that browser on that device.
