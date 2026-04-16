const STORAGE_KEY = "step-zero-state-v3";
const DEFAULT_DURATION = 10;
const DEMO_TEXT = `finish pitch deck
email Sarah about launch copy
laundry
call doctor for appointment
make pasta
pay internet bill`;

const state = {
  tasks: [],
  history: [],
  draftText: "",
  preferences: {
    energy: "low",
  },
  focus: {
    taskId: null,
    stepId: null,
  },
  timer: {
    selectedDuration: DEFAULT_DURATION,
    remainingSeconds: DEFAULT_DURATION * 60,
    intervalId: null,
    isRunning: false,
  },
  ai: {
    available: false,
    model: null,
    statusText: "Step Zero is checking whether the AI guide is ready.",
    coachMessage: "The AI coach will guide your next move here when it is ready.",
    insight: "Your patterns and gentle nudges will show up here.",
    guidanceReason: "",
    isLoading: false,
    mode: "fallback",
  },
};

const elements = {
  brainDump: document.querySelector("#brain-dump"),
  draftPreview: document.querySelector("#draft-preview"),
  draftCount: document.querySelector("#draft-count"),
  generatePlan: document.querySelector("#generate-plan"),
  loadDemo: document.querySelector("#load-demo"),
  clearAll: document.querySelector("#clear-all"),
  taskList: document.querySelector("#task-list"),
  suggestionCard: document.querySelector("#suggestion-card"),
  pickNextStep: document.querySelector("#pick-next-step"),
  energyOptions: document.querySelectorAll(".energy-option"),
  durationOptions: document.querySelectorAll(".duration-option"),
  timerDisplay: document.querySelector("#timer-display"),
  timerStatus: document.querySelector("#timer-status"),
  timerTarget: document.querySelector("#timer-target"),
  startTimer: document.querySelector("#start-timer"),
  pauseTimer: document.querySelector("#pause-timer"),
  resetTimer: document.querySelector("#reset-timer"),
  sprintComplete: document.querySelector("#sprint-complete"),
  continueSprint: document.querySelector("#continue-sprint"),
  takeBreak: document.querySelector("#take-break"),
  switchTask: document.querySelector("#switch-task"),
  doneForNow: document.querySelector("#done-for-now"),
  completeCopy: document.querySelector("#complete-copy"),
  todaySteps: document.querySelector("#today-steps"),
  todaySprints: document.querySelector("#today-sprints"),
  momentumNote: document.querySelector("#momentum-note"),
  returnCount: document.querySelector("#return-count"),
  openLoops: document.querySelector("#open-loops"),
  historyLog: document.querySelector("#history-log"),
  taskTemplate: document.querySelector("#task-card-template"),
  aiStatusCopy: document.querySelector("#ai-status-copy"),
  coachMessage: document.querySelector("#coach-message"),
  coachInsight: document.querySelector("#coach-insight"),
  taskBoard: document.querySelector("#task-board"),
};

function init() {
  hydrateState();
  bindEvents();
  render();
  void checkAIAvailability();
}

function hydrateState() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.tasks)) {
        state.tasks = parsed.tasks;
      }
      if (Array.isArray(parsed.history)) {
        state.history = parsed.history;
      }
      if (typeof parsed.draftText === "string") {
        state.draftText = parsed.draftText;
      }
      if (parsed.preferences?.energy) {
        state.preferences.energy = parsed.preferences.energy;
      }
      if (parsed.focus) {
        state.focus = {
          taskId: parsed.focus.taskId ?? null,
          stepId: parsed.focus.stepId ?? null,
        };
      }
      if (parsed.ai) {
        state.ai = {
          ...state.ai,
          coachMessage: parsed.ai.coachMessage || state.ai.coachMessage,
          insight: parsed.ai.insight || state.ai.insight,
          guidanceReason: parsed.ai.guidanceReason || "",
        };
      }
    } catch (error) {
      console.warn("Could not restore Step Zero state.", error);
    }
  }

  elements.brainDump.value = state.draftText;
  updateTimerDisplay();
  syncEnergySelections();
  syncTimerSelections();
}

function bindEvents() {
  elements.generatePlan.addEventListener("click", () => {
    void handleGeneratePlan({ scrollToBoard: true });
  });
  elements.loadDemo.addEventListener("click", () => {
    setBrainDumpValue(DEMO_TEXT);
  });
  elements.clearAll.addEventListener("click", handleClearAll);
  elements.brainDump.addEventListener("input", () => {
    state.draftText = elements.brainDump.value;
    renderDraftPreview();
    saveState();
  });
  elements.pickNextStep.addEventListener("click", () => {
    void handlePickNextStep();
  });
  elements.startTimer.addEventListener("click", handleStartTimer);
  elements.pauseTimer.addEventListener("click", handlePauseTimer);
  elements.resetTimer.addEventListener("click", handleResetTimer);
  elements.continueSprint.addEventListener("click", handleContinueSprint);
  elements.takeBreak.addEventListener("click", handleTakeBreak);
  elements.switchTask.addEventListener("click", () => {
    void handleSwitchTask();
  });
  elements.doneForNow.addEventListener("click", handleDoneForNow);

  elements.energyOptions.forEach((button) => {
    button.addEventListener("click", () => {
      state.preferences.energy = button.dataset.energy;
      syncEnergySelections();

      if (canUseAI()) {
        state.ai.statusText = `AI guide ready on ${state.ai.model}. Refresh guidance whenever you want a new read.`;
      }

      saveState();
      render();
    });
  });

  elements.durationOptions.forEach((button) => {
    button.addEventListener("click", () => {
      state.timer.selectedDuration = Number(button.dataset.duration);
      state.timer.remainingSeconds = state.timer.selectedDuration * 60;
      syncTimerSelections();
      updateTimerDisplay();
      renderTimerTarget();
    });
  });
}

async function checkAIAvailability() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();

    state.ai.available = Boolean(data.aiAvailable);
    state.ai.model = data.model || null;
    state.ai.mode = state.ai.available ? "live" : "fallback";
    state.ai.statusText = state.ai.available
      ? `AI guide ready on ${state.ai.model}. Users can start immediately.`
      : "AI guide is offline right now. Step Zero is using built-in support.";

    if (state.ai.available && state.ai.coachMessage.startsWith("The AI coach will")) {
      state.ai.coachMessage = "AI is ready. Drop in a messy list and Step Zero will help turn it into motion.";
      state.ai.insight = "When the AI guide is online, you can skip setup and go straight into the work.";
    }
  } catch (error) {
    state.ai.available = false;
    state.ai.model = null;
    state.ai.mode = "fallback";
    state.ai.statusText = "The app server is not connected, so AI guidance is unavailable right now.";
  }

  saveState();
  render();
}

async function handleGeneratePlan(options = {}) {
  if (state.ai.isLoading) {
    return;
  }

  const rawText = elements.brainDump.value.trim();
  if (!rawText) {
    elements.brainDump.focus();
    return;
  }

  let nextTasks;
  let usedAI = false;

  if (canUseAI()) {
    try {
      setAiLoading("AI is turning that swirl into calmer next steps...");
      const plan = await fetchJSON("/api/plan", {
        brainDump: rawText,
        energy: state.preferences.energy,
      });
      nextTasks = plan.tasks.map(createTaskFromAiTask);
      usedAI = true;
      state.ai.coachMessage =
        plan.coachMessage || "Your plan is ready. Start with the lightest visible move.";
      state.ai.insight =
        plan.insight || "The fastest way forward is usually a smaller first step, not a bigger push.";
      state.ai.guidanceReason = "";
      state.ai.statusText = `AI guide ready on ${state.ai.model}.`;
      state.ai.isLoading = false;
      state.ai.mode = "live";
    } catch (error) {
      console.error(error);
      setAiFallback("AI hit a snag while planning, so Step Zero used its built-in breakdown instead.");
    }
  }

  if (!usedAI) {
    nextTasks = splitEntries(rawText).map(createTaskFromEntry);
  }

  state.tasks = mergeTasks(nextTasks, state.tasks);
  setBrainDumpValue("");
  ensureFocusedStep();

  recordHistory(
    "reset",
    usedAI ? "Built an AI-guided Step Zero plan." : "Built a fresh Step Zero plan."
  );
  saveState();
  render();

  if (options.scrollToBoard) {
    elements.taskBoard?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function handleClearAll() {
  stopTimer();
  state.tasks = [];
  state.history = [];
  setBrainDumpValue("");
  state.focus = { taskId: null, stepId: null };
  state.timer.selectedDuration = DEFAULT_DURATION;
  state.timer.remainingSeconds = DEFAULT_DURATION * 60;
  state.ai.guidanceReason = "";
  state.ai.coachMessage = canUseAI()
    ? "AI is ready when you want a fresh plan."
    : "Step Zero is still helpful without AI, and it will keep things moving.";
  state.ai.insight = canUseAI()
    ? "A clean slate still counts as progress when you are restarting on purpose."
    : "Even without AI, the smallest visible next move is usually the right restart.";
  syncTimerSelections();
  saveState();
  render();
}

async function handlePickNextStep() {
  if (state.ai.isLoading) {
    return;
  }

  if (!state.tasks.length) {
    renderSuggestion();
    return;
  }

  if (canUseAI()) {
    await refreshAIGuidance("manual_refresh");
    return;
  }

  applyFallbackSuggestion();
}

async function handleSwitchTask() {
  elements.sprintComplete.classList.add("hidden");
  await handlePickNextStep();
  renderTimerTarget();
}

function handleStartTimer() {
  if (!getFocusedStep()) {
    if (canUseAI()) {
      void refreshAIGuidance("timer_start");
    } else {
      applyFallbackSuggestion();
    }
  }

  if (state.timer.isRunning) {
    return;
  }

  elements.sprintComplete.classList.add("hidden");
  state.timer.isRunning = true;
  renderTimerStatus();

  state.timer.intervalId = window.setInterval(() => {
    state.timer.remainingSeconds -= 1;
    updateTimerDisplay();

    if (state.timer.remainingSeconds <= 0) {
      completeSprint();
    }
  }, 1000);
}

function handlePauseTimer() {
  if (!state.timer.isRunning) {
    return;
  }

  stopTimer();
  renderTimerStatus("Paused. Catch your breath.");
}

function handleResetTimer() {
  stopTimer();
  state.timer.remainingSeconds = state.timer.selectedDuration * 60;
  elements.sprintComplete.classList.add("hidden");
  updateTimerDisplay();
  renderTimerStatus("Ready when you are.");
}

function handleContinueSprint() {
  state.timer.remainingSeconds = state.timer.selectedDuration * 60;
  elements.sprintComplete.classList.add("hidden");
  handleStartTimer();
}

function handleTakeBreak() {
  stopTimer();
  state.timer.selectedDuration = 5;
  state.timer.remainingSeconds = 5 * 60;
  syncTimerSelections();
  updateTimerDisplay();
  elements.sprintComplete.classList.add("hidden");
  renderTimerStatus("Break mode. Five easy minutes.");
}

function handleDoneForNow() {
  stopTimer();
  elements.sprintComplete.classList.add("hidden");
  state.timer.remainingSeconds = state.timer.selectedDuration * 60;
  updateTimerDisplay();
  renderTimerStatus("You can come back later. Counts still count.");
}

async function refreshAIGuidance(reason) {
  if (state.ai.isLoading) {
    return;
  }

  if (!canUseAI() || !state.tasks.length) {
    applyFallbackSuggestion();
    return;
  }

  try {
    setAiLoading("AI is reading your board and picking the kindest next move...");
    const guidance = await fetchJSON("/api/guidance", {
      reason,
      energy: state.preferences.energy,
      focus: state.focus,
      history: state.history.slice(0, 6),
      tasks: state.tasks
        .filter((task) => !isTaskDone(task))
        .map((task) => ({
          id: task.id,
          title: task.title,
          category: task.category,
          steps: task.steps
            .filter((step) => !step.done)
            .map((step) => ({
              id: step.id,
              title: step.title,
              effort: step.effort,
              minutes: step.minutes,
            })),
        })),
    });
    applyAiGuidance(guidance);
    saveState();
    render();
  } catch (error) {
    console.error(error);
    setAiFallback("AI guidance was unavailable, so Step Zero switched back to built-in support.");
    applyFallbackSuggestion();
  }
}

function applyFallbackSuggestion() {
  const suggestion = getSuggestedStep();
  if (!suggestion) {
    renderSuggestion();
    return;
  }

  state.focus.taskId = suggestion.task.id;
  state.focus.stepId = suggestion.step.id;
  state.ai.guidanceReason = buildSuggestionReason(suggestion.step);
  state.ai.coachMessage = buildFallbackCoachMessage(suggestion);
  state.ai.insight = buildFallbackInsight();
  state.ai.statusText = canUseAI()
    ? `AI guide ready on ${state.ai.model}.`
    : "AI guide is offline right now. Step Zero is using built-in support.";

  recordHistory("reset", `Chose a fresh starting point: ${suggestion.step.title}.`);
  saveState();
  render();
}

function applyAiGuidance(guidance) {
  const task = state.tasks.find((entry) => entry.id === guidance.taskId);
  const step = task?.steps.find((entry) => entry.id === guidance.stepId && !entry.done);

  if (!task || !step) {
    applyFallbackSuggestion();
    return;
  }

  state.focus.taskId = task.id;
  state.focus.stepId = step.id;
  state.ai.guidanceReason = guidance.reason;
  state.ai.coachMessage = guidance.coachMessage;
  state.ai.insight = guidance.insight;
  state.ai.statusText = `AI guide ready on ${state.ai.model}.`;
  state.ai.mode = "live";
  state.ai.isLoading = false;

  recordHistory("reset", `AI suggested: ${step.title}.`, task.title);
}

function createTaskFromEntry(entry) {
  const normalized = tidySentence(entry);
  const breakdown = buildFallbackBreakdown(normalized);

  return {
    id: crypto.randomUUID(),
    title: normalized,
    category: breakdown.category,
    createdAt: new Date().toISOString(),
    steps: breakdown.steps.map((step) => ({
      ...step,
      id: crypto.randomUUID(),
      done: false,
      completedAt: null,
    })),
  };
}

function createTaskFromAiTask(task) {
  const normalizedTitle = tidySentence(task.title || "Untitled task");
  const fallback = buildFallbackBreakdown(normalizedTitle);
  const aiSteps = Array.isArray(task.steps) && task.steps.length ? task.steps : fallback.steps;

  return {
    id: crypto.randomUUID(),
    title: normalizedTitle,
    category: tidySentence(task.category || "General"),
    createdAt: new Date().toISOString(),
    steps: aiSteps.slice(0, 4).map((step) => ({
      id: crypto.randomUUID(),
      title: tidySentence(step.title || "Start with the smallest visible move"),
      effort: normalizeEffort(step.effort),
      minutes: normalizeMinutes(step.minutes),
      done: false,
      completedAt: null,
    })),
  };
}

function splitEntries(rawText) {
  return rawText
    .split(/\n|,|;/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildFallbackBreakdown(title) {
  const lower = title.toLowerCase();

  if (matches(lower, ["email", "reply", "message"])) {
    return {
      category: "Communication",
      steps: [
        makeStep("Open the thread or start the draft.", "low", 2),
        makeStep("Write three rough bullet points.", "low", 4),
        makeStep("Turn the bullets into a short sendable reply.", "medium", 5),
      ],
    };
  }

  if (matches(lower, ["call", "appointment", "doctor", "dentist"])) {
    return {
      category: "Admin",
      steps: [
        makeStep("Open contacts or the office website.", "low", 2),
        makeStep("Find the number and copy it into the dialer.", "low", 2),
        makeStep("Make the call and ask for the first available slot.", "high", 5),
      ],
    };
  }

  if (matches(lower, ["deck", "slides", "presentation", "pitch"])) {
    return {
      category: "Creative Work",
      steps: [
        makeStep("Open the file and rename today's version.", "low", 2),
        makeStep("Write the headline or title slide first.", "medium", 5),
        makeStep("Draft three bullets for the next most important slide.", "medium", 8),
      ],
    };
  }

  if (matches(lower, ["laundry", "wash clothes"])) {
    return {
      category: "Home",
      steps: [
        makeStep("Collect the clothes into one visible pile.", "low", 3),
        makeStep("Start one load only.", "low", 5),
        makeStep("Set a reminder for the switch.", "low", 1),
      ],
    };
  }

  if (matches(lower, ["bill", "invoice", "pay", "payment"])) {
    return {
      category: "Money",
      steps: [
        makeStep("Open the account or bill email.", "low", 2),
        makeStep("Check the amount and due date.", "low", 2),
        makeStep("Pay it or schedule the payment.", "medium", 4),
      ],
    };
  }

  if (matches(lower, ["study", "read", "chapter", "notes"])) {
    return {
      category: "Study",
      steps: [
        makeStep("Open the material and set a 10-minute target.", "low", 2),
        makeStep("Read until one section ends.", "medium", 10),
        makeStep("Write two quick notes so future-you can restart fast.", "low", 4),
      ],
    };
  }

  if (matches(lower, ["clean", "organize", "tidy"])) {
    return {
      category: "Space",
      steps: [
        makeStep("Choose one surface only.", "low", 1),
        makeStep("Throw away obvious trash first.", "low", 3),
        makeStep("Put five things back where they belong.", "low", 4),
      ],
    };
  }

  if (matches(lower, ["write", "draft", "report", "essay"])) {
    return {
      category: "Writing",
      steps: [
        makeStep("Open a blank doc and write a messy heading.", "low", 2),
        makeStep("List three points you probably want to say.", "medium", 5),
        makeStep("Draft the easiest paragraph first.", "medium", 8),
      ],
    };
  }

  return {
    category: "General",
    steps: [
      makeStep("Open whatever you need to start.", "low", 2),
      makeStep(`Define the tiniest visible version of "${title}".`, "medium", 4),
      makeStep("Work on it for one focused sprint.", "medium", 10),
    ],
  };
}

function makeStep(title, effort, minutes) {
  return { title, effort, minutes };
}

function matches(text, words) {
  return words.some((word) => text.includes(word));
}

function tidySentence(text) {
  const cleaned = String(text).replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "";
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function normalizeEffort(effort) {
  return ["low", "medium", "high"].includes(effort) ? effort : "medium";
}

function normalizeMinutes(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value)) {
    return 5;
  }
  return Math.min(30, Math.max(1, Math.round(value)));
}

function mergeTasks(nextTasks, existingTasks) {
  const existingTitles = new Set(existingTasks.map((task) => task.title.toLowerCase()));
  const uniqueNewTasks = nextTasks.filter(
    (task) => task.title && !existingTitles.has(task.title.toLowerCase())
  );
  return [...existingTasks, ...uniqueNewTasks];
}

function ensureFocusedStep() {
  const focusedStep = getFocusedStep();
  if (focusedStep) {
    return;
  }

  const firstOpenTask = state.tasks.find((task) => !isTaskDone(task));
  if (!firstOpenTask) {
    state.focus.taskId = null;
    state.focus.stepId = null;
    return;
  }

  const firstOpenStep = getOpenSteps(firstOpenTask)[0];
  state.focus.taskId = firstOpenTask.id;
  state.focus.stepId = firstOpenStep?.id ?? null;
}

function getOpenSteps(task) {
  return task.steps.filter((step) => !step.done);
}

function isTaskDone(task) {
  return task.steps.every((step) => step.done);
}

function getFocusedTask() {
  return state.tasks.find((task) => task.id === state.focus.taskId) ?? null;
}

function getFocusedStep() {
  const task = getFocusedTask();
  if (!task) {
    return null;
  }

  return task.steps.find((step) => step.id === state.focus.stepId && !step.done) ?? null;
}

function getSuggestedStep() {
  const openTasks = state.tasks.filter((task) => !isTaskDone(task));
  if (!openTasks.length) {
    return null;
  }

  const targetEnergyScore = {
    low: 1,
    medium: 2,
    high: 3,
  }[state.preferences.energy];

  const candidates = openTasks.flatMap((task) =>
    task.steps
      .filter((step) => !step.done)
      .map((step, index) => ({
        task,
        step,
        score: scoreStep(step, index, targetEnergyScore, task.id === state.focus.taskId),
      }))
  );

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0] ?? null;
}

function getSuggestedAlternatives() {
  const openTasks = state.tasks.filter((task) => !isTaskDone(task));
  const targetEnergyScore = {
    low: 1,
    medium: 2,
    high: 3,
  }[state.preferences.energy];

  return openTasks
    .flatMap((task) =>
      task.steps
        .filter((step) => !step.done)
        .map((step, index) => ({
          task,
          step,
          score: scoreStep(step, index, targetEnergyScore, task.id === state.focus.taskId),
        }))
    )
    .sort((a, b) => a.score - b.score);
}

function scoreStep(step, index, targetEnergyScore, isFocusedTask) {
  const effortScore = { low: 1, medium: 2, high: 3 }[step.effort];
  const energyDistance = Math.abs(effortScore - targetEnergyScore) * 3;
  const orderBias = index * 2;
  const minuteBias = Math.min(step.minutes, 12);
  const focusBias = isFocusedTask ? -1.5 : 0;

  return energyDistance + orderBias + minuteBias + focusBias;
}

function toggleStep(taskId, stepId) {
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    return;
  }

  const step = task.steps.find((entry) => entry.id === stepId);
  if (!step) {
    return;
  }

  step.done = !step.done;
  step.completedAt = step.done ? new Date().toISOString() : null;

  if (step.done) {
    recordHistory("step", `Finished: ${step.title}`, task.title);
  }

  if (state.focus.stepId === stepId && step.done) {
    const nextOpenStep = getOpenSteps(task)[0];
    if (nextOpenStep) {
      state.focus.stepId = nextOpenStep.id;
      state.focus.taskId = task.id;
    } else {
      state.focus.stepId = null;
      state.focus.taskId = null;
      ensureFocusedStep();
    }
  }

  if (step.done) {
    state.ai.coachMessage = buildProgressCoachMessage(step.title);
    state.ai.insight = buildProgressInsight(task.title);
  }

  saveState();
  render();
}

function setFocus(taskId, stepId) {
  state.focus.taskId = taskId;
  state.focus.stepId = stepId;
  saveState();
  render();
}

function render() {
  syncEnergySelections();
  syncTimerSelections();
  renderDraftPreview();
  renderAiPanel();
  renderTasks();
  renderSuggestion();
  renderTimerTarget();
  renderTimerStatus();
  renderHistory();
  renderHeaderStats();
  updateTimerDisplay();
  toggleBusyState();
}

function renderAiPanel() {
  elements.aiStatusCopy.textContent = state.ai.statusText;
  elements.coachMessage.textContent = state.ai.coachMessage;
  elements.coachInsight.textContent = state.ai.insight;
}

function renderDraftPreview() {
  const openTasks = state.tasks.filter((task) => !isTaskDone(task));
  const existingTitles = new Set(openTasks.map((task) => task.title.toLowerCase()));
  const pendingEntries = splitEntries(state.draftText).filter(
    (entry) => !existingTitles.has(tidySentence(entry).toLowerCase())
  );
  const totalCount = openTasks.length + pendingEntries.length;

  elements.draftCount.textContent = `${totalCount} task${totalCount === 1 ? "" : "s"} active`;

  if (!totalCount) {
    elements.draftPreview.className = "draft-preview empty-state";
    elements.draftPreview.innerHTML =
      "<p>As you add tasks, they will stay here as your running list until they are completed.</p>";
    return;
  }

  elements.draftPreview.className = "draft-preview";
  elements.draftPreview.innerHTML = "";

  openTasks.forEach((task) => {
    const row = document.createElement("div");
    row.className = "draft-item";

    const text = document.createElement("p");
    text.className = "draft-item-text";
    text.textContent = task.title;

    const status = document.createElement("span");
    status.className = "draft-item-status";
    status.textContent = `${getOpenSteps(task).length} step${getOpenSteps(task).length === 1 ? "" : "s"} left`;

    row.append(text, status);
    elements.draftPreview.append(row);
  });

  pendingEntries.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "draft-item";

    const text = document.createElement("p");
    text.className = "draft-item-text";
    text.textContent = tidySentence(entry);

    const removeButton = document.createElement("button");
    removeButton.className = "button button-mini button-ghost draft-remove";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => removeDraftEntry(index));

    row.append(text, removeButton);
    elements.draftPreview.append(row);
  });
}

function renderTasks() {
  elements.taskList.innerHTML = "";
  const openTasks = state.tasks.filter((task) => !isTaskDone(task));

  if (!openTasks.length) {
    elements.taskList.className = "task-list empty-state";
    elements.taskList.innerHTML =
      "<p>No open tasks right now. Add a few new ones whenever you want to keep going.</p>";
    return;
  }

  elements.taskList.className = "task-list";

  openTasks.forEach((task) => {
    const fragment = elements.taskTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".task-card");
    const category = fragment.querySelector(".task-category");
    const title = fragment.querySelector(".task-title");
    const meta = fragment.querySelector(".task-meta");
    const stepList = fragment.querySelector(".step-list");
    const focusButton = fragment.querySelector(".focus-task");
    const openStepCount = getOpenSteps(task).length;

    category.textContent = task.category;
    title.textContent = task.title;
    meta.textContent = `${openStepCount} tiny step${openStepCount === 1 ? "" : "s"} left`;

    if (task.id === state.focus.taskId) {
      card.classList.add("is-focused");
    }

    focusButton.addEventListener("click", () => {
      const nextStep = getOpenSteps(task)[0];
      if (nextStep) {
        setFocus(task.id, nextStep.id);
      }
    });

    task.steps.forEach((step) => {
      const item = document.createElement("li");
      item.className = "step-item";
      if (step.done) {
        item.classList.add("is-done");
      }

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = step.done;
      checkbox.setAttribute("aria-label", `Mark ${step.title} complete`);
      checkbox.addEventListener("change", () => toggleStep(task.id, step.id));

      const copy = document.createElement("div");
      copy.className = "step-copy";

      const stepTitle = document.createElement("span");
      stepTitle.className = "step-title";
      stepTitle.textContent = step.title;

      const detail = document.createElement("span");
      detail.className = "step-detail";
      detail.textContent = `${labelEffort(step.effort)} lift • ${step.minutes} min`;

      copy.append(stepTitle, detail);

      const focus = document.createElement("button");
      focus.className = "step-focus button button-mini button-ghost";
      focus.textContent = "Do this";
      focus.disabled = step.done;
      focus.addEventListener("click", () => setFocus(task.id, step.id));

      item.append(checkbox, copy, focus);
      stepList.append(item);
    });

    elements.taskList.append(fragment);
  });
}

function renderSuggestion() {
  const focusedTask = getFocusedTask();
  const focusedStep = getFocusedStep();
  const suggestion = focusedTask && focusedStep
    ? { task: focusedTask, step: focusedStep }
    : getSuggestedStep();

  if (!suggestion) {
    elements.suggestionCard.className = "suggestion-card empty";
    elements.suggestionCard.innerHTML =
      "<p class='suggestion-empty'>No open steps right now. That means your board is clear.</p>";
    return;
  }

  const isFocused =
    suggestion.task.id === state.focus.taskId && suggestion.step.id === state.focus.stepId;
  const label = state.ai.mode === "live" && state.ai.guidanceReason
    ? "AI-picked next step"
    : isFocused
      ? "Selected next step"
      : "Suggested next step";
  const reason = isFocused && state.ai.guidanceReason
    ? state.ai.guidanceReason
    : buildSuggestionReason(suggestion.step);

  elements.suggestionCard.className = "suggestion-card";
  elements.suggestionCard.innerHTML = `
    <p class="suggestion-label">${label}</p>
    <h3 class="suggestion-step">${escapeHtml(suggestion.step.title)}</h3>
    <p class="suggestion-task">From: ${escapeHtml(suggestion.task.title)}</p>
    <p class="suggestion-reason">${escapeHtml(reason)}</p>
    <div class="suggestion-actions">
      <button class="button button-primary" id="suggestion-focus">${
        isFocused ? "Already selected" : "Focus this step"
      }</button>
      <button class="button button-ghost" id="suggestion-refresh">${
        canUseAI() ? "Ask AI again" : "Give me another option"
      }</button>
    </div>
  `;

  const focusButton = document.querySelector("#suggestion-focus");
  const refreshButton = document.querySelector("#suggestion-refresh");

  focusButton.disabled = isFocused;
  focusButton.addEventListener("click", () => setFocus(suggestion.task.id, suggestion.step.id));
  refreshButton.addEventListener("click", () => {
    if (canUseAI()) {
      void handlePickNextStep();
      return;
    }

    cycleSuggestion(suggestion.step.id);
  });
}

function cycleSuggestion(currentStepId) {
  const suggestion = getSuggestedAlternatives().find((candidate) => candidate.step.id !== currentStepId);

  if (!suggestion) {
    return;
  }

  state.focus.taskId = suggestion.task.id;
  state.focus.stepId = suggestion.step.id;
  state.ai.guidanceReason = buildSuggestionReason(suggestion.step);
  state.ai.coachMessage = buildFallbackCoachMessage(suggestion);
  state.ai.insight = buildFallbackInsight();
  saveState();
  render();
}

function buildSuggestionReason(step) {
  const energyCopy = {
    low: "low-friction",
    medium: "steady-energy",
    high: "momentum-friendly",
  }[step.effort];

  return `This is a ${energyCopy} move that should take about ${step.minutes} minutes.`;
}

function buildFallbackCoachMessage(suggestion) {
  return `Start with "${suggestion.step.title}" and stop after a tiny visible win. You do not need to finish the whole task to count this as progress.`;
}

function buildFallbackInsight() {
  return `You are currently set to ${state.preferences.energy} energy, so Step Zero is leaning toward lighter, shorter moves first.`;
}

function buildProgressCoachMessage(stepTitle) {
  return `Nice. "${stepTitle}" is done, which means your next restart will be easier than the last one.`;
}

function buildProgressInsight(taskTitle) {
  return `Progress tends to come from reducing friction on "${taskTitle}", not from pushing harder all at once.`;
}

function renderTimerTarget() {
  const task = getFocusedTask();
  const step = getFocusedStep();

  if (!task || !step) {
    elements.timerTarget.textContent = "Suggested focus: nothing selected yet.";
    return;
  }

  elements.timerTarget.textContent = `Suggested focus: ${step.title} (${task.title})`;
}

function renderTimerStatus(customText) {
  if (customText) {
    elements.timerStatus.textContent = customText;
    return;
  }

  if (state.timer.isRunning) {
    elements.timerStatus.textContent = "Sprint in progress. Tiny is enough.";
    return;
  }

  elements.timerStatus.textContent = "Ready when you are.";
}

function updateTimerDisplay() {
  const minutes = Math.floor(state.timer.remainingSeconds / 60);
  const seconds = state.timer.remainingSeconds % 60;
  elements.timerDisplay.textContent =
    `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function completeSprint() {
  stopTimer();
  recordHistory("sprint", `Completed a ${state.timer.selectedDuration}-minute sprint.`);
  elements.completeCopy.textContent = buildCompleteCopy();
  elements.sprintComplete.classList.remove("hidden");
  state.timer.remainingSeconds = state.timer.selectedDuration * 60;
  updateTimerDisplay();
  renderTimerStatus("Sprint complete. Nice work.");
  state.ai.coachMessage = buildSprintCoachMessage();
  state.ai.insight = buildSprintInsight();
  saveState();
  renderHeaderStats();
  renderHistory();

  if (canUseAI() && state.tasks.length) {
    void refreshAIGuidance("sprint_complete");
  }
}

function buildCompleteCopy() {
  const focusedStep = getFocusedStep();
  if (!focusedStep) {
    return "You showed up. Want another round or a softer landing?";
  }

  return `You just gave "${focusedStep.title}" ${state.timer.selectedDuration} focused minutes.`;
}

function buildSprintCoachMessage() {
  const focusedStep = getFocusedStep();
  if (!focusedStep) {
    return "You showed up, which is enough to make the next restart easier.";
  }

  return `You stayed with "${focusedStep.title}" for a full sprint. Decide whether you want one more pass or a clean pause.`;
}

function buildSprintInsight() {
  return "Attention usually returns faster when the next step is already named before you stop.";
}

function stopTimer() {
  if (state.timer.intervalId) {
    window.clearInterval(state.timer.intervalId);
  }

  state.timer.intervalId = null;
  state.timer.isRunning = false;
}

function recordHistory(type, summary, taskTitle = null) {
  state.history.unshift({
    id: crypto.randomUUID(),
    type,
    summary,
    taskTitle,
    timestamp: new Date().toISOString(),
  });

  state.history = state.history.slice(0, 20);
}

function renderHistory() {
  const returnCount = state.history.filter((item) => item.type === "reset").length;
  const openLoops = state.tasks.reduce((count, task) => count + getOpenSteps(task).length, 0);

  elements.returnCount.textContent = returnCount;
  elements.openLoops.textContent = openLoops;

  if (!state.history.length) {
    elements.historyLog.className = "history-log empty-state";
    elements.historyLog.innerHTML = "<p>Your completed steps and sprints will show up here.</p>";
    return;
  }

  elements.historyLog.className = "history-log";
  elements.historyLog.innerHTML = "";

  state.history.forEach((item) => {
    const wrapper = document.createElement("div");
    wrapper.className = "history-item";

    const title = document.createElement("p");
    title.className = "history-item-title";
    title.textContent = item.summary;

    const meta = document.createElement("p");
    meta.className = "history-item-meta";
    meta.textContent = `${formatWhen(item.timestamp)}${item.taskTitle ? ` • ${item.taskTitle}` : ""}`;

    wrapper.append(title, meta);
    elements.historyLog.append(wrapper);
  });
}

function renderHeaderStats() {
  const today = new Date().toDateString();
  const completedStepsToday = state.tasks
    .flatMap((task) => task.steps)
    .filter((step) => step.completedAt && new Date(step.completedAt).toDateString() === today).length;

  const completedSprintsToday = state.history.filter(
    (item) => item.type === "sprint" && new Date(item.timestamp).toDateString() === today
  ).length;

  elements.todaySteps.textContent = completedStepsToday;
  elements.todaySprints.textContent = completedSprintsToday;
  elements.momentumNote.textContent = buildMomentumNote(completedStepsToday, completedSprintsToday);
}

function buildMomentumNote(stepCount, sprintCount) {
  if (!stepCount && !sprintCount) {
    return "Small counts. Small still counts.";
  }

  if (stepCount >= 4 || sprintCount >= 3) {
    return "Momentum is real today. Keep it kind, not perfect.";
  }

  return "You restarted. That matters more than streaks.";
}

function syncEnergySelections() {
  elements.energyOptions.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.energy === state.preferences.energy);
  });
}

function syncTimerSelections() {
  elements.durationOptions.forEach((button) => {
    button.classList.toggle(
      "is-active",
      Number(button.dataset.duration) === state.timer.selectedDuration
    );
  });
}

function toggleBusyState() {
  const disabled = state.ai.isLoading;
  elements.generatePlan.disabled = disabled;
  elements.pickNextStep.disabled = disabled;
}

function setAiLoading(message) {
  state.ai.isLoading = true;
  state.ai.statusText = message;
  renderAiPanel();
  toggleBusyState();
}

function setAiFallback(message) {
  state.ai.isLoading = false;
  state.ai.mode = "fallback";
  state.ai.statusText = message;
  state.ai.guidanceReason = "";

  if (!state.ai.coachMessage) {
    state.ai.coachMessage = "Step Zero is using its built-in guidance right now.";
  }

  if (!state.ai.insight) {
    state.ai.insight = "Even fallback guidance works better when the next move is small and visible.";
  }

  toggleBusyState();
}

function canUseAI() {
  return state.ai.available;
}

function saveState() {
  const serializable = {
    tasks: state.tasks,
    history: state.history,
    draftText: state.draftText,
    preferences: state.preferences,
    focus: state.focus,
    ai: {
      coachMessage: state.ai.coachMessage,
      insight: state.ai.insight,
      guidanceReason: state.ai.guidanceReason,
    },
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
}

function setBrainDumpValue(value) {
  state.draftText = value;
  elements.brainDump.value = value;
  renderDraftPreview();
  saveState();
}

function removeDraftEntry(indexToRemove) {
  const entries = splitEntries(state.draftText);
  entries.splice(indexToRemove, 1);
  setBrainDumpValue(entries.join("\n"));
}

async function fetchJSON(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function formatWhen(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function labelEffort(effort) {
  return {
    low: "Low",
    medium: "Medium",
    high: "High",
  }[effort];
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

init();
