
"use strict";

/* ==========================================
   SHARED COMPONENTS
   Navbar e footer di Acerba Etas
   ========================================== */

// Percorso dei componenti relativo a components.js
const componentsURL = new URL("../components/", document.currentScript.src);


/* ==========================================
   LOAD COMPONENT
   ========================================== */

async function caricaComponente(file, containerId) {
  const contenitore = document.getElementById(containerId);

  if (!contenitore) return null;

  try {
    const risposta = await fetch(new URL(file, componentsURL));

    if (!risposta.ok) {
      throw new Error(`HTTP ${risposta.status}`);
    }

    contenitore.innerHTML = await risposta.text();

    return contenitore;

  } catch (errore) {
    console.error(`Impossibile caricare ${file}:`, errore);
    return null;
  }
}


/* ==========================================
   NAVBAR
   ========================================== */

async function caricaNavbar() {
  const contenitore = await caricaComponente(
    "navbar.html",
    "site-header"
  );

  if (!contenitore) return;

  // Evidenzia automaticamente la pagina attiva
  const paginaCorrente =
    window.location.pathname.split("/").pop() || "index.html";

  const collegamenti =
    contenitore.querySelectorAll("a.nav-link[href]");

  collegamenti.forEach(collegamento => {
    if (collegamento.getAttribute("href") === paginaCorrente) {
      collegamento.classList.add("active");
      collegamento.setAttribute("aria-current", "page");
    }
  });
}


/* ==========================================
   FOOTER
   ========================================== */

async function caricaFooter() {
  await caricaComponente(
    "footer.html",
    "footer-container"
  );
}


/* ==========================================
   INITIALIZATION
   ========================================== */

document.addEventListener("DOMContentLoaded", () => {
  caricaNavbar();
  caricaFooter();
});
