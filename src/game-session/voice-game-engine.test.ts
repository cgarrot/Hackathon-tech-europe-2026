import { describe, expect, it } from "vitest";
import { validForgeResult } from "@/test/forge-fixture";
import { advanceVoiceGameSession, createVoiceGameSession, toPublicVoiceGameSession } from "./voice-game-engine";

function fixture() {
  return structuredClone(validForgeResult);
}

describe("voice-game-engine", () => {
  it("keeps role assignments out of the public session", () => {
    const session = createVoiceGameSession({ sessionId: "session-public", result: fixture() });
    const publicSession = toPublicVoiceGameSession(session);
    const publicJson = JSON.stringify(publicSession);

    expect(publicSession.events.every((event) => event.visibility === "public")).toBe(true);
    expect(publicJson).not.toContain("roleId");
    expect(publicJson).not.toContain("ton rôle secret");
    expect(publicJson).not.toContain("ton role secret");
    expect(publicSession.ownPlayer).toMatchObject({
      participantId: "human_1",
      displayName: "Joueur 1",
      roleName: expect.any(String)
    });
  });

  it("opens voice input windows for werewolf night actions", () => {
    const session = createVoiceGameSession({ sessionId: "session-night", result: fixture() });

    advanceVoiceGameSession(session);
    const publicSession = toPublicVoiceGameSession(session);

    expect(publicSession.activePhase.id).toBe("night");
    expect(publicSession.pendingInput?.durationSec).toBeLessThanOrEqual(30);
    expect(publicSession.pendingInput?.expectedActions).toEqual(["werewolf_kill", "seer_inspect"]);
    expect(publicSession.events.some((event) => event.kind === "input_window" && event.phaseId === "night")).toBe(true);
  });

  it("does not record transcripts when no input window is open", () => {
    const session = createVoiceGameSession({ sessionId: "session-no-window", result: fixture() });

    advanceVoiceGameSession(session, { transcript: "Je vote contre Mireille." });
    const publicSession = toPublicVoiceGameSession(session);

    expect(publicSession.events.some((event) => event.kind === "transcript_received")).toBe(false);
    expect(publicSession.events.some((event) => event.text.includes("Transcript ignoré"))).toBe(true);
  });

  it("attributes transcripts to the requested human participant during input windows", () => {
    const session = createVoiceGameSession({ sessionId: "session-transcript", result: fixture() });

    advanceVoiceGameSession(session);
    advanceVoiceGameSession(session, { participantId: "human_2", transcript: "Je protège le village." });
    const transcriptEvent = toPublicVoiceGameSession(session).events.find((event) => event.kind === "transcript_received");

    expect(transcriptEvent?.speaker.id).toBe("human_2");
    expect(transcriptEvent?.text).toBe("Je protège le village.");
  });

  it("does not assign roles whose count is zero", () => {
    const result = fixture();
    result.gameSpec.rolesOrActors = [
      {
        id: "ghost_role",
        name: "Fantôme",
        teamOrSide: "spectators",
        count: 0,
        publicDescription: "Un rôle désactivé.",
        privateGoal: "Ne jamais être distribué.",
        abilities: []
      },
      ...result.gameSpec.rolesOrActors
    ];

    const session = createVoiceGameSession({ sessionId: "session-zero-count", result });

    expect(JSON.stringify(session.participants)).not.toContain("ghost_role");
  });

  it("does not append events after a session has ended", () => {
    const session = createVoiceGameSession({ sessionId: "session-ended", result: fixture() });

    advanceVoiceGameSession(session);
    advanceVoiceGameSession(session, { transcript: "La nuit est terminée." });
    advanceVoiceGameSession(session, { transcript: "Je vote maintenant." });
    expect(session.status).toBe("ended");

    const eventCount = session.events.length;
    advanceVoiceGameSession(session, { transcript: "Encore une phrase." });

    expect(session.events).toHaveLength(eventCount);
  });

  it("uses generated persona lines instead of hardcoded werewolf narration for other game packs", () => {
    const result = fixture();
    result.intake.gameFamily = "quiz_party";
    result.intake.primaryMechanics = ["score_rounds", "ai_personas"];
    result.routing.selectedPack = "quiz";
    result.routing.selectedFamily = "quiz_party";
    result.gameSpec.family = "quiz_party";
    result.gameSpec.pack = "quiz";
    result.gameSpec.theme = "Studio quiz futuriste";
    result.gameSpec.mechanics = ["score_rounds", "ai_personas"];
    result.gameSpec.rolesOrActors = [
      {
        id: "host",
        name: "Animateur",
        teamOrSide: "show",
        count: 1,
        publicDescription: "Anime la manche.",
        privateGoal: "Maintenir le rythme.",
        abilities: ["Poser une question"]
      },
      {
        id: "contestant",
        name: "Candidate",
        teamOrSide: "players",
        count: 3,
        publicDescription: "Répond aux questions.",
        privateGoal: "Marquer des points.",
        abilities: ["Répondre"]
      }
    ];
    result.gameSpec.phases = [
      { id: "question", name: "Question rapide", purpose: "Lire une question de culture générale.", allowedActions: ["answer"], next: "score" },
      { id: "score", name: "Score", purpose: "Afficher les points.", allowedActions: ["score_round"], next: "" }
    ];
    result.package.personas = [
      {
        id: "ai_host",
        displayName: "Nova",
        speechStyle: "énergique et clair",
        publicBackstory: "Animatrice de quiz futuriste.",
        behaviorRules: ["Reste concise."],
        sampleLines: ["Top chrono, donne ta meilleure réponse !"]
      }
    ];

    const session = createVoiceGameSession({ sessionId: "session-quiz", result });
    const publicSession = toPublicVoiceGameSession(session);
    const personaEvent = publicSession.events.find((event) => event.kind === "utterance" && event.speaker.kind === "persona");
    const publicJson = JSON.stringify(publicSession);

    expect(personaEvent?.speaker.personaId).toBe("ai_host");
    expect(personaEvent?.speaker.speechStyle).toBe("énergique et clair");
    expect(personaEvent?.text).toContain("Top chrono, donne ta meilleure réponse !");
    expect(publicJson).toContain("Top chrono, donne ta meilleure réponse !");
    expect(publicJson).not.toContain("village");
    expect(publicJson).not.toContain("cache forcément");
  });

  it("selects generated persona sample lines by phase instead of repeating the first line", () => {
    const result = fixture();
    result.gameSpec.phases = [
      { id: "question", name: "Question rapide", purpose: "Poser une question.", allowedActions: ["answer"], next: "score" },
      { id: "score", name: "Score final", purpose: "Afficher le score.", allowedActions: ["score_round"], next: "" }
    ];
    result.package.personas = [
      {
        id: "ai_host",
        displayName: "Nova",
        speechStyle: "énergique et clair",
        publicBackstory: "Animatrice de quiz futuriste.",
        behaviorRules: ["Reste concise."],
        sampleLines: [
          "[urgent] Question éclair: donne ta réponse maintenant !",
          "[warm] Score validé, le rythme reste haut."
        ]
      }
    ];

    const session = createVoiceGameSession({ sessionId: "session-phase-lines", result });
    const firstPersonaLine = toPublicVoiceGameSession(session).events.find((event) => event.kind === "utterance" && event.speaker.kind === "persona")?.text;
    advanceVoiceGameSession(session);
    const personaLines = toPublicVoiceGameSession(session).events
      .filter((event) => event.kind === "utterance" && event.speaker.kind === "persona")
      .map((event) => event.text);

    expect(firstPersonaLine).toBe("[urgent] Question éclair: donne ta réponse maintenant !");
    expect(personaLines).toContain("[warm] Score validé, le rythme reste haut.");
  });

  it("ends looping phase graphs before unbounded event growth", () => {
    const result = fixture();
    result.gameSpec.phases = [
      { id: "loop", name: "Boucle courte", purpose: "Tester la limite de session.", allowedActions: ["wait"], next: "loop" }
    ];

    const session = createVoiceGameSession({ sessionId: "session-loop", result });
    for (let index = 0; index < 20; index += 1) {
      advanceVoiceGameSession(session);
    }

    expect(session.status).toBe("ended");
    expect(session.round).toBe(12);
    expect(session.events.length).toBeLessThanOrEqual(240);
  });
});
