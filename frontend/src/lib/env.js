/** Read Vite env vars (VITE_* prefix). */
export function env(name) {
  return import.meta.env[`VITE_${name}`];
}
