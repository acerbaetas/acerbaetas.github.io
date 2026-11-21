"use strict";

// Percorso relativo a codici.html, non a questo script.
const CODICI_JSON = "./scripts/codici_acerba_verificati_dettaglio.json";

// Identificatore leggibile e stabile per collegare popup e righe della tabella.
function idCodice(nome) {
  return "codice-" + nome
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function urlWebValido(link) {
  try {
    const indirizzo = new URL(link);
    return ["https:", "http:"].includes(indirizzo.protocol) ? indirizzo.href : null;
  } catch {
    return null;
  }
}

function mostraTabella(codici) {
  const corpoTabella = document.getElementById("elenco-codici");
  const stato = document.getElementById("stato-codici");
  const righe = document.createDocumentFragment();
  const recordValidi = [];
  const identificatoriUsati = new Set();

  for (const codice of codici) {
    const indirizzo = urlWebValido(codice.link);
    if (!codice.nome_codice || !codice.biblioteca || !indirizzo) {
      console.warn("Record incompleto, ignorato:", codice);
      continue;
    }

    const riga = document.createElement("tr");
    let id = idCodice(codice.nome_codice);
    const idBase = id;
    let numero = 2;
    while (identificatoriUsati.has(id)) id = `${idBase}-${numero++}`;
    identificatoriUsati.add(id);
    riga.id = id;
    codice.id_tabella = id;

    const cellaNome = document.createElement("td");
    cellaNome.className = "codice-nome";
    cellaNome.textContent = codice.nome_codice;

    const cellaDatazione = document.createElement("td");
    cellaDatazione.className = "codice-datazione";
    cellaDatazione.textContent = codice.datazione || "—";

    const cellaBiblioteca = document.createElement("td");
    cellaBiblioteca.textContent = codice.biblioteca;

    const cellaLink = document.createElement("td");
    cellaLink.className = "codice-link-cell";

    const collegamento = document.createElement("a");
    collegamento.className = "codice-link";
    collegamento.href = indirizzo;
    collegamento.target = "_blank";
    collegamento.rel = "noopener noreferrer";
    collegamento.textContent = codice.tipo_link === "digitalizzazione"
      ? "Visualizza il manoscritto"
      : "Consulta la scheda";

    const icona = document.createElement("i");
    icona.className = "bi bi-box-arrow-up-right";
    icona.setAttribute("aria-hidden", "true");
    collegamento.appendChild(icona);

    cellaLink.appendChild(collegamento);
    riga.append(cellaNome, cellaDatazione, cellaBiblioteca, cellaLink);
    righe.appendChild(riga);
    recordValidi.push(codice);
  }

  if (!recordValidi.length) {
    throw new Error("Nessun codice valido trovato nel JSON.");
  }

  corpoTabella.replaceChildren(righe);
  stato.hidden = true;
  return recordValidi;
}

function mostraMappa(codici) {
  const statoMappa = document.getElementById("stato-mappa");
  const contenitore = document.getElementById("mappa-codici");
  if (!contenitore || !statoMappa) return;

  if (typeof L === "undefined") {
    statoMappa.textContent = "Mappa non disponibile: impossibile caricare la libreria Leaflet.";
    return;
  }

  // Un solo punto per biblioteca, anche quando conserva più codici.
  const biblioteche = new Map();
  for (const codice of codici) {
    const posizione = codice.coordinate_biblioteca;
    if (!posizione || !Number.isFinite(posizione.lat) || !Number.isFinite(posizione.lng)) {
      console.warn("Coordinate mancanti o non valide:", codice.nome_codice);
      continue;
    }

    const chiave = codice.biblioteca.trim();
    if (!biblioteche.has(chiave)) {
      biblioteche.set(chiave, {
        nome: chiave,
        posizione: [posizione.lat, posizione.lng],
        codici: []
      });
    }
    biblioteche.get(chiave).codici.push(codice);
  }

  if (!biblioteche.size) {
    statoMappa.textContent = "Non sono disponibili coordinate per le biblioteche.";
    return;
  }

  try {
    const mappa = L.map(contenitore, { scrollWheelZoom: false });
    mappa.attributionControl.setPrefix('')
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(mappa);

    // Segnaposto a goccia, in blu notte, stile Google Maps.
    // Il colore è gestito da --night nel CSS condiviso delle pagine interne.
    const iconaBiblioteca = L.divIcon({
      className: "codici-map-pin",
      html: `<svg viewBox="0 0 36 48" width="36" height="48" aria-hidden="true" focusable="false">
        <path class="pin-shape" d="M18 1C8.6 1 1 8.6 1 18c0 12.5 17 28 17 28s17-15.5 17-28C35 8.6 27.4 1 18 1Z"/>
        <circle class="pin-center" cx="18" cy="18" r="5.8"/>
      </svg>`,
      iconSize: [24, 32],
      iconAnchor: [12, 31],
      popupAnchor: [0, -30],
      tooltipAnchor: [10, -17]
    });

    const punti = [];
    for (const biblioteca of biblioteche.values()) {
      const popup = document.createElement("div");
      const titolo = document.createElement("div");
      titolo.className = "map-popup-title";
      titolo.textContent = biblioteca.nome;
      popup.appendChild(titolo);

      const elenco = document.createElement("ul");
      elenco.className = "map-popup-list";
      for (const codice of biblioteca.codici) {
        const voce = document.createElement("li");
        const collegamento = document.createElement("a");
        collegamento.href = `#${codice.id_tabella}`;
        collegamento.textContent = codice.nome_codice;
        collegamento.title = `Vai alla riga di ${codice.nome_codice}`;
        voce.appendChild(collegamento);
        elenco.appendChild(voce);
      }
      popup.appendChild(elenco);

      const punto = L.marker(biblioteca.posizione, { icon: iconaBiblioteca });
      punto.bindPopup(popup, { maxWidth: 330, maxHeight: 245 });
      punto.bindTooltip(biblioteca.nome);
      punto.addTo(mappa);
      punti.push(biblioteca.posizione);
    }

    mappa.fitBounds(L.latLngBounds(punti), {
      padding: [35, 35],
      maxZoom: 6
    });
    statoMappa.hidden = true;
  } catch (errore) {
    console.error("Impossibile creare la mappa:", errore);
    statoMappa.textContent = "Impossibile visualizzare la mappa in questo momento.";
  }
}



function vaiAlCodiceDaHash() {
  // Rimuove eventuali evidenziazioni precedenti.
  document.querySelectorAll(".codice-evidenziato").forEach(riga => {
    riga.classList.remove("codice-evidenziato");
  });

  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!id) return;

  const riga = document.getElementById(id);
  if (!riga) return;

  // Evidenzia la riga selezionata.
  riga.classList.add("codice-evidenziato");

  // Scorre fino alla riga.
  riga.scrollIntoView({
    behavior: "auto",
    block: "center"
  });
}



async function caricaCodici() {
  const stato = document.getElementById("stato-codici");
  const statoMappa = document.getElementById("stato-mappa");

  try {
    const risposta = await fetch(CODICI_JSON);
    if (!risposta.ok) throw new Error(`Errore HTTP ${risposta.status}`);

    const codici = await risposta.json();
    if (!Array.isArray(codici)) throw new Error("Il file JSON non contiene un elenco valido.");

    const recordValidi = mostraTabella(codici);
    mostraMappa(recordValidi);

    // Dopo aver generato la tabella, controlla l'URL.
    requestAnimationFrame(vaiAlCodiceDaHash);
  } catch (errore) {
    console.error("Impossibile caricare i codici:", errore);
    stato.textContent = "Impossibile caricare l’elenco dei codici. Verifica che il file JSON sia presente e che la pagina sia aperta tramite un server web.";
    stato.classList.add("text-danger");
    statoMappa.textContent = "La mappa non può essere caricata senza i dati dei codici.";
  }
}
window.addEventListener("hashchange", vaiAlCodiceDaHash);
document.addEventListener("DOMContentLoaded", caricaCodici);
