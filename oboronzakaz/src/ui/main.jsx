/* Точка входа: тема, загрузка автосохранения (если есть), отрисовка, горячее обновление в просмотрщике артефактов. */
import { render } from "preact";
import { App } from "./App.jsx";
import { S, update, applyTheme, savedTheme, serialize, deserialize } from "./store.js";

function start(data) {
  const th = savedTheme();
  if (th === "light" || th === "dark") applyTheme(th);
  if (data && data.save) {
    try { S.G = deserialize(data.save); S.ui.screen = data.screen || "dash"; } catch (e) { S.G = null; }
  }
  render(<App />, document.getElementById("app"));
  update();
}

// просмотрщик артефактов умеет сохранять состояние при обновлении страницы
try {
  const hot = typeof window !== "undefined" && window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => (S.G ? { save: serialize(S.G), screen: S.ui.screen } : {}));
  if (hot && hot.ready) hot.ready(start);
  else start(hot && hot.data ? hot.data : {});
} catch (e) {
  start({});
}
