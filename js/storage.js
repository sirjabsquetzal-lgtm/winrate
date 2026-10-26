// Persistencia en localStorage con objeto versionado.
import { defaultState, migrate } from "./logic.js";

export const STORAGE_KEY = "winrate.v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return migrate(JSON.parse(raw));
  } catch (err) {
    console.warn("[WinRate] No se pudo leer el estado:", err);
    return defaultState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.warn("[WinRate] No se pudo guardar el estado:", err);
    return false;
  }
}

export function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn("[WinRate] No se pudo borrar el estado:", err);
  }
}
