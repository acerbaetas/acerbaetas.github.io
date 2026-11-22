// URL del componente, relativo alla posizione dello script
const footerURL = new URL("../components/footer.html", document.currentScript.src);

document.addEventListener("DOMContentLoaded", async () => {
  const footerContainer = document.getElementById("footer-container");

  if (!footerContainer) return;

  try {
    const response = await fetch(footerURL);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    footerContainer.innerHTML = await response.text();

  } catch (error) {
    console.error("Errore nel caricamento del footer:", error);
  }
});
