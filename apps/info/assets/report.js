/*
 * Report a concern — submits to the Kidan API's anonymous public endpoint.
 * The API base is pinned to the deployment this site was built for; swap it
 * when promoting a build to production.
 */
(function () {
  "use strict";
  var API_BASE = "https://kidan-staging-api.vercel.app";
  var BODY_MAX = 1500;

  var form = document.getElementById("concern-form");
  if (!form) return;
  var topic = document.getElementById("topic");
  var body = document.getElementById("body");
  var contact = document.getElementById("contact");
  var honeypot = document.getElementById("website");
  var submitBtn = document.getElementById("concern-submit");
  var status = document.getElementById("concern-status");
  var counter = document.getElementById("body-counter");
  var donePanel = document.getElementById("concern-done");
  var doneRef = document.getElementById("concern-ref");

  body.addEventListener("input", function () {
    counter.textContent = body.value.length + " / " + BODY_MAX;
  });

  function showError(msg) {
    status.className = "form-status error";
    status.textContent = msg;
    submitBtn.disabled = false;
    submitBtn.textContent = "Send to the operator";
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    status.className = "form-status";
    status.textContent = "";

    var payload = {
      topic: topic.value,
      body: body.value.trim(),
      website: honeypot.value || ""
    };
    if (contact.value.trim()) payload.contact = contact.value.trim();

    if (!payload.topic) { showError("Please choose a topic first."); return; }
    if (payload.body.length < 1) { showError("Please tell us what happened — the message can't be empty."); return; }
    if (payload.body.length > BODY_MAX) { showError("That's over " + BODY_MAX + " characters — please shorten it a little."); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    fetch(API_BASE + "/v1/public/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (res.status === 201 || res.ok) {
        return res.json().then(function (data) {
          var id = (data && data.data && data.data.id) || (data && data.id) || "";
          doneRef.textContent = id ? id.slice(0, 8).toUpperCase() : "received";
          form.closest(".form-card").style.display = "none";
          donePanel.hidden = false;
          donePanel.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return res.json().catch(function () { return null; }).then(function (err) {
        var msg = (err && err.error && err.error.message) || "";
        if (res.status === 429) showError("Too many reports in a short time. Please wait a few minutes and try again.");
        else if (msg) showError(msg);
        else showError("We couldn't deliver the report just now. Please try again in a moment.");
      });
    }).catch(function () {
      showError("No connection to the service. Check your internet and try again.");
    });
  });
})();
