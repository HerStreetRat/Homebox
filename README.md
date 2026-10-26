# Homebox

A simple log of the equipment, tools and parts around the house, with warranty tracking and recurring maintenance reminders.

It's a single web page with no server and no account. Everything you enter is saved **in the browser you use it in**.

## Using it

- **Add item:** brand, product, type, location, purchase date, warranty, size & specs, parts, price, store, manual link, service contact and notes.
- **Add maintenance:** a task that repeats every N days, weeks, months or years. **Done today** moves it to the next due date.
- **Add to calendar:** creates a repeating Google Calendar event so your phone reminds you.

## Keep your data safe

Your data lives only in this browser on this device. It does not sync between your phone and your computer.

- Use **Download backup** at the bottom of the page every month or so, and keep the file somewhere safe, such as email or cloud storage. The page reminds you when a backup is more than 30 days old.
- To move to another device, download a backup on the old one and use **Restore from backup** on the new one.
- On iPhone, open the page in Safari, tap Share, then **Add to Home Screen**. Safari can clear saved website data after a few weeks without a visit, but it doesn't do that for home-screen apps.
- Clearing your browser's history and site data erases Homebox, so restore from a backup afterwards.

## Hosting

GitHub Pages serves this repository as-is (Settings → Pages → Deploy from branch → `main` / root). There's no build step: `index.html` is the whole app.
