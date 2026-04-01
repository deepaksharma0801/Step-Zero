const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const ENV_PATH = path.join(ROOT, ".env");

loadDotEnv(ENV_PATH);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";

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
        aiAvailable: Boolean(OPENAI_API_KEY),
        model: OPENAI_MODEL,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/plan") {
      await handlePlan(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/guidance") {
      await handleGuidance(req, res);
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
  if (!OPENAI_API_KEY) {
    console.log("AI is offline: set OPENAI_API_KEY in .env to enable server-side guidance.");
  }
});

async function handlePlan(req, res) {
  if (!OPENAI_API_KEY) {
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
  if (!OPENAI_API_KEY) {
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

async function requestAIJson({ schemaName, schema, userPrompt }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You are a structured JSON planner for Step Zero. Follow the schema exactly and do not add extra keys.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: userPrompt,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema,
        },
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI request failed.");
  }

  const refusal = extractResponseRefusal(data);
  if (refusal) {
    throw new Error(refusal);
  }

  const text = extractResponseText(data);
  if (!text) {
    throw new Error("OpenAI returned an empty response.");
  }

  return JSON.parse(text);
}

function extractResponseText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }

  const outputs = Array.isArray(data.output) ? data.output : [];
  const parts = [];

  outputs.forEach((item) => {
    const content = Array.isArray(item.content) ? item.content : [];
    content.forEach((entry) => {
      if (typeof entry.text === "string") {
        parts.push(entry.text);
      } else if (typeof entry.value === "string") {
        parts.push(entry.value);
      }
    });
  });

  return parts.join("").trim();
}

function extractResponseRefusal(data) {
  const outputs = Array.isArray(data.output) ? data.output : [];
  const refusals = [];

  outputs.forEach((item) => {
    const content = Array.isArray(item.content) ? item.content : [];
    content.forEach((entry) => {
      if (typeof entry.refusal === "string" && entry.refusal.trim()) {
        refusals.push(entry.refusal.trim());
      }
    });
  });

  return refusals.join(" ").trim();
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
