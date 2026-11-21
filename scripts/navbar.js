"use strict";

// Carica la stessa navbar in tutte le pagine HTML.
async function caricaNavbar() {
  const contenitore = document.getElementById("site-header");
  if (!contenitore) return;

  try {
    const risposta = await fetch("components/navbar.html");
    if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);

    contenitore.innerHTML = await risposta.text();

    const paginaCorrente = window.location.pathname.split("/").pop() || "index.html";
    const collegamenti = contenitore.querySelectorAll("a.nav-link[href]");

    collegamenti.forEach(collegamento => {
      if (collegamento.getAttribute("href") === paginaCorrente) {
        collegamento.classList.add("active");
        collegamento.setAttribute("aria-current", "page");
      }
    });
  } catch (errore) {
    console.error("Impossibile caricare la navbar:", errore);
  }
}

document.addEventListener("DOMContentLoaded", caricaNavbar);
