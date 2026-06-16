# MyCarLogs 2.0

A simple, offline-first car maintenance tracker that runs entirely in your browser — no account, no server, no fees.

**Live Site:** https://webdesign-multimedia.github.io/MyCarLogs-2.0/

---

## What It Does

MyCarLogs lets you keep a running history of everything done to your vehicles — oil changes, tire rotations, brake jobs, part replacements, and more. All data is saved locally in your browser using `localStorage`, so your records stay private and are always available without an internet connection.

### Two Logs in One

**Maintenance / Repair Log**
Track service events including:
- Date and mileage at time of service
- Type (Maintenance or Repair)
- Vehicle location (Front-Driver, Rear-Pass, Engine, Transmission, etc.)
- Which vehicle was serviced
- Number of parts replaced
- Notes / issues / reminders
- Optional service info — who did the job, shop address, and labor cost

**Parts Log**
Track individual parts replaced including:
- Date and vehicle
- Part name, brand, and install location
- Price paid and where it was purchased (Amazon, AutoZone, Advance Auto, etc.)

### Records View
Click the spreadsheet icon in the nav to see all saved maintenance and parts records in a clean table, sorted most recent first. A "Clear All" button lets you wipe the history if needed.

---

## Vehicles Tracked

- Honda Pilot 2007
- Honda Odyssey 2010

---

## Tech Stack

- **HTML / CSS** — Tailwind CSS v3
- **JavaScript** — Vanilla JS, no frameworks
- **Icons** — Font Awesome
- **Storage** — Browser `localStorage`

---

## How to Use Locally

```bash
git clone https://github.com/WebDesign-MultiMedia/MyCarLogs-2.0.git
cd MyCarLogs-2.0
npm install
npx tailwindcss -i ./src/input.css -o ./src/output.css --watch
```

Then open `index.html` in your browser.

---

## Navigation

| Icon | Action |
|------|--------|
| Clipboard | Maintenance / Repair form |
| Gears | Parts log form |
| Spreadsheet | View all saved records |

> The wrench icon inside the Maintenance form toggles the optional Service section (shop name, address, and labor cost).
