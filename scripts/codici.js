"use strict";

// Percorso relativo a codici.html, non a questo script.
const CODICI_JSON = "./scripts/codici_acerba.json";

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

// I controlli agiscono soltanto sulla tabella: la mappa resta completa.
const collatoreCodici = new Intl.Collator("it", { numeric: true, sensitivity: "base" });
let catalogoCodici = [];

function normalizzaRicerca(testo) {
  return String(testo ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function confrontaCodici(a, b, criterio) {
  const perNome = () => collatoreCodici.compare(a.nome_codice, b.nome_codice);

  if (criterio === "biblioteca") {
    return collatoreCodici.compare(a.biblioteca, b.biblioteca) || perNome();
  }
  if (criterio === "datazione") {
    // Datazioni mancanti alla fine; notBefore/notAfter rappresentano intervalli.
    const annoA = Number.isFinite(a.notBefore) ? a.notBefore : Infinity;
    const annoB = Number.isFinite(b.notBefore) ? b.notBefore : Infinity;
    const fineA = Number.isFinite(a.notAfter) ? a.notAfter : Infinity;
    const fineB = Number.isFinite(b.notAfter) ? b.notAfter : Infinity;
    return annoA - annoB || fineA - fineB || perNome();
  }
  return perNome();
}

function aggiornaCatalogo() {
  const ricerca = normalizzaRicerca(document.getElementById("ricerca-codici").value);
  const risorsa = document.getElementById("filtro-risorsa").value;
  const ordine = document.getElementById("ordina-codici").value;
  const corpoTabella = document.getElementById("elenco-codici");

  let conteggio = 0;
  const ordinati = [...catalogoCodici].sort((a, b) => confrontaCodici(a, b, ordine));
  for (const codice of ordinati) {
    const riga = document.getElementById(codice.id_tabella);
    if (!riga) continue;

    const contenuto = normalizzaRicerca(
      [codice.nome_codice, codice.biblioteca, codice.datazione, codice.note].join(" ")
    );
    const corrispondeRicerca = !ricerca || contenuto.includes(ricerca);
    // Il filtro "Digitalizzazione" include anche le digitalizzazioni parziali.
    const corrispondeRisorsa = risorsa === "tutte"
      || (risorsa === "digitalizzazione"
        ? ["digitalizzazione", "digitalizzazione_parziale"].includes(codice.tipo_link)
        : codice.tipo_link === "scheda");

    riga.hidden = !(corrispondeRicerca && corrispondeRisorsa);
    if (!riga.hidden) conteggio++;
    // Riordina gli elementi esistenti: gli ID degli URL restano invariati.
    corpoTabella.appendChild(riga);
  }
  document.getElementById("conteggio-codici").textContent =
    `${conteggio} ${conteggio === 1 ? "codice" : "codici"} su ${catalogoCodici.length}`;
  document.getElementById("nessun-risultato").hidden = conteggio !== 0;
}

function mostraTabella(codici) {
  const corpoTabella = document.getElementById("elenco-codici");
  const stato = document.getElementById("stato-codici");
  const righe = document.createDocumentFragment();
  const recordValidi = [];
  const identificatoriUsati = new Set();

  for (const codice of codici) {
    const indirizzo = urlWebValido(codice.link);
    if (!codice.nome_codice || !codice.biblioteca) {
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

    const contenitoreLink = document.createElement("div");
    contenitoreLink.className = "d-flex flex-column align-items-start gap-1";

    if (indirizzo) {
      const collegamento = document.createElement("a");
      collegamento.className = "codice-link";
      collegamento.href = indirizzo;
      collegamento.target = "_blank";
      collegamento.rel = "noopener noreferrer";
      collegamento.textContent = ["digitalizzazione", "digitalizzazione_parziale"].includes(codice.tipo_link)
        ? "Digitalizzazione"
        : "Scheda";

      const icona = document.createElement("i");
      icona.className = "bi bi-box-arrow-up-right";
      icona.setAttribute("aria-hidden", "true");
      collegamento.appendChild(icona);
      contenitoreLink.appendChild(collegamento);
    }

    // I collegamenti alle singole immagini sono indipendenti dal link principale.
    for (const immagine of codice.immagini_online || []) {
      const url = urlWebValido(immagine.url);
      if (!url) continue;
      const linkImmagine = document.createElement("a");
      linkImmagine.className = "codice-link";
      linkImmagine.href = url;
      linkImmagine.target = "_blank";
      linkImmagine.rel = "noopener noreferrer";
      linkImmagine.textContent = immagine.etichetta || "Pagina digitalizzata";
      contenitoreLink.appendChild(linkImmagine);
    }

    if (!contenitoreLink.childElementCount) contenitoreLink.textContent = "—";
    cellaLink.appendChild(contenitoreLink);

    const cellaNote = document.createElement("td");
    cellaNote.className = "codice-note";
    cellaNote.textContent = codice.note?.trim() || "";

    riga.append(cellaNome, cellaDatazione, cellaBiblioteca, cellaLink, cellaNote);
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

  // Un marker per codice (non uno per biblioteca).
  // I codici della stessa biblioteca hanno coordinate coincidenti:
  // MarkerCluster li separa con lo spiderfy quando il gruppo non può più suddividersi.
  const codiciMappabili = codici.filter(codice => {
    const posizione = codice.coordinate_biblioteca;
    const valido = posizione && Number.isFinite(posizione.lat) && Number.isFinite(posizione.lng);
    if (!valido) console.warn("Coordinate mancanti o non valide:", codice.nome_codice);
    return valido;
  });

  if (!codiciMappabili.length) {
    statoMappa.textContent = "Non sono disponibili coordinate per i codici.";
    return;
  }

  try {
    const mappa = L.map(contenitore, { scrollWheelZoom: true });
    mappa.attributionControl.setPrefix("");
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(mappa);

    // Stessa icona blu notte già utilizzata per i marker singoli.
    const iconaCodice = L.divIcon({
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

    // Ora il numero nei cluster indica quanti CODICI contengono.
    const gruppoMarker = typeof L.markerClusterGroup === "function"
      ? L.markerClusterGroup({
          showCoverageOnHover: false,
          zoomToBoundsOnClick: true,
          spiderfyOnMaxZoom: true,
          spiderfyDistanceMultiplier: 1.35,
          maxClusterRadius: 60,
          iconCreateFunction(cluster) {
            const numeroCodici = cluster.getChildCount();
            return L.divIcon({
              html: `<span>${numeroCodici}</span>`,
              className: "codici-cluster",
              iconSize: [44, 44],
              iconAnchor: [22, 22]
            });
          }
        })
      : L.layerGroup();

    const punti = [];
    for (const codice of codiciMappabili) {
      const posizione = codice.coordinate_biblioteca;
      const coordinate = [posizione.lat, posizione.lng];

      // Ogni popup descrive un solo codice e rimanda alla sua riga in tabella.
      const popup = document.createElement("div");
      const titolo = document.createElement("div");
      titolo.className = "map-popup-title";
      const collegamento = document.createElement("a");
      collegamento.href = `#${codice.id_tabella}`;
      collegamento.textContent = codice.nome_codice;
      collegamento.title = `Vai alla riga di ${codice.nome_codice}`;
      titolo.appendChild(collegamento);
      popup.appendChild(titolo);

      const biblioteca = document.createElement("div");
      biblioteca.textContent = codice.biblioteca;
      popup.appendChild(biblioteca);

      const punto = L.marker(coordinate, { icon: iconaCodice });
      punto.bindPopup(popup, { maxWidth: 330, maxHeight: 245 });
      punto.bindTooltip(`${codice.nome_codice} — ${codice.biblioteca}`);
      gruppoMarker.addLayer(punto);
      punti.push(coordinate);
    }

    mappa.addLayer(gruppoMarker);
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

  // Se un filtro nasconde il codice selezionato dalla mappa o dall'URL,
  // lo rende nuovamente visibile prima di scorrere.
  if (riga.hidden) {
    document.getElementById("ricerca-codici").value = "";
    document.getElementById("filtro-risorsa").value = "tutte";
    aggiornaCatalogo();
  }

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

    // I due codici modenesi restano nel JSON, ma non sono mostrati online.
    const pubblicati = codici.filter(codice => codice.pubblica !== false);
    const recordValidi = mostraTabella(
      pubblicati.sort((a, b) => confrontaCodici(a, b, "nome"))
    );
    catalogoCodici = recordValidi;
    mostraMappa(recordValidi);

    document.getElementById("ricerca-codici").addEventListener("input", aggiornaCatalogo);
    document.getElementById("filtro-risorsa").addEventListener("change", aggiornaCatalogo);
    document.getElementById("ordina-codici").addEventListener("change", aggiornaCatalogo);
    aggiornaCatalogo();

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
