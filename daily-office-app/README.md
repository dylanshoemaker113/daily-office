# Daily Office

A personal daily prayer schedule tracker — monastic-modern, minimal, and fully offline-capable.

## Features

- **Per-day schedules** — each day of the week has its own saved schedule
- **Full editing** — rename, reorder, delete, or add any item; toggle between Prayer and Event types
- **Prayer checklist** — check off prayers as you complete them (today only)
- **Streak tracking** — consecutive days with all prayers completed
- **Persistent storage** — everything saved to localStorage, no account needed

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm (comes with Node.js)

### Local development

```bash
# 1. Clone your repo
git clone https://github.com/<your-username>/daily-office.git
cd daily-office

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Deploying to GitHub Pages

This repo includes a GitHub Actions workflow that automatically builds and deploys to GitHub Pages on every push to `main`.

### One-time setup

1. Push this project to a GitHub repository.
2. Go to **Settings → Pages** in your repo.
3. Under **Source**, select **GitHub Actions**.
4. That's it. Push to `main` and your app will be live at:

```
https://<your-username>.github.io/<repo-name>/
```

### Base URL note

`vite.config.js` uses `base: "./"` which works for most GitHub Pages setups. If your app is served at a sub-path and assets aren't loading, update `vite.config.js`:

```js
export default defineConfig({
  plugins: [react()],
  base: "/your-repo-name/",  // ← set your exact repo name here
});
```

---

## Project structure

```
daily-office/
├── .github/
│   └── workflows/
│       └── deploy.yml        # Auto-deploy to GitHub Pages
├── src/
│   ├── main.jsx              # React entry point
│   ├── App.jsx               # Main component + all logic
│   └── App.css               # All styles (monastic-modern palette)
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

---

## Customising the default schedule

Edit the `DEFAULT_ITEMS` array near the top of `src/App.jsx`. Each item has:

| Field   | Type                   | Description                                   |
|---------|------------------------|-----------------------------------------------|
| `id`    | string                 | Unique identifier (any string)                |
| `label` | string                 | Display name                                  |
| `type`  | `"prayer"` / `"event"` | Prayers get checkboxes; events are markers    |
| `start` | `"HH:MM"` (24h)        | Start time                                    |
| `end`   | `"HH:MM"` or `null`    | End time (optional)                           |

Per-day edits made in the UI override the default and are saved to `localStorage` automatically.

---

*Ora et labora*
