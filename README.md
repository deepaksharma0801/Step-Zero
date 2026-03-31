# Step Zero

Step Zero is a lightweight MVP for a focus sprint app designed around ADHD and overwhelm. It helps someone dump messy tasks, turn them into tiny next steps, choose one low-friction action, and run short focus sprints without shame-heavy productivity language.

## What it does

- Turns a brain dump into task cards with tiny steps
- Suggests a next step based on your current energy
- Lets you focus a specific step and run 5, 10, 15, or 25 minute sprints
- Tracks completed steps, completed sprints, and return count in local storage

## Run it

Because this version has no build step, you can open [`index.html`](/Users/snadimi3/Documents/APP%20idea/index.html) directly in a browser.

If you want to serve it locally instead:

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## Notes

- Data is stored locally in the browser with `localStorage`
- The task breakdown logic is heuristic right now, so it works as a smart MVP rather than a full AI planner
- A natural next step would be upgrading the breakdown engine to call a real API and adding authentication plus synced storage
