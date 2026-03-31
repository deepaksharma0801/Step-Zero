const STORAGE_KEY = "step-zero-state-v1";
const DEFAULT_DURATION = 10;
const DEMO_TEXT = `finish pitch deck
email Sarah about launch copy
laundry
call doctor for appointment
pay internet bill`;

const state = {
  tasks: [],
  history: [],
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
};

const elements = {
  brainDump: document.querySelector("#brain-dump"),
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
};

function init() {
  hydrateState();
  bindEvents();
  render();
}

function hydrateState() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    updateTimerDisplay();
    return;
  }

  try {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed.tasks)) {
      state.tasks = parsed.tasks;
    }
    if (Array.isArray(parsed.history)) {
      state.history = parsed.history;
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
  } catch (error) {
    console.warn("Could not restore Step Zero state.", error);
  }

  syncTimerSelections();
  updateTimerDisplay();
}

function bindEvents() {
  elements.generatePlan.addEventListener("click", handleGeneratePlan);
  elements.loadDemo.addEventListener("click", handleLoadDemo);
  elements.clearAll.addEventListener("click", handleClearAll);
  elements.pickNextStep.addEventListener("click", handlePickNextStep);
  elements.startTimer.addEventListener("click", handleStartTimer);
  elements.pauseTimer.addEventListener("click", handlePauseTimer);
  elements.resetTimer.addEventListener("click", handleResetTimer);
  elements.continueSprint.addEventListener("click", handleContinueSprint);
  elements.takeBreak.addEventListener("click", handleTakeBreak);
  elements.switchTask.addEventListener("click", handleSwitchTask);
  elements.doneForNow.addEventListener("click", handleDoneForNow);

  elements.energyOptions.forEach((button) => {
    button.addEventListener("click", () => {
      state.preferences.energy = button.dataset.energy;
      syncEnergySelections();
      saveState();
      renderSuggestion();
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

function handleGeneratePlan() {
  const rawText = elements.brainDump.value.trim();
  if (!rawText) {
    elements.brainDump.focus();
    return;
  }

  const entries = splitEntries(rawText);
  const nextTasks = entries.map(createTaskFromEntry);
  state.tasks = mergeTasks(nextTasks, state.tasks);
  elements.brainDump.value = "";

  if (!getFocusedStep()) {
    const firstOpenTask = state.tasks.find((task) => !isTaskDone(task));
    if (firstOpenTask) {
      const firstOpenStep = getOpenSteps(firstOpenTask)[0];
      if (firstOpenStep) {
        state.focus.taskId = firstOpenTask.id;
        state.focus.stepId = firstOpenStep.id;
      }
    }
  }

  recordHistory("reset", "Built a fresh Step Zero plan.");
  saveState();
  render();
}

function handleLoadDemo() {
  elements.brainDump.value = DEMO_TEXT;
  handleGeneratePlan();
}

function handleClearAll() {
  stopTimer();
  state.tasks = [];
  state.history = [];
  state.focus = { taskId: null, stepId: null };
  state.timer.selectedDuration = DEFAULT_DURATION;
  state.timer.remainingSeconds = DEFAULT_DURATION * 60;
  elements.brainDump.value = "";
  syncTimerSelections();
  saveState();
  render();
}

function handlePickNextStep() {
  const suggestion = getSuggestedStep();
  if (!suggestion) {
    renderSuggestion();
    return;
  }

  state.focus.taskId = suggestion.task.id;
  state.focus.stepId = suggestion.step.id;
  recordHistory(
    "reset",
    `Chose a fresh starting point: ${suggestion.step.title}.`
  );
  saveState();
  render();
}

function handleStartTimer() {
  const focusedStep = getFocusedStep();
  if (!focusedStep) {
    const suggestion = getSuggestedStep();
    if (suggestion) {
      state.focus.taskId = suggestion.task.id;
      state.focus.stepId = suggestion.step.id;
      renderSuggestion();
      renderTasks();
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

function handleSwitchTask() {
  elements.sprintComplete.classList.add("hidden");
  handlePickNextStep();
  renderTimerTarget();
}

function handleDoneForNow() {
  stopTimer();
  elements.sprintComplete.classList.add("hidden");
  state.timer.remainingSeconds = state.timer.selectedDuration * 60;
  updateTimerDisplay();
  renderTimerStatus("You can come back later. Counts still count.");
}

function splitEntries(rawText) {
  return rawText
    .split(/\n|,|;/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function createTaskFromEntry(entry) {
  const normalized = tidySentence(entry);
  const breakdown = buildBreakdown(normalized);

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

function buildBreakdown(title) {
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
        makeStep("Open the file and rename today&apos;s version.", "low", 2),
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
  return {
    title,
    effort,
    minutes,
  };
}

function matches(text, words) {
  return words.some((word) => text.includes(word));
}

function tidySentence(text) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function mergeTasks(nextTasks, existingTasks) {
  const existingTitles = new Set(existingTasks.map((task) => task.title.toLowerCase()));
  const uniqueNewTasks = nextTasks.filter((task) => !existingTitles.has(task.title.toLowerCase()));
  return [...uniqueNewTasks, ...existingTasks];
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

function scoreStep(step, index, targetEnergyScore, isFocusedTask) {
  const effortScore = {
    low: 1,
    medium: 2,
    high: 3,
  }[step.effort];

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

      const fallbackSuggestion = getSuggestedStep();
      if (fallbackSuggestion) {
        state.focus.taskId = fallbackSuggestion.task.id;
        state.focus.stepId = fallbackSuggestion.step.id;
      }
    }
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
  renderTasks();
  renderSuggestion();
  renderTimerTarget();
  renderTimerStatus();
  renderHistory();
  renderHeaderStats();
  updateTimerDisplay();
}

function renderTasks() {
  elements.taskList.innerHTML = "";

  if (!state.tasks.length) {
    elements.taskList.className = "task-list empty-state";
    elements.taskList.innerHTML =
      "<p>No tasks yet. Brain dump a few things to get your first Step Zero plan.</p>";
    return;
  }

  elements.taskList.className = "task-list";

  state.tasks.forEach((task) => {
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
    meta.textContent = openStepCount
      ? `${openStepCount} tiny step${openStepCount === 1 ? "" : "s"} left`
      : "This task is fully cleared.";

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
      stepTitle.textContent = decodeHtml(step.title);

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

  elements.suggestionCard.className = "suggestion-card";

  const isFocused =
    suggestion.task.id === state.focus.taskId && suggestion.step.id === state.focus.stepId;
  const label = isFocused ? "Selected next step" : "Suggested next step";

  elements.suggestionCard.innerHTML = `
    <p class="suggestion-label">${label}</p>
    <h3 class="suggestion-step">${decodeHtml(suggestion.step.title)}</h3>
    <p class="suggestion-task">From: ${suggestion.task.title}</p>
    <p class="suggestion-reason">${buildSuggestionReason(suggestion.step)}</p>
    <div class="suggestion-actions">
      <button class="button button-primary" id="suggestion-focus">${
        isFocused ? "Already selected" : "Focus this step"
      }</button>
      <button class="button button-secondary" id="suggestion-refresh">Give me another option</button>
    </div>
  `;

  const focusButton = document.querySelector("#suggestion-focus");
  const refreshButton = document.querySelector("#suggestion-refresh");

  focusButton.disabled = isFocused;
  focusButton.addEventListener("click", () => setFocus(suggestion.task.id, suggestion.step.id));
  refreshButton.addEventListener("click", () => cycleSuggestion(suggestion.step.id));
}

function cycleSuggestion(currentStepId) {
  const suggestion = getSuggestedAlternatives()
    .find((candidate) => candidate.step.id !== currentStepId);

  if (!suggestion) {
    return;
  }

  state.focus.taskId = suggestion.task.id;
  state.focus.stepId = suggestion.step.id;
  saveState();
  render();
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

function buildSuggestionReason(step) {
  const energyCopy = {
    low: "low-friction",
    medium: "steady-energy",
    high: "momentum-friendly",
  }[step.effort];

  return `This is a ${energyCopy} move that should take about ${step.minutes} minutes.`;
}

function renderTimerTarget() {
  const task = getFocusedTask();
  const step = getFocusedStep();

  if (!task || !step) {
    elements.timerTarget.textContent = "Suggested focus: nothing selected yet.";
    return;
  }

  elements.timerTarget.textContent = `Suggested focus: ${decodeHtml(step.title)} (${task.title})`;
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
  elements.timerDisplay.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function completeSprint() {
  stopTimer();
  recordHistory("sprint", `Completed a ${state.timer.selectedDuration}-minute sprint.`);
  elements.completeCopy.textContent = buildCompleteCopy();
  elements.sprintComplete.classList.remove("hidden");
  state.timer.remainingSeconds = state.timer.selectedDuration * 60;
  updateTimerDisplay();
  renderTimerStatus("Sprint complete. Nice work.");
  saveState();
  renderHeaderStats();
  renderHistory();
}

function buildCompleteCopy() {
  const focusedStep = getFocusedStep();
  if (!focusedStep) {
    return "You showed up. Want another round or a softer landing?";
  }

  return `You just gave "${decodeHtml(focusedStep.title)}" ${state.timer.selectedDuration} focused minutes.`;
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

  state.history = state.history.slice(0, 16);
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

function saveState() {
  const serializable = {
    tasks: state.tasks,
    history: state.history,
    preferences: state.preferences,
    focus: state.focus,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
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

function decodeHtml(text) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

function labelEffort(effort) {
  return {
    low: "Low",
    medium: "Medium",
    high: "High",
  }[effort];
}

init();
