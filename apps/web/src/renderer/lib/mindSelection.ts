import type { MindContext } from '../../shared/types';

interface PreferredMind {
  readonly mindId?: string;
  readonly mindPath?: string;
}

export function normalizeMindPath(mindPath: string | undefined): string | null {
  if (!mindPath) return null;
  return mindPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function selectPreferredMind(
  loadedMinds: readonly MindContext[],
  preferred: PreferredMind | null | undefined,
): MindContext | null {
  if (preferred?.mindId) {
    const byId = loadedMinds.find((mind) => mind.mindId === preferred.mindId);
    if (byId) return byId;
  }

  const preferredPath = normalizeMindPath(preferred?.mindPath);
  if (preferredPath) {
    const byPath = loadedMinds.find((mind) => normalizeMindPath(mind.mindPath) === preferredPath);
    if (byPath) return byPath;
  }

  return loadedMinds[loadedMinds.length - 1] ?? null;
}
