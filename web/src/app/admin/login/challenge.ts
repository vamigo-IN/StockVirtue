/**
 * The pending sign-in between the password step and the code step. Kept in
 * sessionStorage (this tab only); the challenge id alone can't sign anyone in.
 */
export interface PendingChallenge {
  challengeId: string;
  sentTo: string;
  expiresAt: string;
  next: string;
}

const KEY = 'sv.newsroom.challenge';

export function saveChallenge(c: PendingChallenge) {
  sessionStorage.setItem(KEY, JSON.stringify(c));
}

export function loadChallenge(): PendingChallenge | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingChallenge) : null;
  } catch {
    return null;
  }
}

export function clearChallenge() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}
