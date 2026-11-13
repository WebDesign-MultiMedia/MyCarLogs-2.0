# MyCarLogs 2.0

**Live Site:** https://mycarlogs.vercel.app (the old GitHub Pages address redirects here)

---

## Purpose

MyCarLogs 2.0 was built out of a real need — keeping track of what has been done to your vehicles, when it was done, and how much it cost. Most people rely on memory or paper receipts that get lost. This app gives you one place to log every oil change, brake job, part swap, or repair so you always have a clear history of your vehicles' health.

Whether you're doing the work yourself or taking it to a shop, MyCarLogs helps you:

- Know exactly when maintenance is due based on past records
- Track costs over time per vehicle
- Keep a parts history so you know what brand was installed and where you bought it
- Have documentation ready when selling a vehicle or disputing a repair

---

## What It Does

### Maintenance / Repair Log
Every time work is done on a vehicle, you fill out one form:

| Field | What it captures |
|---|---|
| Date | When the work was done |
| Mileage | Odometer reading at time of service |
| Type | Maintenance (scheduled) or Repair (something broke) |
| Location | Which part of the car — Front-Driver, Engine, Transmission, etc. |
| Vehicle | Which car was serviced |
| Parts | Number of parts replaced |
| Notes | Any issues, concerns, or reminders for next time |
| Service Info *(optional)* | Who did the job, shop address, and labor cost |

Service info is hidden by default and revealed with a tap — useful when a shop does the work rather than a DIY job.

### Parts Log
Tracks individual parts separately from the service event:

| Field | What it captures |
|---|---|
| Date | When the part was installed |
| Part Name | What was replaced (e.g. brake pads, air filter) |
| Brand | Manufacturer (Bosch, ACDelco, OEM, etc.) |
| Install Location | Where on the vehicle the part went |
| Vehicle | Which car it went into |
| Price | What you paid |
| Purchased At | Where you bought it (Amazon, AutoZone, Advance Auto, etc.) |

### Records View
Click the spreadsheet icon to see everything logged. Records pull live from Google Sheets via SheetDB so you always see the full history, not just what's on your current device.

**Filters available:**
- **Time** — All / Last 30 Days / Last 90 Days
- **Vehicle** — All or a specific vehicle
- **Type** — All / Maintenance & Repair / Parts only

On mobile, records display as stacked cards. On desktop, they display as a full table.

### Mileage Timeline
Tap the road icon to see each vehicle's service history laid out by odometer reading, newest first. The header shows the current (latest) mileage, number of service stops, miles tracked and total spent. Records logged at the same mileage are grouped into one card; tap a card to see notes and the service provider. Between cards you'll see how many miles and days passed. Records with no mileage are left out and counted at the bottom.

**Service history on each card:** routine maintenance (oil, transmission fluid, brake fluid, coolant, air/cabin filters, spark plugs, tires, inspection) shows how many miles and days since the last one. Part replacements (brake pads, rotors, struts, control arms, CV axles, ABS module, solenoids, battery, starter, alternator, blower motor) show when that part was last replaced; front and rear are tracked separately. If the same part is replaced again within 5,000 mi or 6 months, the card shows a red **Repeat repair** flag, often a sign of a bad part or install. Matching is by keywords in the Parts field, so new job types are added to the `JOBS` list in `timeline.js`.

**Search & filters:** a search bar pinned to the top of the timeline finds services by part, notes, location or shop name (all words must match; matches are highlighted). Filter by type (Maintenance, Repair, Inspection, Purchase) or use a quick filter: Oil changes, Brakes, Tires & wheels, Transmission, Battery & starting. The miles/days between cards are recalculated between the matching services, so you can see how long each brake job or oil change lasted.

**Service reminders:** a card under the header lists routine jobs (oil, air and cabin filters, transmission fluid, brake fluid, coolant, spark plugs, tires, inspection) as **Overdue**, **Due soon** (within 10% of the interval / 500 mi, or 30 days) or **OK**. Each job counts from the last logged service that includes it, using miles and/or months, whichever comes first. With enough history it estimates when the mileage will be reached at your usual pace. **Log it** opens the service form pre-filled for that job. **Intervals** changes the miles/months per vehicle (clear both to turn a job off); defaults are in `REMINDER_DEFAULTS` in `reminders.js`, and only changed intervals are saved to the `reminders` tab.

**Mileage updates:** the **Update** button next to Current Mileage saves an odometer reading without a service (`mileage` tab). Current mileage is the highest reading from services, mileage updates and scans, shown with the date and average miles per month.

### Scan Reports
Tap the stethoscope icon to save OBD2 scanner reports. Upload the **PDF report** from the Topdon app (most accurate) or **screenshots** of it (read with on-device text recognition, so double-check the codes). The app extracts the vehicle, date, mileage, VIN, scan type, each system's pass/fault status and every trouble code (code, description, status, system), including Honda-specific codes like `61-20`. You review and edit everything before saving. Each saved scan shows its codes grouped by system and compares them with the vehicle's previous scan (**new**, **cleared**, **still present**). The original file is saved to your Google Drive, and the "View report" link opens it.

The PDF/image is read in your browser; nothing is sent anywhere except your Google Sheet (data) and your Google Drive (file).

### Vehicle Management
Vehicles are saved in the sheet's `vehicles` tab, so every device shows the same list (the browser keeps a copy so the page draws instantly). Each vehicle has a name and optional VIN, year, make, model, trim and engine. Type the VIN or **Scan VIN** (the barcode on the driver-side door jamb, live with the camera or from a photo), then **Look up VIN** to fill in the details from NHTSA's free vPIC service. Renaming a vehicle never breaks its history: records store the vehicle's fixed `Code`. The details show under the vehicle on the Timeline, and the model year helps the scan code guide.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Markup | HTML5 |
| Styling | Tailwind CSS v3 |
| Logic | Vanilla JavaScript (no frameworks) |
| Icons | Font Awesome |
| Hosting & API | [Vercel](https://vercel.com) (static site + serverless functions in `api/`) |
| Data storage | Google Sheets via [SheetDB](https://sheetdb.io) API, reached only through `/api/sheet` |
| Local backup | Browser `localStorage` |

Data is saved to a connected Google Sheet through the SheetDB API (called by the server, never by the browser) so records are persistent across devices and browsers. A local `localStorage` copy is also kept as a backup.

---

## Navigation

| Icon | Section |
|---|---|
| Clipboard | Maintenance / Repair log form |
| Gears | Parts log form |
| Spreadsheet | Records view with filters |

---

## Vehicles

The default vehicles are:
- Honda Pilot 2007
- Honda Odyssey 2010

Add, edit or remove vehicles from either form with **+ Manage Vehicles**. Changes apply to both forms, the Records filter, Timeline and Scans instantly. The first time the app finds an empty `vehicles` tab, it copies the vehicles from that browser into it.

---

## Google Sheet Setup

Records are stored in one Google Sheet connected to SheetDB. The SheetDB API URL is kept in the Vercel environment variable `SHEETDB_API_URL` (see [Security & Hosting](#security--hosting)). The sheet needs **two tabs**, and the tab names and row-1 headers must match exactly (case-sensitive). SheetDB silently drops any field that has no matching column.

### Tab 1: `maintenance/repairs` (first tab, default)

| ID | Date | Mileage | MainenanceRepairs | VehicleSide | Vehicle | Parts | Service_Provider | SPLocation | Cost | Notes_Issues |
|---|---|---|---|---|---|---|---|---|---|---|

> `MainenanceRepairs` is intentionally spelled this way: the code uses this exact key.

### Tab 2: `parts`

| ID | Date_Purchased | Parts_Name | Parts_Location | Parts_Brand | Price | Purchased | Vehicle |
|---|---|---|---|---|---|---|---|

### Optional tabs (each feature shows these setup steps until its tab exists)

| Tab | Row 1 headers | Used for |
|---|---|---|
| `scans` | see [Scan Reports Setup](#scan-reports-setup) | Scan reports |
| `vehicles` | `ID, Code, Name, VIN, Year, Make, Model, Trim, Engine` | Vehicle list synced across devices |
| `mileage` | `ID, Date, Vehicle, Mileage, Note` | Mileage updates |
| `reminders` | `ID, Vehicle, Job, Miles, Months` | Custom reminder intervals (defaults work without it) |

### Rules

- **`ID` column is required** in both tabs. Edit and delete target a single row by its ID, because SheetDB updates every row that matches a value. Every row needs its own number (1, 2, 3, …). New records get the next ID after the current highest one.
- **Store dropdown values in English.** The UI translates them for display (`i18n.js`), but the sheet must hold the stable English values:
  - Type: `Maintenance`, `Repair`, `Inspection`, `Purchase`
  - Location (Wheels & Corners): `Front-Driver`, `Front-Pass`, `Rear-Driver`, `Rear-Pass`, `Front-(Drive|Pass)`, `Rear-(Drive|Pass)`, `Front & Rear`, `All Corners`
  - Location (Powertrain): `Engine`, `Transmission`, `Engine & Transmission`, `Exhaust`
  - Location (Body & Systems): `Interior`, `Exterior`, `Electrical`, `Entire Vehicle`
  - The app shows friendlier labels (e.g. `Front-(Drive|Pass)` displays as "Front – Both Sides"). To add an option, add it to `LOCATION_GROUPS` / `TYPE_OPTIONS` in `ManRep.js` and its label to both languages in `i18n.js`. Never rename an existing value, because rows in the sheet depend on it.
  - A value that isn't in the list still displays as-is, and is kept when you edit that row.
- Column order doesn't matter, but the header names do. Extra columns (e.g. a `LEGEND` column) are ignored.
- If a tab is renamed in Google Sheets, update `SHEETDB_PARTS_URL` and the `sheetRowUrl(...)` calls in `ManRep.js`.

---

## Scan Reports Setup

**1. Add the `scans` tab to the Google Sheet.** Open the Scans section: until the tab exists it shows a **Copy headers** button. Create a tab named `scans`, click cell A1 and paste. The headers are:

`ID | Date | Vehicle | Mileage | Scan_Type | Report_Number | VIN | Systems_Scanned | Systems_Faulty | DTC_Count | Systems | DTCs | Files | Notes`

(`Systems`, `DTCs` and `Files` hold JSON text written by the app; don't edit those by hand.)

**2. Connect Google Drive (to keep the original PDF/images).** Optional: without it, only the extracted data is saved.
1. Go to [script.google.com](https://script.google.com) → **New project**, delete the sample code and paste all of [`google-apps-script/drive-upload.gs`](google-apps-script/drive-upload.gs).
2. Change `UPLOAD_KEY` at the top to your own long secret phrase. Save. (Never commit your real key.)
3. **Deploy → New deployment** → gear icon → **Web app**. Set **Execute as: Me** and **Who has access: Anyone**. Click **Deploy** and allow the permissions (Google will warn that the app is unverified, because it's your own script: **Advanced → Go to project**).
4. Copy the **Web app URL** (ends in `/exec`). Opening it in a browser should show `{"ok":true,...}`.
5. Put the URL in the Vercel variable `DRIVE_SCRIPT_URL` and the key in `DRIVE_UPLOAD_KEY`, then redeploy. The Scans section then shows **Google Drive connected**.

Files go to a Drive folder named **MyCarLogs Scan Reports** and stay **private**: only your Google account can open them. The upload key stops strangers from adding files to your Drive, and it never reaches the browser. Uploads are limited to 3 MB per file (large photos are shrunk automatically). If you edit the script later, use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.

---

## Security & Hosting

The site runs on **Vercel**. The browser never sees any key: it only talks to the app's own API in `api/`, and the API only answers after you sign in.

| Route | What it does |
|---|---|
| `POST /api/login` | Checks the app password, sets a signed session cookie (HttpOnly, Secure, SameSite=Strict, 30 days) |
| `POST /api/logout` | Clears the cookie |
| `GET /api/session` | Tells the page whether you're signed in and whether Drive uploads are set up |
| `/api/sheet` | Signed-in proxy to SheetDB (`GET`/`POST` a tab, `PATCH`/`DELETE` one row by `id`); only the default tab and the `parts`, `scans`, `vehicles`, `mileage` and `reminders` tabs are allowed |
| `POST /api/drive-upload` | Signed-in proxy to the Apps Script uploader |

**Environment variables** (Vercel → Project → Settings → Environment Variables, Production):

| Name | Value |
|---|---|
| `APP_PASSWORD` | The password you type on the sign-in screen. Changing it signs out every device. |
| `SESSION_SECRET` | 32+ random characters (e.g. `openssl rand -hex 32`). Changing it also signs out every device. |
| `SHEETDB_API_URL` | `https://sheetdb.io/api/v1/<your id>` |
| `SHEETDB_LOGIN` / `SHEETDB_PASSWORD` | The basic-auth login/password set in SheetDB's API settings. With these set, the SheetDB URL alone is useless to anyone else. |
| `DRIVE_SCRIPT_URL` / `DRIVE_UPLOAD_KEY` | Optional, for saving scan files to Drive (see above). |

After changing a variable, redeploy (Vercel → Deployments → ⋯ → Redeploy, or push a commit). Every push to `main` deploys automatically.

---

---

## Running Locally

```bash
git clone https://github.com/WebDesign-MultiMedia/MyCarLogs-2.0.git
cd MyCarLogs-2.0
npm install
npx tailwindcss -i ./src/input.css -o ./src/output.css --watch
```

To run it with the API, install the [Vercel CLI](https://vercel.com/docs/cli), then:

```bash
vercel link          # once, pick the mycarlogs project
vercel env pull --environment=production   # copies the variables into .env.local (git-ignored)
vercel dev           # serves the site and /api on http://localhost:3000
```
