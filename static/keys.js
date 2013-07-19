/*global Hammer, window */

(function() {
  function reload() {
    document.location.pathname = "/";
  }

  window.addEventListener("keydown", function(event) {
    if (event.keyCode === 13 || event.keyCode === 32 || event.keyCode === 39)
      reload();
  }, false);

  Hammer(document.body)
    .on("dragleft", reload)
    .on("dragright", reload);

})();
