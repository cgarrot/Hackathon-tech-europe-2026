import { compileGameRequest, voiceExamples } from "./compiler-adapter.js";

const form = document.querySelector("#game-form");
const micButton = document.querySelector("#mic-button");
const micLabel = document.querySelector("#mic-label");
const generateButton = document.querySelector("#generate-button");
const exampleButton = document.querySelector("#example-button");
const transcriptPanel = document.querySelector("#transcript-panel");
const transcriptText = document.querySelector("#transcript-text");
const progress = document.querySelector("#progress");
const progressLabel = document.querySelector("#progress-label");
const progressPercent = document.querySelector("#progress-percent");
const progressBar = document.querySelector("#progress-bar");
const steps = Array.from(document.querySelectorAll("#steps li"));
const languageButtons = Array.from(document.querySelectorAll("[data-ui-lang]"));

const copy = {
  fr: {
    status: "Prototype input",
    eyebrow: "Game Compiler",
    title: "Dis le jeu à générer",
    intro: "Appuie, parle, puis laisse la compilation simulée transformer ta demande en jeu.",
    talk: "Parler",
    listen: "Écoute",
    talkAgain: "Reparler",
    listeningText: "Écoute…",
    transcribingText: "Transcription en cours…",
    micHelp: "Prototype vocal simulé. La future version branchera Gradium STT ici.",
    transcriptTitle: "Transcription détectée",
    generate: "Générer",
    example: "Changer d’exemple",
    progressIdle: "Compilation du jeu…",
    previewTitle: "Jeu prêt à lancer",
    previewText:
      "La page suivante affichera le jeu généré : personnages, déroulé de partie et emplacements prévus pour les voix, visuels et IA.",
    previewAria: "Aperçu du jeu généré",
    stepSchema: "Structuration des règles",
    stepPersonas: "Préparation des personas IA",
    stepVisuals: "Plan d’assets visuels",
    stepRuntime: "Assemblage du runtime",
    buildSteps: [
      ["schema", "OpenAI structure les règles", 22],
      ["personas", "Pioneer prépare les personas", 48],
      ["visuals", "fal planifie les visuels", 73],
      ["runtime", "Assemblage du runtime", 100]
    ]
  },
  en: {
    status: "Input prototype",
    eyebrow: "Game Compiler",
    title: "Say the game to generate",
    intro: "Press, speak, then let the simulated compiler turn your request into a game.",
    talk: "Speak",
    listen: "Listening",
    talkAgain: "Speak again",
    listeningText: "Listening…",
    transcribingText: "Transcribing…",
    micHelp: "Simulated voice input. The future version will connect Gradium STT here.",
    transcriptTitle: "Detected transcript",
    generate: "Generate",
    example: "Change example",
    progressIdle: "Compiling game…",
    previewTitle: "Ready-to-play game",
    previewText:
      "The next page will show the generated game: characters, gameplay flow, and slots for voices, visuals, and AI.",
    previewAria: "Generated game preview",
    stepSchema: "Structuring rules",
    stepPersonas: "Preparing AI personas",
    stepVisuals: "Planning visual assets",
    stepRuntime: "Assembling runtime",
    buildSteps: [
      ["schema", "OpenAI structures the rules", 22],
      ["personas", "Pioneer prepares personas", 48],
      ["visuals", "fal plans visual assets", 73],
      ["runtime", "Assembling runtime", 100]
    ]
  }
};

let exampleIndex = 0;
let transcript = "";
let captureState = "idle";
let uiLanguage = localStorage.getItem("gameforge:uiLanguage") || "fr";

applyLanguage(uiLanguage);

languageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyLanguage(button.dataset.uiLang);
  });
});

exampleButton.addEventListener("click", () => {
  exampleIndex = (exampleIndex + 1) % voiceExamples.length;
  setTranscript(voiceExamples[exampleIndex]);
});

micButton.addEventListener("click", async () => {
  if (captureState === "listening") return;

  captureState = "listening";
  micButton.classList.add("listening");
  micButton.disabled = true;
  generateButton.disabled = true;
  transcriptPanel.hidden = false;
  transcriptText.textContent = t("listeningText");
  micLabel.textContent = t("listen");

  await sleep(900);
  transcriptText.textContent = t("transcribingText");
  await sleep(650);

  setTranscript(voiceExamples[exampleIndex]);
  micButton.disabled = false;
  micButton.classList.remove("listening");
  micLabel.textContent = t("talkAgain");
  captureState = "ready";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!transcript.trim()) return;

  generateButton.disabled = true;
  micButton.disabled = true;
  progress.hidden = false;

  for (const [stepId, label, percent] of copy[uiLanguage].buildSteps) {
    setProgress(stepId, label, percent);
    await sleep(760);
  }

  const result = await compileGameRequest({ transcript });

  sessionStorage.setItem("gameforge:lastGame", JSON.stringify(result));
  window.location.href = "./result.html";
});

function setTranscript(value) {
  transcript = value;
  transcriptPanel.hidden = false;
  transcriptText.textContent = value;
  generateButton.disabled = false;
  if (captureState !== "listening") {
    micLabel.textContent = t("talkAgain");
  }
}

function setProgress(stepId, label, percent) {
  progressLabel.textContent = label;
  progressPercent.textContent = `${percent}%`;
  progressBar.style.width = `${percent}%`;
  steps.forEach((step) => {
    step.classList.toggle("active", step.dataset.step === stepId);
  });
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function applyLanguage(language) {
  uiLanguage = language === "en" ? "en" : "fr";
  localStorage.setItem("gameforge:uiLanguage", uiLanguage);
  document.documentElement.lang = uiLanguage;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  });
  languageButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.uiLang === uiLanguage);
  });
  if (captureState === "idle") {
    micLabel.textContent = t("talk");
  } else if (captureState === "ready") {
    micLabel.textContent = t("talkAgain");
  }
}

function t(key) {
  return copy[uiLanguage][key] || copy.fr[key] || key;
}
