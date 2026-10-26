# Homebox

A simple log of the equipment, tools and parts around the house, with warranty tracking and recurring maintenance reminders.

It's a single web page with no server and no account. Everything you enter is saved **in the browser you use it in**.

## Using it

- **Add item:** brand, product, type, location, purchase date, warranty, size & specs, parts, price, store, manual link, service contact and notes.
- **Add maintenance:** a task that repeats every N days, weeks, months or years. **Done today** moves it to the next due date.
- **Add to calendar:** creates a repeating Google Calendar event so your phone reminds you.
- **Repair & service log:** dated entries on each item (what was done, cost, who did it). Marking a maintenance task done adds an entry automatically.
- **Install date & expected lifespan:** shows each item's age and flags anything near or past the end of its expected life.
- **Warranty details:** whether it's registered, a link to the warranty or registration page, and where the receipt is.
- **Projects:** bigger jobs with status, priority, area, dates, budget, who's doing it, a link and related equipment. Each project has a steps checklist, a materials and shopping list, and a progress log. Costs in the log add up against the budget.
- **Parts & supplies:** a separate list for spare fittings, pipe, wire, fasteners and so on, with size, quantity on hand, where it's kept, and what it's for.

## Keep your data in a file (recommended on a computer)

At the bottom of the page, click **Keep data in a file…**.

- **Chrome or Edge:** pick where to save `homebox.json`, and Homebox saves every change to it automatically. If the file is in a OneDrive, Dropbox or iCloud Drive folder, it's backed up, and you can open it from Homebox on another computer. Homebox loads the newer copy when you come back. If both copies changed, it asks which one to keep.
- **Firefox and Safari** don't let websites keep saving to a file, so here it takes two steps. **Save to file** downloads `homebox.json`, and **Open file** loads it back. Homebox shows **Unsaved changes** and warns you before you close the page if the file is out of date. To save over the same file every time, open Firefox Settings → Files and Applications → Downloads and turn on **Always ask you where to save files**.

## Keep your data safe

Without a data file, your data lives only in this browser on this device. It does not sync between your phone and your computer.

- Use **Download backup** at the bottom of the page every month or so, and keep the file somewhere safe, such as email or cloud storage. The page reminds you when a backup is more than 30 days old.
- To move to another device, download a backup on the old one and use **Restore from backup** on the new one.
- On iPhone, open the page in Safari, tap Share, then **Add to Home Screen**. Safari can clear saved website data after a few weeks without a visit, but it doesn't do that for home-screen apps.
- Clearing your browser's history and site data erases Homebox, so restore from a backup afterwards.

## Offline

After you've opened Homebox once with an internet connection, it also opens and works offline. Your data is always on your device anyway. The **Add to calendar** and manual links still need a connection. In a Firefox private window, the offline copy isn't kept.

## On your home server

`server/server.js` serves the app and saves your data on the server, so every device and browser shares one copy. It needs Node 20 or newer and has no dependencies.

```
PORT=8080 DATA_DIR=/path/to/data node server/server.js
```

The first time you open it, Homebox asks you to choose a password. Each new device asks for it once. Changes save to the server automatically. If the server can't be reached, changes stay in the browser and sync when it's back. If two devices changed things at the same time, Homebox asks which version to keep.

The data folder holds `homebox.json`, the password hash (`auth.json`), and a daily copy in `backups/` (the last 30 days). Back up that folder. When the app isn't served by this server (GitHub Pages, or opening the file directly), it works as before and saves in the browser.

## Hosting

GitHub Pages serves this repository as-is (Settings → Pages → Deploy from branch → `main` / root). There's no build step: `index.html` is the whole app.
