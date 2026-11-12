# MyCarLogs 2.0

**Live Site:** https://webdesign-multimedia.github.io/MyCarLogs-2.0/

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

### Vehicle Management
Vehicles are not hardcoded. You can add any car at any time and remove ones you no longer own. Both the Maintenance and Parts forms stay in sync automatically. Vehicle filter buttons in the Records view also update to match.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Markup | HTML5 |
| Styling | Tailwind CSS v3 |
| Logic | Vanilla JavaScript (no frameworks) |
| Icons | Font Awesome |
| Data storage | Google Sheets via [SheetDB](https://sheetdb.io) API |
| Local backup | Browser `localStorage` |

Data is saved to a connected Google Sheet through the SheetDB API so records are persistent across devices and browsers. A local `localStorage` copy is also kept as a backup.

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

You can add or remove any vehicle directly from the form using the **+ Add / Remove Vehicle** button. Changes apply to both forms and the Records filter instantly.

---

## Google Sheet Setup

Records are stored in one Google Sheet connected to SheetDB (`https://sheetdb.io/api/v1/f85paemez3pqc`). The sheet needs **two tabs**, and the tab names and row-1 headers must match exactly (case-sensitive). SheetDB silently drops any field that has no matching column.

### Tab 1: `maintenance/repairs` (first tab, default)

| ID | Date | Mileage | MainenanceRepairs | VehicleSide | Vehicle | Parts | Service_Provider | SPLocation | Cost | Notes_Issues |
|---|---|---|---|---|---|---|---|---|---|---|

> `MainenanceRepairs` is intentionally spelled this way: the code uses this exact key.

### Tab 2: `parts`

| ID | Date_Purchased | Parts_Name | Parts_Location | Parts_Brand | Price | Purchased | Vehicle |
|---|---|---|---|---|---|---|---|

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

## Running Locally

```bash
git clone https://github.com/WebDesign-MultiMedia/MyCarLogs-2.0.git
cd MyCarLogs-2.0
npm install
npx tailwindcss -i ./src/input.css -o ./src/output.css --watch
```

Then open `index.html` in your browser.

> To connect your own Google Sheet, replace the SheetDB endpoint in `ManRep.js` with your own API URL and match the column names to your sheet headers.
