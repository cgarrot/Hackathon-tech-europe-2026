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
    expect(publicJson).not.toContain("teamOrSide");
    expect(publicJson).not.toContain("your hidden role is");
    expect(publicSession.ownPlayer).toMatchObject({
      participantId: "human_1",
      displayName: "Player 1",
      roleName: expect.any(String)
    });
  });

  it("sanitizes public AI identities that include hidden role labels", () => {
    const result = fixture();
    result.gameSpec.players = { total: 4, humans: 2, ai: 2 };
    result.package.personas = [
      {
        id: "ai_werewolf_voice",
        displayName: "AI 1 · Werewolf",
        speechStyle: "guarded",
        publicBackstory: "A quiet villager.",
        behaviorRules: ["Never reveal hidden role metadata."],
        sampleLines: ["I am watching the table carefully."]
      },
      {
        id: "seer_persona",
        displayName: "AI 2 · Seer",
        speechStyle: "careful",
        publicBackstory: "A wary villager.",
        behaviorRules: ["Stay indirect."],
        sampleLines: ["Someone changed their story."]
      }
    ];

    const session = createVoiceGameSession({ sessionId: "session-sanitize-ai", result });
    const publicSession = toPublicVoiceGameSession(session);
    const publicAiParticipants = publicSession.participants.filter((participant) => participant.kind === "ai");
    const publicSpeakerJson = JSON.stringify(publicSession.events.map((event) => event.speaker));

    expect(publicAiParticipants.map((participant) => participant.displayName)).toEqual(["AI 1", "AI 2"]);
    expect(publicAiParticipants.map((participant) => participant.personaId)).toEqual(["ai_1", "ai_2"]);
    expect(JSON.stringify(publicAiParticipants)).not.toContain("Werewolf");
    expect(JSON.stringify(publicAiParticipants)).not.toContain("Seer");
    expect(JSON.stringify(publicAiParticipants)).not.toContain("ai_werewolf_voice");
    expect(JSON.stringify(publicAiParticipants)).not.toContain("seer_persona");
    expect(publicSpeakerJson).not.toContain("Werewolf");
    expect(publicSpeakerJson).not.toContain("Seer");
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
    expect(publicSession.events.some((event) => event.text.includes("Transcript discarded"))).toBe(true);
  });

  it("attributes transcripts to the requested human participant during input windows", () => {
    const session = createVoiceGameSession({ sessionId: "session-transcript", result: fixture() });

    advanceVoiceGameSession(session);
    advanceVoiceGameSession(session, { participantId: "human_2", transcript: "Je protège le village." });
    const transcriptEvent = toPublicVoiceGameSession(session).events.find((event) => event.kind === "transcript_received");

    expect(transcriptEvent?.speaker.id).toBe("human_2");
    expect(transcriptEvent?.text).toBe("Je protège le village.");
  });

  it("analyzes spoken input and reuses it to build the next phase", () => {
    const session = createVoiceGameSession({ sessionId: "session-intent", result: fixture() });

    advanceVoiceGameSession(session);
    advanceVoiceGameSession(session, { participantId: "human_1", transcript: "J'inspecte Mireille parce qu'elle hésite." });
    const publicSession = toPublicVoiceGameSession(session);
    const analysisEvent = publicSession.events.find(
      (event) => event.kind === "state_updated" && event.phaseId === "night" && event.text.includes("Voice cue")
    );
    const continuationEvent = publicSession.events.find(
      (event) => event.kind === "state_updated" && event.phaseId === "day" && event.text.includes("Continuity seeded")
    );
    const personaReply = publicSession.events.find(
      (event) => event.kind === "utterance" && event.phaseId === "day" && event.speaker.kind === "persona"
    );

    expect(publicSession.activePhase.id).toBe("day");
    expect(analysisEvent?.text).toContain("seer inspect");
    expect(continuationEvent?.text).toContain("J'inspecte Mireille");
    expect(continuationEvent?.text).toContain("seer inspect");
    expect(personaReply?.text).toContain("Player 1");
    expect(personaReply?.text).toContain("J'inspecte Mireille");
    expect(session.lastPlayerIntent).toBeUndefined();
  });

  it("eliminates a named target from a werewolf night action", () => {
    const session = createVoiceGameSession({ sessionId: "session-night-elimination", result: fixture() });

    advanceVoiceGameSession(session);
    advanceVoiceGameSession(session, { participantId: "human_1", transcript: "Je tue Mireille cette nuit." });
    const publicSession = toPublicVoiceGameSession(session);
    const mireille = publicSession.participants.find((participant) => participant.displayName === "Mireille");

    expect(publicSession.status).toBe("running");
    expect(publicSession.activePhase.id).toBe("day");
    expect(mireille?.alive).toBe(false);
    expect(publicSession.events.some((event) => event.text.includes("Mireille is eliminated by the night action"))).toBe(true);
    expect(publicSession.pendingInput?.prompt).not.toContain("Mireille");
  });

  it("ends with village victory when the vote eliminates the wolf", () => {
    const session = createVoiceGameSession({ sessionId: "session-vote-victory", result: fixture() });

    advanceVoiceGameSession(session);
    advanceVoiceGameSession(session, { participantId: "human_2", transcript: "J'inspecte Mireille parce qu'elle hésite." });
    advanceVoiceGameSession(session, { participantId: "human_2", transcript: "Je vote contre Player 1." });
    const publicSession = toPublicVoiceGameSession(session);
    const playerOne = publicSession.participants.find((participant) => participant.id === "human_1");

    expect(playerOne?.alive).toBe(false);
    expect(publicSession.status).toBe("ended");
    expect(publicSession.events.some((event) => event.text.includes("Player 1 is eliminated by the table vote"))).toBe(true);
    expect(publicSession.events.some((event) => event.kind === "game_ended" && event.text.includes("Village victory"))).toBe(true);
  });

  it("generates a player response when an input window times out without speech", () => {
    const session = createVoiceGameSession({ sessionId: "session-timeout", result: fixture() });

    advanceVoiceGameSession(session);
    advanceVoiceGameSession(session, { participantId: "human_2" });
    const publicSession = toPublicVoiceGameSession(session);
    const generatedResponse = publicSession.events.find(
      (event) => event.kind === "utterance" && event.phaseId === "night" && event.speaker.kind === "player"
    );

    expect(generatedResponse?.speaker.id).toBe("human_2");
    expect(generatedResponse?.text).toBe("Doing my covert action quietly without revealing who I really am.");
    expect(publicSession.events.some((event) => event.text.includes("auto line filled for Player 2"))).toBe(true);
  });

  it("does not assign roles whose count is zero", () => {
    const result = fixture();
    result.gameSpec.rolesOrActors = [
      {
        id: "ghost_role",
        name: "Fantôme",
        teamOrSide: "spectators",
        count: 0,
        publicDescription: "Disabled role archetype.",
        privateGoal: "Never deal this card.",
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
    advanceVoiceGameSession(session, { transcript: "Night is wrapping up peacefully." });
    advanceVoiceGameSession(session, { transcript: "I vote tonight." });
    expect(session.status).toBe("ended");

    const eventCount = session.events.length;
    advanceVoiceGameSession(session, { transcript: "One more confession." });

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
        name: "Host",
        teamOrSide: "show",
        count: 1,
        publicDescription: "Keeps the round ticking.",
        privateGoal: "Maintain tempo between beats.",
        abilities: ["Ask a scripted question."]
      },
      {
        id: "contestant",
        name: "Contestant",
        teamOrSide: "players",
        count: 3,
        publicDescription: "Answers rapid-fire trivia.",
        privateGoal: "Score every possible point.",
        abilities: ["Buzz in with clarity."]
      }
    ];
    result.gameSpec.phases = [
      { id: "question", name: "Quick question", purpose: "Read a general-knowledge teaser.", allowedActions: ["answer"], next: "score" },
      { id: "score", name: "Scoreboard", purpose: "Update the leaderboard.", allowedActions: ["score_round"], next: "" }
    ];
    result.package.personas = [
      {
        id: "ai_host",
        displayName: "Nova",
        speechStyle: "bright and kinetic",
        publicBackstory: "Futuristic trivia host hologram.",
        behaviorRules: ["Stay concise.", "Celebrate near-misses."],
        sampleLines: ["Buzz in—five seconds starts now."]
      }
    ];

    const session = createVoiceGameSession({ sessionId: "session-quiz", result });
    const publicSession = toPublicVoiceGameSession(session);
    const personaEvent = publicSession.events.find((event) => event.kind === "utterance" && event.speaker.kind === "persona");
    const publicJson = JSON.stringify(publicSession);

    expect(personaEvent?.speaker.personaId).toBe("ai_host");
    expect(personaEvent?.speaker.speechStyle).toBe("bright and kinetic");
    expect(personaEvent?.text).toContain("Buzz in—five seconds starts now.");
    expect(publicJson).toContain("Buzz in—five seconds starts now.");
    expect(publicJson).not.toContain("village");
  });

  it("selects generated persona sample lines by phase instead of repeating the first line", () => {
    const result = fixture();
    result.gameSpec.phases = [
      { id: "question", name: "Lightning clue", purpose: "Drop a teaser question.", allowedActions: ["answer"], next: "score" },
      { id: "score", name: "Final tally", purpose: "Project the leaderboard.", allowedActions: ["score_round"], next: "" }
    ];
    result.package.personas = [
      {
        id: "ai_host",
        displayName: "Nova",
        speechStyle: "bright kinetic host",
        publicBackstory: "Futurist quiz MC.",
        behaviorRules: ["Keep cadence taut."],
        sampleLines: [
          "[urgent] Lightning clue—lock your answer!",
          "[warm] Leaderboard climbs while momentum stays electric."
        ]
      }
    ];

    const session = createVoiceGameSession({ sessionId: "session-phase-lines", result });
    const firstPersonaLine = toPublicVoiceGameSession(session).events.find((event) => event.kind === "utterance" && event.speaker.kind === "persona")?.text;
    advanceVoiceGameSession(session);
    const personaLines = toPublicVoiceGameSession(session).events
      .filter((event) => event.kind === "utterance" && event.speaker.kind === "persona")
      .map((event) => event.text);

    expect(firstPersonaLine).toBe("[urgent] Lightning clue—lock your answer!");
    expect(personaLines).toContain("[warm] Leaderboard climbs while momentum stays electric.");
  });

  it("ends looping phase graphs before unbounded event growth", () => {
    const result = fixture();
    result.gameSpec.phases = [
      { id: "loop", name: "Tight loop", purpose: "Exercise session caps.", allowedActions: ["wait"], next: "loop" }
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
