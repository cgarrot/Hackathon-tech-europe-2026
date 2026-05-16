import { compileGameRequest } from "./compiler-adapter.js";

const prompt = sessionStorage.getItem("gameforge:pendingPrompt") || "";
const uiLanguage = sessionStorage.getItem("gameforge:uiLanguage") === "en" ? "en" : "fr";

const nodes = {
  eyebrow: document.querySelector("#prepare-eyebrow"),
  promptText: document.querySelector("#prompt-text"),
  buildLabel: document.querySelector("#build-label"),
  buildPercent: document.querySelector("#build-percent"),
  buildBar: document.querySelector("#build-bar")
};

const copy = {
  fr: {
    eyebrow: "Préparation",
    fallbackPrompt: "Je veux un jeu de déduction sociale avec des rôles cachés et des IA qui mentent.",
    steps: [
      ["La demande devient une promesse de partie.", 14],
      ["Les règles trouvent leur rythme.", 31],
      ["Les personnages reçoivent une intention.", 49],
      ["Le monde cherche sa première image.", 66],
      ["Les voix se placent dans la scène.", 83],
      ["La porte s’ouvre.", 100]
    ]
  },
  en: {
    eyebrow: "Preparing",
    fallbackPrompt: "I want a social deduction game with hidden roles and AIs that lie.",
    steps: [
      ["The request becomes a playable promise.", 14],
      ["The rules find their rhythm.", 31],
      ["The characters receive an intention.", 49],
      ["The world searches for its first image.", 66],
      ["The voices settle into the scene.", 83],
      ["The door opens.", 100]
    ]
  }
};

const strings = copy[uiLanguage];
const transcript = prompt.trim() || strings.fallbackPrompt;

document.documentElement.lang = uiLanguage;
nodes.eyebrow.textContent = strings.eyebrow;
nodes.promptText.textContent = transcript;

await runPreparation();

async function runPreparation() {
  const gamePromise = compileGameRequest({ transcript });

  for (const [label, percent] of strings.steps) {
    setBuildProgress(label, percent);
    await sleep(980);
  }

  const game = await gamePromise;
  sessionStorage.setItem("gameforge:lastGame", JSON.stringify(game));
  window.location.href = "./result.html";
}

function setBuildProgress(label, percent) {
  nodes.buildLabel.classList.remove("message-enter");
  void nodes.buildLabel.offsetWidth;
  nodes.buildLabel.classList.add("message-enter");
  nodes.buildLabel.textContent = label;
  nodes.buildPercent.textContent = `${percent}%`;
  nodes.buildBar.style.width = `${percent}%`;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
