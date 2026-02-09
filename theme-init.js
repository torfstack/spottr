// Apply saved theme immediately to prevent flash
var t = localStorage.getItem("spottr-theme") || "neon-dusk";
document.documentElement.className = t;
