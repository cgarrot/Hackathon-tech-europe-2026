const form = document.querySelector("#game-form");
const micButton = document.querySelector("#mic-button");
const micLabel = document.querySelector("#mic-label");
const generateButton = document.querySelector("#generate-button");
const generateLabel = document.querySelector("#generate-label");
const tagline = document.querySelector("#tagline");
const transcriptText = document.querySelector("#transcript-text");

const copy = {
  fr: {
    documentTitle: "GameForge · Nouveau jeu",
    tagline: "Décris le jeu que tu veux jouer. On le forge pendant que tu respires.",
    speak: "Speak",
    listening: "Écoute…",
    transcribing: "Transcription en cours…",
    speakAgain: "Speak again",
    placeholder: "Ta demande apparaîtra ici. Tu peux la modifier avant de générer.",
    generate: "Générer le jeu",
    example: "Je veux jouer à un jeu de loup-garou dans un village médiéval, 8 joueurs dont 2 IA."
  },
  en: {
    documentTitle: "GameForge · New game",
    tagline: "Describe the game you want to play. We forge it while you breathe.",
    speak: "Speak",
    listening: "Listening…",
    transcribing: "Transcribing…",
    speakAgain: "Speak again",
    placeholder: "Your request will appear here. You can edit it before generation.",
    generate: "Generate game",
    example: "I want a werewolf game in a medieval village, 8 players including 2 AIs."
  }
};

let transcript = "";
let captureState = "idle";
const uiLanguage = detectBrowserLanguage();

applyLanguage(uiLanguage);

micButton.addEventListener("click", async () => {
  if (captureState === "listening") return;

  captureState = "listening";
  micButton.classList.add("listening");
  micButton.disabled = true;
  generateButton.disabled = true;
  transcriptText.value = copy[uiLanguage].listening;
  micLabel.textContent = "Listening";

  await sleep(900);
  transcriptText.value = copy[uiLanguage].transcribing;
  await sleep(650);

  setTranscript(copy[uiLanguage].example);
  micButton.disabled = false;
  micButton.classList.remove("listening");
  micLabel.textContent = copy[uiLanguage].speakAgain;
  captureState = "ready";
});

transcriptText.addEventListener("input", () => {
  setTranscript(transcriptText.value, { preserveValue: true });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!transcript.trim()) return;

  generateButton.disabled = true;
  micButton.disabled = true;
  sessionStorage.setItem("gameforge:pendingPrompt", transcript);
  sessionStorage.setItem("gameforge:uiLanguage", detectLanguage(transcript));
  window.location.href = "./prepare.html";
});

function setTranscript(value, options = {}) {
  transcript = value;
  if (!options.preserveValue) {
    transcriptText.value = value;
  }
  generateButton.disabled = !value.trim();
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function applyLanguage(language) {
  const strings = copy[language];
  document.documentElement.lang = language;
  document.title = strings.documentTitle;
  tagline.textContent = strings.tagline;
  micLabel.textContent = strings.speak;
  transcriptText.placeholder = strings.placeholder;
  generateLabel.textContent = strings.generate;
}

function detectBrowserLanguage() {
  return navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

function detectLanguage(value) {
  return /\b(i want|game|players|including|speak|generate)\b/i.test(value) ? "en" : "fr";
}
