/* Связь с игровой площадкой (CrazyGames SDK v3). Без SDK — пустые заглушки: обычная сборка
   и артефакт работают как раньше. Вызовы до окончания SDK.init() запоминаются и отправляются после. */
let sdk = null, ready = false, loading = false, gameplay = false;
const sent = { loading: false, gameplay: false };

export async function initPlatform() {
  const s = typeof window !== "undefined" && window.CrazyGames && window.CrazyGames.SDK;
  if (!s) return;
  try { await s.init(); sdk = s; ready = true; flush(); } catch (e) { console.warn("CrazyGames SDK:", e && e.message); }
}
function flush() {
  if (!ready) return;
  try {
    if (sent.loading !== loading) { sent.loading = loading; loading ? sdk.game.loadingStart() : sdk.game.loadingStop(); }
    if (sent.gameplay !== gameplay) { sent.gameplay = gameplay; gameplay ? sdk.game.gameplayStart() : sdk.game.gameplayStop(); }
  } catch (e) { /* площадка недоступна — игра продолжает работать */ }
}
export function setLoading(on) { loading = on; flush(); }
/* активная игра (не главное меню и не пауза) */
export function setGameplay(on) { if (on === gameplay) return; gameplay = on; flush(); }
/* радостный момент: самолёт принят ОТК, повышение в должности */
export function happy() { if (ready) { try { sdk.game.happytime(); } catch (e) { /* нет */ } } }
