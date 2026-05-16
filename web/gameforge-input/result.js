const fallback = {
  title: "Les Ombres de Valbrume",
  genre: "Déduction sociale",
  prompt: "Je veux jouer à un jeu de loup-garou dans un village médiéval, 8 joueurs dont 2 IA, avec une voyante et une sorcière.",
  language: "fr",
  players: 8,
  aiPlayers: 2,
  roles: [
    { id: "werewolf", name: "Loup-garou", controller: "IA ou humain", rule: "Élimine un villageois chaque nuit.", palette: ["#263a33", "#8a3a47"] },
    { id: "villager", name: "Villageois", controller: "Humain", rule: "Observe et vote.", palette: ["#315a4a", "#c8832d"] },
    { id: "seer", name: "Voyante", controller: "Humain ou IA", rule: "Sonde un rôle par nuit.", palette: ["#2d3b58", "#6e8fb5"] },
    { id: "witch", name: "Sorcière", controller: "Humain ou IA", rule: "Dispose de deux potions.", palette: ["#46334b", "#b47b62"] }
  ],
  phases: ["Nuit", "Réveil", "Débat", "Vote", "Résolution"],
  integrations: [
    { name: "OpenAI", description: "Règles, phases, conditions de victoire et logique de partie.", ready: true },
    { name: "Pioneer", description: "Prompts et mémoire des personas IA.", ready: false },
    { name: "fal", description: "Décors, cartes de rôle, portraits et ambiances.", ready: false },
    { name: "Gradium", description: "STT joueur, TTS des IA et effets audio.", ready: false }
  ]
};

const stored = sessionStorage.getItem("gameforge:lastGame");
const game = stored ? JSON.parse(stored) : fallback;

document.querySelector("#game-title").textContent = game.title;
document.querySelector("#original-prompt").textContent = game.prompt;

const meta = document.querySelector("#game-meta");
[
  game.genre,
  `${game.players} joueurs`,
  `${game.aiPlayers} IA`,
  game.language === "en" ? "Anglais" : "Français"
].forEach((item) => {
  const pill = document.createElement("span");
  pill.className = "meta-pill";
  pill.textContent = item;
  meta.appendChild(pill);
});

const roles = document.querySelector("#roles");
document.querySelector("#role-count").textContent = `${game.roles.length} rôles`;

game.roles.forEach((role) => {
  const tile = document.createElement("article");
  tile.className = "role-tile";
  tile.innerHTML = `
    <div class="role-art" style="--role-a: ${role.palette[0]}; --role-b: ${role.palette[1]}"></div>
    <div class="role-body">
      <h3>${escapeHtml(role.name)}</h3>
      <p>${escapeHtml(role.controller)}</p>
      <p>${escapeHtml(role.rule)}</p>
    </div>
  `;
  roles.appendChild(tile);
});

const phases = document.querySelector("#phases");
game.phases.forEach((phase, index) => {
  const item = document.createElement("article");
  item.className = "phase-item";
  item.innerHTML = `
    <h3>${index + 1}. ${escapeHtml(phase)}</h3>
    <p>${phaseDescription(phase)}</p>
  `;
  phases.appendChild(item);
});

const integrations = document.querySelector("#integrations");
game.integrations.forEach((integration) => {
  const item = document.createElement("article");
  item.className = `integration-tile ${integration.ready ? "ready" : ""}`;
  item.innerHTML = `
    <h3>${escapeHtml(integration.name)}</h3>
    <p>${escapeHtml(integration.description)}</p>
  `;
  integrations.appendChild(item);
});

function phaseDescription(phase) {
  const lower = phase.toLowerCase();
  if (lower.includes("nuit")) return "Actions secrètes, décisions IA et préparation des événements.";
  if (lower.includes("débat")) return "Les joueurs humains parlent, les IA répondent, les soupçons émergent.";
  if (lower.includes("vote")) return "Le runtime agrège les choix et déclenche la résolution.";
  if (lower.includes("interrogatoire")) return "Dialogue ciblé entre humains et personnages IA.";
  return "Étape simulée dans le runtime généré.";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return map[char];
  });
}
