(function () {
  "use strict";

  var cfg = window.VOTE_CONFIG || {};
  var mode = cfg.mode || "token"; // "token" | "worker"
  var owner = cfg.owner;
  var repo = cfg.repo;
  var branch = cfg.branch || "main";
  var filePath = cfg.filePath || "votes.json";
  var token = cfg.token ? String(cfg.token).trim() : "";
  var workerUrl = cfg.workerUrl ? String(cfg.workerUrl).trim() : "";

  var VOTE_KEY = "arg_vote_choice";
  var ID_KEY = "arg_voter_id";

  var questionEl = document.getElementById("question");
  var optionsEl = document.getElementById("options");
  var resultEl = document.getElementById("result");
  var resultNoteEl = document.getElementById("result-note");
  var systemEl = document.getElementById("system-line");
  var errorEl = document.getElementById("error");
  var errorDetailEl = document.getElementById("error-detail");
  var footerEl = document.getElementById("footer");

  var voterId = localStorage.getItem(ID_KEY);
  if (!voterId) {
    voterId = "v-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(ID_KEY, voterId);
  }

  // ?debug=1 shows connection diagnostics on the page.
  var debugMode = /[?&]debug=1/.test(window.location.search);
  function debugLog(message) {
    var box = document.getElementById("debug");
    if (!debugMode || !box) return;
    box.classList.remove("hidden");
    var line = document.createElement("p");
    line.textContent = "> " + message;
    box.appendChild(line);
  }

  function apiHeaders() {
    return {
      "Authorization": "Bearer " + token,
      "Accept": "application/vnd.github+json"
    };
  }

  function explain(res, body) {
    var text = String(body || "");
    if (res.status === 401) {
      return "401 Bad credentials — token is invalid/expired/revoked. GitHub auto-revokes " +
             "tokens pushed to PUBLIC repos. Use mode: 'worker' (see README). Detail: " + text;
    }
    if (res.status === 403) {
      return "403 Forbidden — rate limit or missing permissions. Detail: " + text;
    }
    if (res.status === 404) {
      return "404 Not Found — check owner / repo / branch / filePath, or the token has no " +
             "Contents:write on this repo. Detail: " + text;
    }
    return "API " + res.status + ": " + text;
  }

  function toBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var binary = "";
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function fromBase64(b64) {
    var binary = atob(String(b64).replace(/\s/g, ""));
    var bytes = Uint8Array.from(binary, function (c) { return c.charCodeAt(0); });
    return new TextDecoder().decode(bytes);
  }

  function emptyData() {
    return { votes: { golden: 0, keeper: 0 }, voters: [] };
  }

  function setText(el, text) {
    if (el._typeTimer) clearInterval(el._typeTimer);
    el.textContent = text;
  }

  function typeText(el, text, speed) {
    if (el._typeTimer) clearInterval(el._typeTimer);
    el.textContent = "";
    var i = 0;
    el._typeTimer = setInterval(function () {
      el.textContent += text.charAt(i);
      i++;
      if (i >= text.length) clearInterval(el._typeTimer);
    }, speed || 40);
  }

  // --- read current state -------------------------------------------------
  async function readState() {
    if (mode === "worker") {
      if (!workerUrl) throw new Error("workerUrl is empty in config.js");
      var wr = await fetch(workerUrl, { headers: { "Accept": "application/json" } });
      if (!wr.ok) throw new Error("Vote service " + wr.status + ": " + (await wr.text()));
      var wj = await wr.json();
      debugLog("worker state OK");
      return { data: wj, sha: null };
    }

    var url = "https://api.github.com/repos/" + owner + "/" + repo +
      "/contents/" + filePath + "?ref=" + branch;
    var res = await fetch(url, { headers: apiHeaders() });
    if (res.status === 404) {
      debugLog("file not found, will create: " + filePath);
      return { data: emptyData(), sha: null };
    }
    if (!res.ok) throw new Error(await explain(res, await res.text()));
    var json = await res.json();
    debugLog("file read OK sha=" + json.sha);
    return { data: JSON.parse(fromBase64(json.content)), sha: json.sha };
  }

  // --- write vote ---------------------------------------------------------
  async function writeVote(data, sha, choice) {
    if (mode === "worker") {
      var wr = await fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice: choice, voterId: voterId })
      });
      if (!wr.ok) throw new Error("Vote service " + wr.status + ": " + (await wr.text()));
      debugLog("worker vote OK");
      return wr.json();
    }

    var url = "https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + filePath;
    var body = {
      message: "arg: record vote",
      content: toBase64(JSON.stringify(data, null, 2) + "\n"),
      branch: branch
    };
    if (sha) body.sha = sha;
    var res = await fetch(url, {
      method: "PUT",
      headers: Object.assign({}, apiHeaders(), { "Content-Type": "application/json" }),
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await explain(res, await res.text()));
    debugLog("file saved OK");
    return res.json();
  }

  async function testAuth() {
    if (mode === "worker") return;
    var res = await fetch("https://api.github.com/user", { headers: apiHeaders() });
    if (!res.ok) throw new Error(await explain(res, await res.text()));
    var me = await res.json();
    debugLog("auth OK: " + me.login);
  }

  // --- UI -----------------------------------------------------------------
  function showError(err) {
    setText(systemEl, "> signal interrupted");
    errorEl.classList.remove("hidden");
    errorDetailEl.textContent = String(err && err.message ? err.message : err);
  }

  function lockScreen(choice) {
    questionEl.classList.add("hidden");
    optionsEl.classList.add("hidden");
    resultEl.classList.remove("hidden");
    setText(footerEl, "// this record has already been sealed");
    if (choice === "golden") {
      typeText(resultNoteEl, "// the flower remembers your name", 35);
    } else if (choice === "keeper") {
      typeText(resultNoteEl, "// the ruins do not forget", 35);
    } else {
      typeText(resultNoteEl, "// the choice was made before you arrived", 35);
    }
  }

  function revealVote() {
    questionEl.classList.add("hidden");
    optionsEl.classList.add("hidden");
    resultEl.classList.remove("hidden");
    setText(footerEl, "// record sealed — do not look back");
    typeText(resultNoteEl, "// your answer has been filed. it was never yours to keep.", 32);
  }

  async function vote(choice) {
    var buttons = optionsEl.querySelectorAll(".option");
    buttons.forEach(function (b) { b.disabled = true; });
    setText(systemEl, "> transmitting choice...");

    try {
      var latest = await readState();
      var localChoice = localStorage.getItem(VOTE_KEY);
      var serverVote = latest.data.voters && latest.data.voters.indexOf(voterId) !== -1;
      if (localChoice || serverVote) {
        lockScreen(localChoice || choice);
        return;
      }

      var newData = latest.data;
      if (!newData.votes) newData.votes = {};
      if (!newData.voters) newData.voters = [];
      newData.votes[choice] = (newData.votes[choice] || 0) + 1;
      newData.voters.push(voterId);

      await writeVote(newData, latest.sha, choice);
      localStorage.setItem(VOTE_KEY, choice);
      setText(systemEl, "> transmission complete");
      revealVote();
    } catch (err) {
      buttons.forEach(function (b) { b.disabled = false; });
      showError(err);
    }
  }

  optionsEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".option");
    if (!btn || btn.disabled) return;
    vote(btn.getAttribute("data-choice"));
  });

  function configOk() {
    if (mode === "worker") {
      return workerUrl && workerUrl.indexOf("YOUR_") !== 0 && /^https:\/\//.test(workerUrl);
    }
    return token && token.indexOf("YOUR_") !== 0 &&
      owner && owner.indexOf("YOUR_") !== 0 &&
      repo && repo.indexOf("YOUR_") !== 0;
  }

  async function init() {
    if (!configOk()) {
      showError(new Error("config.js is not configured. See README. IMPORTANT: commit the file, then wait 1-2 min for GitHub Pages to rebuild."));
      return;
    }

    debugLog("mode=" + mode);
    if (mode === "worker") {
      debugLog("workerUrl=" + workerUrl);
    } else {
      debugLog("owner=" + owner + " repo=" + repo + " branch=" + branch + " file=" + filePath);
      debugLog("token prefix=" + token.slice(0, 7) + "... length=" + token.length);
    }

    typeText(systemEl, "> establishing connection to the archive...", 30);

    try {
      await testAuth();
      var state = await readState();
      var localChoice = localStorage.getItem(VOTE_KEY);
      var serverVote = state.data.voters && state.data.voters.indexOf(voterId) !== -1;

      if (localChoice || serverVote) {
        setTimeout(function () { lockScreen(localChoice); }, 1100);
      } else {
        setTimeout(function () { setText(systemEl, "> awaiting your decision"); }, 1600);
      }
    } catch (err) {
      setTimeout(function () { showError(err); }, 1100);
    }
  }

  init();
})();
