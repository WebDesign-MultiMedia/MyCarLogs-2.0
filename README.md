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

## Running Locally

```bash
git clone https://github.com/WebDesign-MultiMedia/MyCarLogs-2.0.git
cd MyCarLogs-2.0
npm install
npx tailwindcss -i ./src/input.css -o ./src/output.css --watch
```

Then open `index.html` in your browser.

> To connect your own Google Sheet, replace the SheetDB endpoint in `ManRep.js` with your own API URL and match the column names to your sheet headers.
