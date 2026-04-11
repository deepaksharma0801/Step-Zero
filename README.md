# Step Zero

Step Zero is a calm-composed, ADHD-friendly focus app for getting unstuck. You dump a messy list of tasks, keep a running list of active work, let AI turn that into smaller steps, and then move into a detailed board with next-step guidance and short sprint timers.

## Current flow

1. Drop your thoughts into the split brain dump workspace
2. Watch tasks collect in the running list on the right
3. Remove draft-only items if they were added by mistake
4. Click `Let's get working`
5. Step Zero builds a detailed task board with tiny steps
6. Use AI guidance and short sprints to keep moving

## What the app does

- Uses a split intake experience with:
  - a left-side brain dump area
  - a right-side running list of active tasks
- Keeps tasks in local storage so they stay after refresh
- Keeps active tasks in the running list until they are completed
- Breaks larger tasks into smaller steps with Gemini
- Suggests a next step based on current energy
- Shows a short coach message and a gentle insight
- Lets you run 5, 10, 15, or 25 minute focus sprints
- Tracks resets, completed steps, open loops, and sprint history

## Tech

- Plain HTML, CSS, and JavaScript frontend
- Small Node server in [server.js](/Users/snadimi3/Documents/APP%20idea/server.js)
- Gemini API on the backend
- Browser `localStorage` for task persistence
- Simple in-memory IP rate limiting for public AI routes

## Local development

1. Copy [.env.example](/Users/snadimi3/Documents/APP%20idea/.env.example) to `.env`
2. Add your Gemini key
3. Start the app

```bash
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

## Environment variables

```env
GEMINI_API_KEY=your-gemini-api-key-here
GEMINI_MODEL=gemini-2.5-flash-lite
RATE_LIMIT_MAX_REQUESTS=20
RATE_LIMIT_WINDOW_MS=60000
PORT=3000
```

## Scripts

```bash
npm start
npm run check
```

## Deploying on Render

This repo is set up to deploy as one Render web service using [render.yaml](/Users/snadimi3/Documents/APP%20idea/render.yaml).

### Render setup

1. Push the repo to GitHub
2. In Render, create a new `Blueprint`
3. Select this repo
4. Add the `GEMINI_API_KEY` secret
5. Deploy

Render will use:

- `npm install` as the build command
- `npm start` as the start command

### Render environment variables

- `GEMINI_API_KEY`
- `GEMINI_MODEL=gemini-2.5-flash-lite`
- `RATE_LIMIT_MAX_REQUESTS=20`
- `RATE_LIMIT_WINDOW_MS=60000`

## AI behavior

When Gemini is available:

- the brain dump can be turned into structured tasks and steps
- the app can suggest one next move from the current board
- coach copy and insight copy update from the live board state

When Gemini is unavailable:

- Step Zero falls back to built-in task breakdown logic
- the app still works, but responses are simpler

## Notes

- `.env` is ignored by git and should never be committed
- if you expose an API key publicly, rotate it immediately
- free Render instances can spin down after inactivity, so the first request may be slow
- the current rate limiter is intentionally lightweight and best for early public testing

## Files

- [index.html](/Users/snadimi3/Documents/APP%20idea/index.html): app structure and UI
- [styles.css](/Users/snadimi3/Documents/APP%20idea/styles.css): visual design and layout
- [script.js](/Users/snadimi3/Documents/APP%20idea/script.js): client state, persistence, and UI behavior
- [server.js](/Users/snadimi3/Documents/APP%20idea/server.js): Gemini proxy, static hosting, and rate limiting
- [render.yaml](/Users/snadimi3/Documents/APP%20idea/render.yaml): Render deployment blueprint
