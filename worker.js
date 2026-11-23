/*
 * Cloudflare Worker — прокси для голосования и для ответов.
 * Токен GitHub хранится в Secrets этого Worker, а НЕ в публичном репозитории.
 *
 * Переменные окружения (Settings → Variables and Secrets):
 *   GITHUB_TOKEN   (Secret)   — Personal Access Token с Contents: read/write
 *   OWNER          (Variable) — владелец репозитория
 *   REPO           (Variable) — название репозитория
 *   BRANCH         (Variable) — ветка, например main
 *   FILE_PATH      (Variable) — файл голосования, например votes.json
 *   RESPONSE_FILE  (Variable) — файл ответов, например responses.json
 *
 * Маршруты:
 *   GET  /          → состояние голосования
 *   POST /          → голос
 *   GET  /answer    → состояние ответов
 *   POST /answer    → { answer, email, voterId } → записать ответ
 *   GET  /debug     → диагностика (токен не показывается)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

function ghHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "arg-worker",
  };
}

function contentsUrl(env, path) {
  return `https://api.github.com/repos/${env.OWNER}/${env.REPO}/contents/${path}`;
}

async function brief(res) {
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch (e) { body = text.slice(0, 300); }
  return { status: res.status, body };
}

async function readContents(env, path) {
  const url = `${contentsUrl(env, path)}?ref=${env.BRANCH}`;
  const res = await fetch(url, { headers: ghHeaders(env) });

  if (res.status === 404) {
    return { data: null, sha: null, missing: true, url };
  }
  if (!res.ok) {
    const info = await brief(res);
    throw new Error(`GitHub read ${info.status}: ${JSON.stringify(info.body)} (${url})`);
  }

  const meta = await res.json();
  const binary = atob(String(meta.content).replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const data = JSON.parse(new TextDecoder().decode(bytes));
  return { data, sha: meta.sha, missing: false, url };
}

async function writeContents(env, path, data, sha, message) {
  const encoded = new TextEncoder().encode(JSON.stringify(data, null, 2) + "\n");
  let binary = "";
  encoded.forEach((b) => { binary += String.fromCharCode(b); });

  const body = {
    message: message || "arg: update record",
    content: btoa(binary),
    branch: env.BRANCH,
  };
  if (sha) body.sha = sha;

  const url = contentsUrl(env, path);
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const info = await brief(res);
    throw new Error(
      `GitHub write ${info.status} at ${url} (branch=${env.BRANCH}, file=${path}, ` +
      `sha=${sha || "none"}): ${JSON.stringify(info.body)}`
    );
  }
  return res.json();
}

function voteFile(env) {
  return env.FILE_PATH || "votes.json";
}

function responseFile(env) {
  return env.RESPONSE_FILE || "responses.json";
}

async function debugReport(env) {
  const report = {
    env: {
      OWNER: env.OWNER,
      REPO: env.REPO,
      BRANCH: env.BRANCH,
      FILE_PATH: voteFile(env),
      RESPONSE_FILE: responseFile(env),
      tokenPrefix: env.GITHUB_TOKEN ? env.GITHUB_TOKEN.slice(0, 7) + "..." : "MISSING",
      tokenLength: env.GITHUB_TOKEN ? env.GITHUB_TOKEN.length : 0,
    },
  };

  const userRes = await fetch("https://api.github.com/user", { headers: ghHeaders(env) });
  report.auth = await brief(userRes);
  if (userRes.ok) {
    const me = await userRes.json().catch(() => ({}));
    report.auth.login = me.login;
  }

  const repoRes = await fetch(`https://api.github.com/repos/${env.OWNER}/${env.REPO}`, {
    headers: ghHeaders(env),
  });
  report.repo = await brief(repoRes);

  const branchRes = await fetch(
    `https://api.github.com/repos/${env.OWNER}/${env.REPO}/branches/${env.BRANCH}`,
    { headers: ghHeaders(env) }
  );
  report.branch = await brief(branchRes);

  for (const path of [voteFile(env), responseFile(env)]) {
    const fileRes = await fetch(`${contentsUrl(env, path)}?ref=${env.BRANCH}`, {
      headers: ghHeaders(env),
    });
    report["file_" + path] = await brief(fileRes);
  }

  return report;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/debug") {
        return json(await debugReport(env));
      }

      // --- ответы (weird route) ------------------------------------------
      if (url.pathname === "/answer") {
        if (request.method === "GET") {
          const { data, missing } = await readContents(env, responseFile(env));
          const safe = data || { responses: [], voters: [] };
          return json({ ...safe, _fileFound: !missing });
        }

        if (request.method === "POST") {
          const payload = await request.json();
          const answer = typeof payload.answer === "string" ? payload.answer.trim() : "";
          const email = typeof payload.email === "string" ? payload.email.trim() : "";
          const voterId = payload.voterId;

          if (!answer || answer.length > 500) {
            return json({ error: "invalid answer" }, 400);
          }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
            return json({ error: "invalid email" }, 400);
          }
          if (typeof voterId !== "string" || !voterId) {
            return json({ error: "missing voterId" }, 400);
          }

          const { data, sha } = await readContents(env, responseFile(env));
          const store = data || { responses: [], voters: [] };
          if (!store.responses) store.responses = [];
          if (!store.voters) store.voters = [];

          if (store.voters.includes(voterId)) {
            return json({ ok: false, already: true, count: store.responses.length });
          }

          store.responses.push({
            answer: answer,
            email: email,
            id: voterId,
            time: new Date().toISOString(),
          });
          store.voters.push(voterId);

          await writeContents(env, responseFile(env), store, sha, "arg: record answer");
          return json({ ok: true, count: store.responses.length });
        }

        return json({ error: "method not allowed" }, 405);
      }
      // ---- голосование ---------------------------------------------------
      if (request.method === "GET") {
        const { data, missing } = await readContents(env, voteFile(env));
        const safe = data || { votes: { golden: 0, keeper: 0 }, voters: [] };
        return json({ ...safe, _fileFound: !missing });
      }

      if (request.method === "POST") {
        const payload = await request.json();
        const choice = payload.choice;
        const voterId = payload.voterId;

        if (choice !== "golden" && choice !== "keeper") {
          return json({ error: "invalid choice" }, 400);
        }
        if (typeof voterId !== "string" || !voterId) {
          return json({ error: "missing voterId" }, 400);
        }

        const { data, sha } = await readContents(env, voteFile(env));
        const store = data || { votes: { golden: 0, keeper: 0 }, voters: [] };
        if (!store.votes) store.votes = { golden: 0, keeper: 0 };
        if (!store.voters) store.voters = [];

        if (store.voters.includes(voterId)) {
          return json({ ok: false, already: true, data: store });
        }

        store.votes[choice] = (store.votes[choice] || 0) + 1;
        store.voters.push(voterId);
        await writeContents(env, voteFile(env), store, sha, "arg: record vote");

        return json({ ok: true, data: store });
      }

      return json({ error: "method not allowed" }, 405);
    } catch (err) {
      return json({ error: String((err && err.message) || err) }, 500);
    }
  },
};
