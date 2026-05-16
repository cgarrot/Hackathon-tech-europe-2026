export const voiceExamples = [
  "Je veux jouer à un jeu de loup-garou dans un village médiéval, 8 joueurs dont 2 IA, avec une voyante et une sorcière.",
  "Je veux un jeu d’enquête policière, un meurtre dans un manoir, 6 suspects dont 3 IA, un détective humain.",
  "Je veux un jeu de survie sur une île, 10 joueurs, élimination chaque tour, les IA sont des éléments naturels hostiles.",
  "I want a philosophy debate game with 4 AIs as Socrates, Nietzsche, Simone Weil and Kanye West, and the audience votes."
];

export async function compileGameRequest({ transcript }) {
  const inferred = inferRequest(transcript);
  return createPseudoGame({
    prompt: transcript,
    language: inferred.language,
    players: inferred.players,
    aiPlayers: inferred.aiPlayers
  });
}

export function inferRequest(prompt) {
  const lower = prompt.toLowerCase();
  const englishSignals = ["i want", "game", "players", "audience", "debate"];
  const language = englishSignals.some((signal) => lower.includes(signal)) ? "en" : "fr";
  const players = firstNumberBefore(lower, ["joueurs", "players"]) || (lower.includes("débat") ? 4 : 8);
  const aiPlayers = firstNumberBefore(lower, ["ia", "ai", "ais"]) || inferAiCount(lower);
  return { language, players, aiPlayers };
}

function firstNumberBefore(text, words) {
  for (const word of words) {
    const match = text.match(new RegExp(`(\\d+)\\s+${word}`));
    if (match) return Number(match[1]);
  }
  return null;
}

function inferAiCount(text) {
  if (text.includes("dont 2 ia") || text.includes("2 ai")) return 2;
  if (text.includes("3 ia") || text.includes("3 ai")) return 3;
  if (text.includes("4 ia") || text.includes("4 ai")) return 4;
  return 2;
}

function createPseudoGame({ prompt, language, players, aiPlayers }) {
  const lower = prompt.toLowerCase();
  const isWerewolf = lower.includes("loup") || lower.includes("garou") || lower.includes("werewolf");
  const isMystery = lower.includes("enquête") || lower.includes("meurtre") || lower.includes("manoir");
  const isSurvival = lower.includes("survie") || lower.includes("île") || lower.includes("battle");
  const isDebate = lower.includes("débat") || lower.includes("debate");

  if (isMystery) {
    return baseGame({
      title: "Meurtre au Manoir d’Orme",
      genre: "Enquête sociale",
      prompt,
      language,
      players,
      aiPlayers,
      roles: [
        ["Détective", "Humain", "Interroge, recoupe et accuse."],
        ["Héritier", "IA", "Cache un mobile financier."],
        ["Gouvernante", "IA", "Connaît les horaires du manoir."],
        ["Médecin", "IA", "Peut confirmer ou brouiller la cause de mort."]
      ],
      phases: ["Briefing", "Interrogatoires", "Révélation d’indice", "Accusation finale"]
    });
  }

  if (isSurvival) {
    return baseGame({
      title: "Dernier Feu sur l’Île",
      genre: "Survie narrative",
      prompt,
      language,
      players,
      aiPlayers,
      roles: [
        ["Explorateur", "Humain", "Cherche eau, abri et alliances."],
        ["Tempête", "IA", "Force les déplacements."],
        ["Famine", "IA", "Réduit les ressources."],
        ["Prédateur", "IA", "Punit les joueurs isolés."]
      ],
      phases: ["Aube", "Exploration", "Crise", "Élimination"]
    });
  }

  if (isDebate) {
    return baseGame({
      title: language === "en" ? "The Agora Engine" : "L’Agora Vivante",
      genre: language === "en" ? "Philosophical debate" : "Débat philosophique",
      prompt,
      language,
      players,
      aiPlayers,
      roles: [
        ["Socrate", "IA", "Questionne chaque prémisse."],
        ["Nietzsche", "IA", "Attaque les consensus moraux."],
        ["Simone Weil", "IA", "Ramène le débat vers l’attention et la justice."],
        ["Public", "Humain", "Vote après chaque échange."]
      ],
      phases: ["Thèse", "Objections", "Réplique", "Vote"]
    });
  }

  return baseGame({
    title: isWerewolf ? "Les Ombres de Valbrume" : "Jeu généré GameForge",
    genre: isWerewolf ? "Déduction sociale" : "Prototype narratif",
    prompt,
    language,
    players,
    aiPlayers,
    roles: [
      ["Loup-garou", "IA ou humain", "Élimine un villageois chaque nuit et ment le jour."],
      ["Villageois", "Humain", "Observe les contradictions et vote."],
      ["Voyante", "Humain ou IA", "Sonde secrètement un rôle par nuit."],
      ["Sorcière", "Humain ou IA", "Dispose d’une potion de vie et d’une potion de mort."]
    ],
    phases: ["Nuit", "Réveil", "Débat", "Vote", "Résolution"]
  });
}

function baseGame({ title, genre, prompt, language, players, aiPlayers, roles, phases }) {
  return {
    schemaVersion: "gameforge.web-input.v1",
    title,
    genre,
    prompt,
    language,
    players,
    aiPlayers,
    createdAt: new Date().toISOString(),
    roles: roles.map(([name, controller, rule], index) => ({
      id: slugify(name),
      name,
      controller,
      rule,
      palette: palettes[index % palettes.length]
    })),
    phases,
    integrations: [
      ["OpenAI", "Règles, phases, conditions de victoire et logique de partie.", true],
      ["Pioneer", "Prompts et mémoire des personas IA.", false],
      ["fal", "Décors, cartes de rôle, portraits et ambiances.", false],
      ["Gradium", "STT joueur, TTS des IA et effets audio.", false]
    ].map(([name, description, ready]) => ({ name, description, ready }))
  };
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const palettes = [
  ["#263a33", "#8a3a47"],
  ["#315a4a", "#c8832d"],
  ["#2d3b58", "#6e8fb5"],
  ["#46334b", "#b47b62"]
];
