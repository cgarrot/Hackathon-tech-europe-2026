import { randomUUID } from "node:crypto";
import type { ForgeResult } from "@/compiler/schemas";
import {
  advanceVoiceGameSession,
  createVoiceGameSession,
  toPublicVoiceGameSession,
  type AdvanceVoiceGameInput,
  type VoiceGamePublicSession,
  type VoiceGameSession
} from "./voice-game-engine";

const MAX_STORED_SESSIONS = 50;

const sessions = new Map<string, VoiceGameSession>();

function rememberSession(session: VoiceGameSession) {
  sessions.set(session.sessionId, session);
  while (sessions.size > MAX_STORED_SESSIONS) {
    const oldestSessionId = sessions.keys().next().value;
    if (!oldestSessionId) {
      return;
    }
    sessions.delete(oldestSessionId);
  }
}

export function createStoredVoiceGameSession(result: ForgeResult): VoiceGamePublicSession {
  const session = createVoiceGameSession({ sessionId: randomUUID(), result });
  rememberSession(session);
  return toPublicVoiceGameSession(session);
}

export function readStoredVoiceGameSession(sessionId: string): VoiceGamePublicSession | null {
  const session = sessions.get(sessionId);
  return session ? toPublicVoiceGameSession(session) : null;
}

export function advanceStoredVoiceGameSession(sessionId: string, input: AdvanceVoiceGameInput = {}): VoiceGamePublicSession | null {
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  advanceVoiceGameSession(session, input);
  rememberSession(session);
  return toPublicVoiceGameSession(session);
}

export function resetVoiceGameSessionStoreForTests() {
  sessions.clear();
}
