# Where will we meet her? — /meet/

Второй сайт в той же атмосфере, что и голосование. Вместо вариантов — два поля:
**answer** (своё место) и **email** (куда прислать ответ). После отправки — `We’ll meet soon.`

Ответы пишутся в файл `responses.json` в репозитория (вместе с почтой), чтобы ты мог
написать им ответ.

## Установка

1. Скопируй папку `meet/` в корень своего репозитория.
   Сайт будет доступен по адресу `https://твой-логин.github.io/твой-репо/meet/`.
2. Скопируй `meet/responses.json` в **корень репозитория** (рядом с `votes.json`).
   Worker будет писать именно туда. Если файла не будет — Worker создаст его сам.
3. Обнови код Worker (файл `worker.js` из первой части) — там добавлен эндпоинт `/answer`.
   В Cloudflare: **Edit code → вставить → Deploy**.
4. В **Settings → Variables and Secrets** Worker'а добавь переменную:
   - `RESPONSE_FILE` → Variable → `responses.json`
   
   Остальные переменные (`GITHUB_TOKEN`, `OWNER`, `REPO`, `BRANCH`, `FILE_PATH`) уже должны быть заполнены.
5. В `meet/config.js` укажи адрес Worker:

```js
window.VOTE_CONFIG = {
  workerUrl: "https://твой-worker.workers.dev/answer",
  firstWhisper: "// she waits for a place",
  finalWhisper: "// the promise has been written down"
};
```

6. Закоммить и подождать 1–2 минуты.

## Проверка

- `https://твой-worker.workers.dev/debug` — в отчёте появится поле `file_responses.json`
  со статусом `200`.
- `https://твой-логин.github.io/твой-репо/meet/?debug=1` — панель диагностики внизу страницы.

## Куда приходят ответы

В `responses.json`:

```json
{
  "responses": [
    {
      "answer": "the old chapel",
      "email": "someone@example.com",
      "id": "a-...",
      "time": "2026-11-23T..."
    }
  ],
  "voters": ["a-..."]
}
```

## Защита от повторной отправки

- `localStorage` (`weird_answer_sent`, `weird_voter_id`) — блокировка после перезагрузки.
- `voterId` дополнительно пишется в `voters` в `responses.json` и проверяется Worker'ом.

⚠️ Обрати внимание: адрес в поле `email` виден всем, у кого есть доступ к репозиторию.
Если репозиторий публичный, **не храни почты в нём долго** — после рассылки лучше очистить
`responses.json` и закоммитить пустой файл. Либо сделай репозиторий приватным.
