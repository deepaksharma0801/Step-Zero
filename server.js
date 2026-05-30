const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const ENV_PATH = path.join(ROOT, ".env");

loadDotEnv(ENV_PATH);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 20);
const rateLimitStore = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) {
      sendJson(res, 400, { error: "Invalid request." });
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        aiAvailable: Boolean(GEMINI_API_KEY),
        model: GEMINI_MODEL,
        provider: "gemini",
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/plan") {
      if (!enforceRateLimit(req, res)) {
        return;
      }
      await handlePlan(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/guidance") {
      if (!enforceRateLimit(req, res)) {
        return;
      }
      await handleGuidance(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/chat") {
      if (!enforceRateLimit(req, res)) {
        return;
      }
      await handleChat(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/agent/run") {
      if (!enforceRateLimit(req, res)) {
        return;
      }
      await handleAgentRun(req, res);
      return;
    }

    if (req.method === "GET") {
      serveStatic(url.pathname, res);
      return;
    }

    sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Server error." });
  }
});

server.listen(PORT, () => {
  console.log(`Step Zero running at http://localhost:${PORT}`);
  if (!GEMINI_API_KEY) {
    console.log("AI is offline: set GEMINI_API_KEY in .env to enable Gemini guidance.");
  }
});

async function handlePlan(req, res) {
  if (!GEMINI_API_KEY) {
    sendJson(res, 503, { error: "AI is not configured on the server." });
    return;
  }

  const body = await readJsonBody(req);
  const brainDump = String(body.brainDump || "").trim();
  const energy = normalizeEnergy(body.energy);

  if (!brainDump) {
    sendJson(res, 400, { error: "Missing brain dump." });
    return;
  }

  const prompt = [
    "You are Step Zero, a calm ADHD-friendly planning coach.",
    "Turn the user's messy brain dump into a small set of actionable tasks.",
    "Keep the tone supportive and concrete.",
    "Create at most 7 tasks and 3 or 4 steps per task.",
    "Keep each step short, visible, and realistic.",
    "Use effort values low, medium, or high.",
    "Use whole-number minutes between 1 and 30.",
    "Return JSON that matches the schema exactly.",
    "",
    `Energy level: ${energy}`,
    "Brain dump:",
    brainDump,
  ].join("\n");

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      coachMessage: { type: "string" },
      insight: { type: "string" },
      tasks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            category: { type: "string" },
            steps: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: { type: "string" },
                  effort: { type: "string", enum: ["low", "medium", "high"] },
                  minutes: { type: "integer", minimum: 1, maximum: 30 },
                },
                required: ["title", "effort", "minutes"],
              },
            },
          },
          required: ["title", "category", "steps"],
        },
      },
    },
    required: ["coachMessage", "insight", "tasks"],
  };

  const data = await requestAIJson({
    schemaName: "step_zero_plan",
    schema,
    userPrompt: prompt,
  });

  sendJson(res, 200, data);
}

async function handleGuidance(req, res) {
  if (!GEMINI_API_KEY) {
    sendJson(res, 503, { error: "AI is not configured on the server." });
    return;
  }

  const body = await readJsonBody(req);
  const energy = normalizeEnergy(body.energy);
  const tasks = Array.isArray(body.tasks) ? body.tasks : [];
  const history = Array.isArray(body.history) ? body.history : [];
  const focus = body.focus || {};
  const reason = String(body.reason || "manual_refresh");

  if (!tasks.length) {
    sendJson(res, 400, { error: "No tasks available for guidance." });
    return;
  }

  const prompt = [
    "You are Step Zero, a calm ADHD-friendly focus coach.",
    "Choose exactly one next step from the provided task list.",
    "Pick the smallest useful step for the user's current energy.",
    "Return JSON only and use existing taskId and stepId values exactly as provided.",
    "The coachMessage should be 1 or 2 sentences and supportive without sounding cheesy.",
    "The insight should be one short pattern or observation based on the current board.",
    "The reason should explain why this step is the right next move right now.",
    "",
    `Reason for refresh: ${reason}`,
    `Energy level: ${energy}`,
    `Currently focused taskId: ${focus.taskId || "none"}`,
    `Currently focused stepId: ${focus.stepId || "none"}`,
    "Recent history:",
    JSON.stringify(history.slice(0, 6).map((item) => ({
      type: item.type,
      summary: item.summary,
      timestamp: item.timestamp,
    }))),
    "Open tasks:",
    JSON.stringify(tasks),
  ].join("\n");

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      taskId: { type: "string" },
      stepId: { type: "string" },
      reason: { type: "string" },
      coachMessage: { type: "string" },
      insight: { type: "string" },
    },
    required: ["taskId", "stepId", "reason", "coachMessage", "insight"],
  };

  const data = await requestAIJson({
    schemaName: "step_zero_guidance",
    schema,
    userPrompt: prompt,
  });

  sendJson(res, 200, data);
}

async function handleChat(req, res) {
  if (!GEMINI_API_KEY) {
    sendJson(res, 503, { error: "AI is not configured on the server." });
    return;
  }

  const body = await readJsonBody(req);
  const energy = normalizeEnergy(body.energy);
  const tasks = Array.isArray(body.tasks) ? body.tasks : [];
  const history = Array.isArray(body.history) ? body.history : [];
  const focus = body.focus || {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const latestUserMessage = [...messages].reverse().find((message) => message?.role === "user");

  if (!latestUserMessage?.content) {
    sendJson(res, 400, { error: "Missing chat message." });
    return;
  }

  const conversation = messages
    .slice(-8)
    .map((message) => `${message.role === "user" ? "User" : "Coach"}: ${String(message.content || "")}`)
    .join("\n");

  const prompt = [
    "You are Step Zero, a calm ADHD-friendly coach inside a productivity app.",
    "Reply like a thoughtful human coach, not a support bot.",
    "Keep the answer supportive, concrete, and concise.",
    "Use short paragraphs or a very short list only when helpful.",
    "Do not be cheesy. Do not over-celebrate. Do not sound clinical.",
    "When helpful, reference the current board and suggest a tiny next action.",
    "",
    `Energy level: ${energy}`,
    `Currently focused taskId: ${focus.taskId || "none"}`,
    `Currently focused stepId: ${focus.stepId || "none"}`,
    "Open tasks:",
    JSON.stringify(tasks),
    "Recent activity:",
    JSON.stringify(history.slice(0, 8).map((item) => ({
      type: item.type,
      summary: item.summary,
      timestamp: item.timestamp,
    }))),
    "Conversation so far:",
    conversation || "No previous chat yet.",
    "Latest user message:",
    String(latestUserMessage.content),
  ].join("\n");

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      reply: { type: "string" },
    },
    required: ["reply"],
  };

  const data = await requestAIJson({
    schemaName: "step_zero_chat",
    schema,
    userPrompt: prompt,
  });

  sendJson(res, 200, data);
}

async function handleAgentRun(req, res) {
  if (!GEMINI_API_KEY) {
    sendJson(res, 503, { error: "AI is not configured on the server." });
    return;
  }

  const body = await readJsonBody(req);
  const goal = String(body.goal || "").trim();
  const energy = normalizeEnergy(body.energy);
  const openTasks = Array.isArray(body.openTasks) ? body.openTasks : [];
  const completedTasks = Array.isArray(body.completedTasks) ? body.completedTasks : [];
  const history = Array.isArray(body.history) ? body.history : [];
  const chatMessages = Array.isArray(body.chatMessages) ? body.chatMessages : [];
  const focus = body.focus || {};
  const contextSummary = String(body.contextSummary || "");

  if (!goal) {
    sendJson(res, 400, { error: "Missing agent goal." });
    return;
  }

  const conversation = chatMessages
    .slice(-6)
    .map((message) => `${message.role === "user" ? "User" : "Coach"}: ${String(message.content || "")}`)
    .join("\n");

  const prompt = [
    "You are Step Zero's action agent inside a productivity app.",
    "Your job is to propose a small batched bundle of board actions, not to take actions yourself.",
    "Only use the allowed action types.",
    "Prefer 2 to 4 actions per bundle.",
    "Every action should be concrete, helpful, and safe to apply in the app.",
    "Use update_task only for rewriting a task title, category, or open step wording.",
    "Do not use update_task to mark steps complete or to simulate progress that the user has not approved.",
    "Do not reference tools outside the app.",
    "Do not suggest actions that require email, calendar, browser, or external systems.",
    "When task ids or step ids are needed, reuse the exact ids from the provided board context.",
    "If the board is nearly empty, create or shape tasks from what is already available.",
    "Keep the summary and coachMessage concise and supportive.",
    "",
    `Goal: ${goal}`,
    `Energy level: ${energy}`,
    `Currently focused taskId: ${focus.taskId || "none"}`,
    `Currently focused stepId: ${focus.stepId || "none"}`,
    `Board summary: ${contextSummary || "No summary provided."}`,
    "Open tasks:",
    JSON.stringify(openTasks),
    "Completed tasks:",
    JSON.stringify(completedTasks),
    "Recent board history:",
    JSON.stringify(history.slice(0, 8).map((item) => ({
      type: item.type,
      summary: item.summary,
      timestamp: item.timestamp,
    }))),
    "Recent coach chat:",
    conversation || "No recent chat.",
    "",
    "Allowed action types:",
    "split_task, create_task, update_task, delete_task, reprioritize_tasks, set_focus, suggest_sprint, restore_task",
  ].join("\n");

  const actionSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      id: { type: "string" },
      type: {
        type: "string",
        enum: [
          "split_task",
          "create_task",
          "update_task",
          "delete_task",
          "reprioritize_tasks",
          "set_focus",
          "suggest_sprint",
          "restore_task",
        ],
      },
      title: { type: "string" },
      rationale: { type: "string" },
      targetTaskId: { type: "string" },
      targetStepId: { type: "string" },
      targetCompletedTaskId: { type: "string" },
      splitMode: { type: "string", enum: ["replace", "append"] },
      duration: { type: "integer", minimum: 1, maximum: 30 },
      order: {
        type: "array",
        items: { type: "string" },
      },
      affectedTaskTitles: {
        type: "array",
        items: { type: "string" },
      },
      task: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          category: { type: "string" },
          steps: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                effort: { type: "string", enum: ["low", "medium", "high"] },
                minutes: { type: "integer", minimum: 1, maximum: 30 },
              },
              required: ["title", "effort", "minutes"],
            },
          },
        },
        required: ["title", "category", "steps"],
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            effort: { type: "string", enum: ["low", "medium", "high"] },
            minutes: { type: "integer", minimum: 1, maximum: 30 },
          },
          required: ["title", "effort", "minutes"],
        },
      },
    },
    required: ["id", "type", "title", "rationale"],
  };

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      runId: { type: "string" },
      goal: { type: "string" },
      summary: { type: "string" },
      coachMessage: { type: "string" },
      contextSummary: { type: "string" },
      actions: {
        type: "array",
        minItems: 1,
        maxItems: 5,
        items: actionSchema,
      },
    },
    required: ["runId", "goal", "summary", "coachMessage", "actions"],
  };

  const data = await requestAIJson({
    schemaName: "step_zero_agent_run",
    schema,
    userPrompt: prompt,
  });

  sendJson(res, 200, data);
}

function serveStatic(requestPath, res) {
  const normalized = requestPath === "/" ? "/index.html" : requestPath;
  const safePath = path.normalize(normalized).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: "Forbidden." });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: "Not found." });
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(content);
  });
}

function enforceRateLimit(req, res) {
  const now = Date.now();
  const ip = getClientIp(req);
  const entry = rateLimitStore.get(ip);

  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    pruneRateLimitStore(now);
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000)
    );
    res.writeHead(429, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": String(retryAfterSeconds),
    });
    res.end(
      JSON.stringify({
        error: "Too many AI requests right now. Please pause for a minute and try again.",
      })
    );
    return false;
  }

  entry.count += 1;
  return true;
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return req.socket.remoteAddress || "unknown";
}

function pruneRateLimitStore(now) {
  rateLimitStore.forEach((value, key) => {
    if (now - value.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.delete(key);
    }
  });
}

async function requestAIJson({ schemaName, schema, userPrompt }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      GEMINI_MODEL
    )}:generateContent`,
    {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [
          {
            text: `You are a structured JSON planner for Step Zero. Follow the ${schemaName} schema exactly and do not add extra keys.`,
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: userPrompt,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
    }),
  }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "Gemini request failed.");
  }

  const promptBlock = data.promptFeedback?.blockReason;
  if (promptBlock) {
    throw new Error(`Gemini blocked the request: ${promptBlock}.`);
  }

  const candidate = Array.isArray(data.candidates) ? data.candidates[0] : null;
  const candidateBlock = candidate?.finishReason;
  if (candidateBlock && candidateBlock !== "STOP") {
    const detail = candidate?.finishMessage ? ` ${candidate.finishMessage}` : "";
    throw new Error(`Gemini stopped early: ${candidateBlock}.${detail}`.trim());
  }

  const text = extractGeminiText(data);
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return parseGeminiJson(text);
}

function extractGeminiText(data) {
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const parts = [];

  candidates.forEach((candidate) => {
    const content = candidate?.content;
    const entries = Array.isArray(content?.parts) ? content.parts : [];
    entries.forEach((entry) => {
      if (typeof entry?.text === "string" && entry.text.trim()) {
        parts.push(entry.text.trim());
      }
    });
  });

  return parts.join("").trim();
}

function parseGeminiJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const fenced = text.match(/```json\s*([\s\S]+?)```/i) || text.match(/```\s*([\s\S]+?)```/);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim());
    }
    throw new Error("Gemini returned invalid JSON.");
  }
}

function normalizeEnergy(value) {
  return ["low", "medium", "high"].includes(value) ? value : "low";
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });

    req.on("error", reject);
  });
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const source = fs.readFileSync(filePath, "utf8");
  source.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      return;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}
