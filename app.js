(function () {
  "use strict";

  var cfg = window.VOTE_CONFIG;
  var owner = cfg && cfg.owner;
  var repo = cfg && cfg.repo;
  var branch = (cfg && cfg.branch) || "main";
  var filePath = (cfg && cfg.filePath) || "votes.json";
  var token = cfg && cfg.token;

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

  // Стабильный идентификатор посетителя в этом браузере.
  var voterId = localStorage.getItem(ID_KEY);
  if (!voterId) {
    voterId = "v-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(ID_KEY, voterId);
  }

  function apiHeaders() {
    return {
      "Authorization": "token " + token,
      "Accept": "application/vnd.github+json"
    };
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

  async function getFile() {
    var url = "https://api.github.com/repos/" + owner + "/" + repo +
      "/contents/" + filePath + "?ref=" + branch;
    var res = await fetch(url, { headers: apiHeaders() });
    if (res.status === 404) return { data: emptyData(), sha: null };
    if (!res.ok) throw new Error("GitHub API " + res.status + ": " + (await res.text()));
    var json = await res.json();
    return { data: JSON.parse(fromBase64(json.content)), sha: json.sha };
  }

  async function saveFile(data, sha) {
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
    if (!res.ok) throw new Error("GitHub API " + res.status + ": " + (await res.text()));
    return res.json();
  }

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
      var latest = await getFile();
      var already = localStorage.getItem(VOTE_KEY) ||
        (latest.data.voters && latest.data.voters.indexOf(voterId) !== -1);

      if (already) {
        lockScreen(choice);
        return;
      }

      if (!latest.data.votes) latest.data.votes = {};
      if (!latest.data.voters) latest.data.voters = [];
      latest.data.votes[choice] = (latest.data.votes[choice] || 0) + 1;
      latest.data.voters.push(voterId);

      await saveFile(latest.data, latest.sha);
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

  async function init() {
    if (!cfg || !token || token.indexOf("YOUR_") === 0 ||
        !owner || owner.indexOf("YOUR_") === 0 ||
        !repo || repo.indexOf("YOUR_") === 0) {
      showError(new Error("config.js is not configured. Set owner / repo / token."));
      return;
    }

    typeText(systemEl, "> establishing connection to the archive...", 30);

    try {
      var state = await getFile();
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
