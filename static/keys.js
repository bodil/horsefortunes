window.addEventListener("keydown", function(event) {
  if (event.keyCode === 13 || event.keyCode === 32 || event.keyCode === 39)
    document.location.pathname = "/";
}, false);
