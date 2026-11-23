/*
 * Настройки второго сайта (/meet/).
 * Использует тот же Cloudflare Worker, что и голосование, но эндпоинт /answer.
 * Секретов в этом файле нет.
 */
window.VOTE_CONFIG = {
  workerUrl: "https://voter.sigmadehuk.workers.dev/answer",

  // Необязательные подписи (оставляй как есть)
  firstWhisper: "// she waits for a place",
  finalWhisper: "// the promise has been written down"
};
