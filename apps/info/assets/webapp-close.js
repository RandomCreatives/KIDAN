(function () {
  "use strict";

  var sdk = document.createElement("script");
  sdk.src = "https://telegram.org/js/telegram-web-app.js";
  sdk.onload = function () {
    var tg = window.Telegram && window.Telegram.WebApp;
    if (!tg || !tg.initData) return;

    try {
      tg.ready();
    } catch (e) {}

    var btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", "Close");
    btn.innerHTML = "&#215;";

    btn.style.position = "fixed";
    btn.style.top = "calc(12px + env(safe-area-inset-top, 0px))";
    btn.style.right = "calc(12px + env(safe-area-inset-right, 0px))";
    btn.style.width = "36px";
    btn.style.height = "36px";
    btn.style.borderRadius = "50%";
    btn.style.border = "none";
    btn.style.backgroundColor = "var(--tg-theme-secondary-bg-color, rgba(0, 0, 0, 0.15))";
    btn.style.color = "var(--tg-theme-text-color, #ffffff)";
    btn.style.fontSize = "20px";
    btn.style.lineHeight = "36px";
    btn.style.textAlign = "center";
    btn.style.cursor = "pointer";
    btn.style.zIndex = "99999";
    btn.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.2)";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.padding = "0";

    btn.addEventListener("click", function () {
      try {
        tg.close();
      } catch (e) {}
    });

    document.body.appendChild(btn);
  };

  document.head.appendChild(sdk);
})();
