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
2. Put your OpenAI key in `.env`
3. Start the server:

```bash
node server.js
```

Then open [http://localhost:3000](http://localhost:3000).

## How AI works

After the server is configured:

- `Turn this into tiny steps` uses AI to break down the brain dump
- `Refresh guidance` asks AI for the next step, a coach message, and an insight
- The user does not need to enter an API key or model in the app UI

## Notes

- Data is stored locally in the browser with `localStorage`
- OpenAI requests are proxied through [server.js](/Users/snadimi3/Documents/APP%20idea/server.js), so the key stays on the server
- The default server model is `gpt-5-mini`, configurable through `.env`
- If AI is unavailable, the app falls back to its built-in local planning logic
