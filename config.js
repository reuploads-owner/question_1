/*
 * Настройки подключения.
 *
 * ВАЖНО: публичный репозиторий автоматически отзывает любой токен, который
 * в него закоммичен. Поэтому для GitHub Pages используй mode: "worker"
 * (инструкция в README.md). Токен лежит в секретах Cloudflare Worker,
 * а не в этом файле.
 */
window.VOTE_CONFIG = {
  // "worker" — рекомендуется для публичного репозитория
  // "token"  — только если репозиторий приватный или токен не в репозитории
  mode: "worker",

  // Адрес твоего Cloudflare Worker: https://xxx.workers.dev
  workerUrl: "YOUR_WORKER_URL",

  // Эти поля нужны только для mode: "token"
  owner: "YOUR_GITHUB_USERNAME",
  repo: "YOUR_REPO_NAME",
  branch: "main",
  filePath: "votes.json",
  token: "YOUR_PERSONAL_ACCESS_TOKEN"
};
