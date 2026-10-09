// Colour theme: Auto (device setting, default) · Light · Dark. Loaded in <head> so a stored choice applies before the
// page is drawn. The choice stays in this browser's localStorage; nothing is sent anywhere.
(function () {
  "use strict";
  var KEY = "bounty-theme";
  var root = document.documentElement;
  function stored() {
    try { var v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : null; } catch (e) { return null; }
  }
  function apply(choice) {
    if (choice) root.setAttribute("data-theme", choice); else root.removeAttribute("data-theme");
  }
  apply(stored());
  document.addEventListener("DOMContentLoaded", function () {
    var box = document.querySelector(".theme-switch");
    if (!box) return;
    var buttons = box.querySelectorAll("button[data-theme-choice]");
    function mark(choice) {
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].setAttribute("aria-pressed", String(buttons[i].getAttribute("data-theme-choice") === (choice || "auto")));
      }
    }
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function () {
        var c = this.getAttribute("data-theme-choice");
        c = c === "light" || c === "dark" ? c : null;
        try { if (c) localStorage.setItem(KEY, c); else localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
        apply(c);
        mark(c);
      });
    }
    mark(stored());
    box.hidden = false;
  });
})();
