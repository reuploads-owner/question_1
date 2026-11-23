(function () {
  "use strict";

  var cfg = window.VOTE_CONFIG || {};
  var endpoint = cfg.workerUrl ? String(cfg.workerUrl).trim() : "";
  var SENT_KEY = "weird_answer_sent";
  var ID_KEY = "weird_voter_id";

  var formEl = document.getElementById("form");
  var answerEl = document.getElementById("answer");
  var emailEl = document.getElementById("email");
  var submitEl = formEl.querySelector(".submit");
  var questionEl = document.getElementById("question");
  var whisperEl = document.getElementById("whisper");
  var whisper2El = document.getElementById("whisper2");
  var resultEl = document.getElementById("result");
  var resultNoteEl = document.getElementById("result-note");
  var systemEl = document.getElementById("system-line");
  var errorEl = document.getElementById("error");
  var errorDetailEl = document.getElementById("error-detail");
  var footerEl = document.getElementById("footer");

  var voterId = localStorage.getItem(ID_KEY);
  if (!voterId) {
    voterId = "a-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(ID_KEY, voterId);
  }

  var debugMode = /[?&]debug=1/.test(window.location.search);
  function debugLog(message) {
    var box = document.getElementById("debug");
    if (!debugMode || !box) return;
    box.classList.remove("hidden");
    var line = document.createElement("p");
    line.textContent = "> " + message;
    box.appendChild(line);
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

  function showError(err) {
    setText(systemEl, "> signal interrupted");
    errorEl.classList.remove("hidden");
    errorDetailEl.textContent = String(err && err.message ? err.message : err);
  }

  function lockScreen() {
    formEl.classList.add("hidden");
    whisperEl.classList.add("hidden");
    whisper2El.classList.add("hidden");
    questionEl.classList.add("hidden");
    resultEl.classList.remove("hidden");
    setText(footerEl, cfg.finalWhisper || "// the promise has been written down");
    typeText(resultNoteEl, "// it was already decided", 35);
  }

  function revealResult() {
    formEl.classList.add("hidden");
    whisperEl.classList.add("hidden");
    whisper2El.classList.add("hidden");
    questionEl.classList.add("hidden");
    resultEl.classList.remove("hidden");
    setText(footerEl, cfg.finalWhisper || "// the promise has been written down");
    typeText(resultNoteEl, "// she knows where to find you now", 32);
  }

  async function checkState() {
    var res = await fetch(endpoint, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error("Service " + res.status + ": " + (await res.text()));
    var data = await res.json();
    debugLog("state OK, records=" + (data.responses ? data.responses.length : 0));
    return data;
  }

  async function sendAnswer(answer, email) {
    var res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: answer, email: email, voterId: voterId })
    });
    if (!res.ok) throw new Error("Service " + res.status + ": " + (await res.text()));
    var result = await res.json();
    debugLog("send OK count=" + result.count);
    return result;
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
  }

  formEl.addEventListener("submit", async function (e) {
    e.preventDefault();

    var answer = answerEl.value.trim();
    var email = emailEl.value.trim();

    if (!answer) {
      showError(new Error("The place cannot be empty."));
      return;
    }
    if (!validEmail(email)) {
      showError(new Error("That address cannot receive an answer."));
      return;
    }

    submitEl.disabled = true;
    setText(systemEl, "> writing your promise down...");

    try {
      var result = await sendAnswer(answer, email);
      if (result.already) {
        lockScreen();
        return;
      }
      localStorage.setItem(SENT_KEY, "1");
      setText(systemEl, "> transmission complete");
      revealResult();
    } catch (err) {
      submitEl.disabled = false;
      showError(err);
    }
  });

  async function init() {
    if (!endpoint || endpoint.indexOf("YOUR_") === 0) {
      showError(new Error("config.js is not configured. Set workerUrl and COMMIT it."));
      return;
    }

    debugLog("endpoint=" + endpoint);
    typeText(systemEl, "> establishing connection to the archive...", 30);
    typeText(whisperEl, cfg.firstWhisper || "// she waits for a place", 35);

    try {
      var state = await checkState();
      var localSent = localStorage.getItem(SENT_KEY) === "1";
      var serverSent = state.voters && state.voters.indexOf(voterId) !== -1;

      if (localSent || serverSent) {
        setTimeout(lockScreen, 1100);
      } else {
        setTimeout(function () {
          setText(systemEl, "> awaiting your answer");
        }, 1600);
      }
    } catch (err) {
      setTimeout(function () { showError(err); }, 1100);
    }
  }

  init();
})();
