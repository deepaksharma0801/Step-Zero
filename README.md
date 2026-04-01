# Step Zero STILL UNDER CONSTRUCTION STAY TUNED

Step Zero is a lightweight MVP for a focus sprint app designed around ADHD and overwhelm. It helps someone dump messy tasks, turn them into tiny next steps, choose one low-friction action, and run short focus sprints without shame-heavy productivity language.

## What it does

- Turns a brain dump into AI-generated task cards with tiny steps
- Uses AI to suggest the next best step based on your current energy
- Gives short coach messages and gentle insights about your task board
- Lets you focus a specific step and run 5, 10, 15, or 25 minute sprints
- Tracks completed steps, completed sprints, and return count in local storage

## Run it

This version should be run through the local app server so AI can stay on the backend.

1. Copy [.env.example](/Users/snadimi3/Documents/APP%20idea/.env.example) to `.env`
2. Create a Gemini API key in Google AI Studio and put it in `.env`
3. Start the server:

```bash
node server.js
```

Then open [http://localhost:3000](http://localhost:3000).

## Deploy it

The simplest production setup is one Render web service that serves both the site and the AI API.

1. Push this repo to GitHub
2. Create a new Render Web Service from the repo
3. Use:
   - Build command: `npm install`
   - Start command: `npm start`
4. Add environment variables in Render:
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL=gemini-2.5-flash-lite`
   - `RATE_LIMIT_MAX_REQUESTS=20`
   - `RATE_LIMIT_WINDOW_MS=60000`
5. Deploy and connect your custom domain

You can also use the included [render.yaml](/Users/snadimi3/Documents/APP%20idea/render.yaml) blueprint.

## How AI works

After the server is configured:

- `Turn this into tiny steps` uses AI to break down the brain dump
- `Refresh guidance` asks AI for the next step, a coach message, and an insight
- The user does not need to enter an API key or model in the app UI

## Notes

- Data is stored locally in the browser with `localStorage`
- Gemini requests are proxied through [server.js](/Users/snadimi3/Documents/APP%20idea/server.js), so the key stays on the server
- The default server model is `gemini-2.5-flash-lite`, configurable through `.env`
- Gemini free tier keys come from Google AI Studio: [ai.google.dev/gemini-api/docs/api-key](https://ai.google.dev/gemini-api/docs/api-key)
- Public AI routes use a small in-memory IP rate limit by default so one visitor cannot instantly burn the whole quota
- If AI is unavailable, the app falls back to its built-in local planning logic
