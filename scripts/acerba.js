"use strict";

(async function () {
  const $ = id => document.getElementById(id);
  const types = {person: "Persone", place: "Luoghi", planet: "Pianeti", animal: "Animali", stone: "Pietre", virtue: "Virtù"};
  const filters = new Set(Object.keys(types));
  const panels = new Map();
  const catalog = new Map();
  const chapters = new Map();
  const canonical = new Set();
  let edition, state, revision = 0;
  let filterPanel;
  const modals = {};

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    node.className = className; node.textContent = text;
    return node;
  }
  function button(label, text, action, className = "icon-button") {
    const node = el("button", className, text);
    node.type = "button"; node.title = label; node.setAttribute("aria-label", label);
    node.addEventListener("click", action);
    return node;
  }
  async function json(name) {
    const response = await fetch(`data/acerba/${name}.json`);
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    return response.json();
  }
  const chapterOf = ref => ref?.split(":").pop().split("-").slice(0, 2).join("-");
  const isHeader = ref => /^\d+-\d+-h\d*$/.test(ref || "");
  const numberOf = ref => Number(ref?.split("-").pop()) || 0;
  const chapterStart = chapter => chapter.title || chapter.description ? `${chapter.id}-h` : chapter.verses[0].id;
  function textBlocks(data) {
    return data.books.flatMap(b => b.chapters.flatMap(c => c.blocks)).sort((a,b) => a.order-b.order);
  }
  function known(ref) {
    if (canonical.has(ref)) return true;
    return [...panels.values()].some(panel => panel.refs?.has(ref));
  }
  function readURL() {
    const params = new URL(location.href).searchParams;
    const defaults = ["e", ...[...catalog.keys()].filter(k => /^f\d+$/.test(k)).slice(0,1)];
    const p = params.has("p") ? params.get("p").split(",") : defaults;
    return {v: params.get("v") || chapterStart(edition.books[0].chapters[0]),
      p: [...new Set(p.filter(code => catalog.has(code)))].slice(0,5)};
  }
  function writeURL(replace = false) {
    const url = new URL(location.href);
    for (const name of ["v", "s", "p"]) url.searchParams.delete(name);
    url.searchParams.set("v", state.v); url.searchParams.set("p", state.p.join(","));
    const query = url.searchParams.toString().replace(/%2C/gi, ",").replace(/%3A/gi, ":");
    const path = url.pathname + "?" + query + url.hash;
    if (path !== location.pathname + location.search + location.hash) history[replace ? "replaceState" : "pushState"](null, "", path);
  }
  function navigate(ref) {
    if (!known(ref)) return;
    writeURL(true);
    state.v = ref;
    for (const panel of panels.values()) updatePanel(panel);
    writeURL();
  }
  // Only an existing reference in the same chapter may be a fallback.
  function resolve(ref, available) {
    if (available.has(ref)) return {id: ref, fallback: false};
    const cid = chapterOf(ref);
    const verses = [...available].filter(id => chapterOf(id) === cid && /^\d+-\d+-\d+$/.test(id))
      .sort((a,b) => numberOf(a)-numberOf(b));
    if (isHeader(ref) || ref?.includes(":")) {
      const header = `${cid}-h`;
      const id = available.has(header) ? header : verses[0];
      return id ? {id, fallback: true} : null;
    }
    const previous = verses.filter(id => numberOf(id) < numberOf(ref)).pop();
    const id = previous || verses[0];
    return id ? {id, fallback: true} : null;
  }
  function changePanels(code, direction) {
    writeURL(true);
    const i = state.p.indexOf(code);
    if (direction === "close") state.p.splice(i,1);
    else if (i+direction >= 0 && i+direction < state.p.length) {
      [state.p[i],state.p[i+direction]] = [state.p[i+direction],state.p[i]];
    }
    renderPanels(); writeURL();
  }
  function newPanel(code) {
    const config = catalog.get(code);
    const card = el("section", "reading-panel"); card.dataset.panelCode = code;
    const head = el("header", "panel-header");
    const title = el("h2", "", config.title); title.id = `panel-${code}`;
    card.setAttribute("aria-labelledby", title.id);
    const actions = el("div", "panel-actions");
    const left = button("Sposta a sinistra", "‹", () => changePanels(code,-1));
    const right = button("Sposta a destra", "›", () => changePanels(code,1));
    actions.append(left,right,button("Chiudi pannello", "×", () => changePanels(code,"close")));
    head.append(title,actions);
    const body = el("div", "panel-body", "Caricamento…");
    card.append(head,body);
    return {code, config, card, body, left, right, rows: new Map(), refs: new Set()};
  }
  async function renderPanels(validate = false) {
    const run = ++revision;
    const active = activePanel();
    const activeIndex = [...$("panels").children].indexOf(active);
    for (const [code,panel] of panels) if (!state.p.includes(code)) {
      panel.viewer?.destroy(); panel.card.remove(); panels.delete(code);
    }
    const loading = [];
    state.p.forEach((code,i) => {
      if (!panels.has(code)) {
        const panel = newPanel(code); panels.set(code,panel);
        panel.loading = (async () => {
          try {
            panel.data = panel.config.type === "edition" ? edition : await json(panel.config.file);
            if (!panels.has(code) || panels.get(code) !== panel) return;
            panel.body.replaceChildren();
            if (panel.config.type === "edition") renderEdition(panel);
            if (panel.config.type === "transcription") renderTranscription(panel);
            if (panel.config.type === "facsimile") renderFacsimile(panel);
            if (panel.config.type === "entities") {
              panel.refs = new Set(panel.data.entities.flatMap(e => e.occurrences.map(o => o.ref)));
            }
          } catch (error) {
            panel.body.textContent = "Impossibile caricare questo pannello."; console.error(error);
          }
        })();
      }
      const panel = panels.get(code);
      loading.push(panel.loading);
      if ($("panels").children[i] !== panel.card) {
        const positions=[panel.body,...panel.body.querySelectorAll(".entity-list")].map(node=>[node,node.scrollTop]);
        $("panels").insertBefore(panel.card,$("panels").children[i] || null);
        for (const [node,top] of positions) node.scrollTop=top;
      }
      panel.left.disabled = i === 0; panel.right.disabled = i === state.p.length-1;
    });
    $("panel-count").textContent = `${state.p.length} / 5 pannelli`;
    $("open-add").disabled = state.p.length === 5;
    await Promise.all(loading);
    if (run !== revision) return;
    if (validate) {
      // A direct link to an unaligned verse may need its transcription even when
      // that panel is closed. No other manuscript data is loaded in advance.
      if (!known(state.v)) {
        const ref = state.v;
        const wid = ref.split(":")[0];
        let valid = false;
        if (edition.manuscripts.some(w => w.id === wid)) {
          const data = await json(`${wid}-trascrizione`);
          valid = textBlocks(data).some(b => b.id === ref);
        }
        if (run !== revision) return;
        if (!valid) state.v = chapterStart(edition.books[0].chapters[0]);
      }
      if (run !== revision) return;
      writeURL(true);
    }
    for (const panel of panels.values()) if (validate || !panel.initialized) updatePanel(panel);
    if (matchMedia("(max-width: 600px)").matches) {
      showPanel(active?.isConnected ? active : $("panels").children[Math.max(0,Math.min(activeIndex,state.p.length-1))]);
    }
    updateCarousel();
  }
  function activePanel() {
    const strip=$("panels"), left=strip.getBoundingClientRect().left+parseFloat(getComputedStyle(strip).paddingLeft);
    return [...strip.children].sort((a,b)=>Math.abs(a.getBoundingClientRect().left-left)-Math.abs(b.getBoundingClientRect().left-left))[0];
  }
  function showPanel(card, smooth = false) {
    if (!card) return;
    const strip=$("panels");
    const left=strip.scrollLeft+card.getBoundingClientRect().left-strip.getBoundingClientRect().left-parseFloat(getComputedStyle(strip).paddingLeft);
    strip.scrollTo({left,behavior:smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant"});
  }
  function updateCarousel() {
    const cards=[...$("panels").children], index=cards.indexOf(activePanel());
    $("previous-panel").disabled=index<=0;
    $("next-panel").disabled=index<0 || index===cards.length-1;
    $("active-panel").textContent=index<0 ? "Nessun pannello" : `${index+1} / ${cards.length}`;
  }
  function movePanel(direction) {
    const cards=[...$("panels").children];
    showPanel(cards[cards.indexOf(activePanel())+direction],true);
  }
  function selectable(row, ref, panel) {
    row.dataset.ref = ref; row.tabIndex = 0; row.setAttribute("role","button");
    row.setAttribute("aria-label", isHeader(ref) ? "Intestazione del capitolo" : `Verso ${ref.split("-").pop()}`);
    row.addEventListener("click", event => { event.stopPropagation(); navigate(ref); });
    row.addEventListener("keydown", event => {
      if (["Enter"," "].includes(event.key)) { event.preventDefault(); row.click(); }
    });
    if (!panel.rows.has(ref)) panel.rows.set(ref,[]);
    panel.rows.get(ref).push(row); panel.refs.add(ref);
  }
  function rowFor(text, label) {
    const row = el("div", "verse-row");
    row.append(el("span","verse-number",label),el("span","verse-text",text));
    return row;
  }
  function renderEdition(panel) {
    panel.body.classList.add("text-body");
    for (const chapter of chapters.values()) {
      if (chapter.title || chapter.description) {
        const header = rowFor(chapter.title + "\n" + chapter.description,"§");
        header.classList.add("paratesto"); selectable(header,`${chapter.id}-h`,panel); panel.body.append(header);
      }
      for (const verse of chapter.verses) {
        const row = rowFor(verse.text,numberOf(verse.id)); selectable(row,verse.id,panel); panel.body.append(row);
      }
    }
  }
  function annotated(line) {
    const holder = el("span","verse-text"); const chars = Array.from(line.text);
    const ranges = line.annotations;
    const bounds = [...new Set([0,chars.length,...ranges.flatMap(a => [a.start,a.start+a.length])])].sort((a,b) => a-b);
    for (let i=0;i<bounds.length-1;i++) {
      const start = bounds[i], end = bounds[i+1];
      const active = ranges.filter(a => a.start <= start && a.start+a.length >= end);
      const span = el("span",active.map(a => `annotation-${a.type}`).join(" "),chars.slice(start,end).join(""));
      if (active.some(a => types[a.type])) span.classList.add("annotation-entity");
      span.title = active.map(a => types[a.type] || (a.type === "uncertain" ? "Lettura incerta" : "Lettura differente rispetto a Crespi")).join("; ");



      if (active.some(a =>
        ["uncertain", "differentReading"].includes(a.type)
      )) {
        const explanation = span.title;
        span.removeAttribute("title");
        span.tabIndex = 0;
        span.setAttribute("role", "button");
        span.setAttribute("aria-label", explanation);

        span.addEventListener("click", event => {
          event.stopPropagation();

          const popover = bootstrap.Popover.getOrCreateInstance(span, {
            content: explanation,
            trigger: "focus",
            placement: "top",
            container: "body"
          });

          span.focus({ preventScroll: true });
          popover.show();
        });

        span.addEventListener("keydown", event => {
          if (["Enter", " "].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            span.click();
          }
        });
      }



      holder.append(span);
    }
    return holder;
  }
  function renderTranscription(panel) {
    panel.body.classList.add("text-body", "transcription-body");
    let lastPage;
    for (const block of textBlocks(panel.data)) {
      block.lines.forEach((line,i) => {
        if (line.page !== lastPage) {
          const label = line.page.match(/Carta-_(.+)$/)?.[1] || line.page;
          const divider = el("div","page-break",`Foglio ${label}`); divider.dataset.pageId = line.page;
          panel.body.append(divider); lastPage = line.page;
        }
        const matched = ["aligned","uncertain"].includes(block.status);
        const label = i ? "" : block.kind === "header" ? "§" : matched ? block.matches.map(numberOf).join(" / ") : "·";
        const row = el("div",`verse-row ${block.kind === "header" ? "paratesto" : ""}`);
        row.dataset.pageId = line.page;
        row.append(el("span","verse-number",label),annotated(line));
        selectable(row,matched ? block.matches[0] : block.id,panel);
        if (matched) for (const ref of [...new Set([block.id,...block.matches])].filter(ref=>ref!==row.dataset.ref)) {
          panel.refs.add(ref);
          if (!panel.rows.has(ref)) panel.rows.set(ref,[]);
          panel.rows.get(ref).push(row);
          if (i === 0 && block.matches.includes(ref)) row.append(button(`Seleziona verso ${numberOf(ref)}`,String(numberOf(ref)),event => {
            event.stopPropagation(); navigate(ref);
          },"btn btn-sm verse-reference"));
        }
        panel.body.append(row);
      });
    }
    if (!panel.rows.size) panel.body.append(el("p","","Trascrizione non disponibile."));
  }
  function syncText(panel) {
    const selected = resolve(state.v,panel.refs);
    panel.body.querySelectorAll(".selected,.fallback").forEach(e => { e.classList.remove("selected","fallback"); e.removeAttribute("aria-pressed"); });
    panel.body.querySelectorAll(".fallback-label").forEach(e => e.remove());
    if (selected) for (const row of panel.rows.get(selected.id)) {
      row.classList.add(selected.fallback ? "fallback" : "selected");
      row.setAttribute("aria-pressed",String(!selected.fallback));
    }
    if (selected?.fallback) panel.rows.get(selected.id)[0].append(el("small","fallback-label","Riferimento assente: posizione disponibile nel capitolo"));
    // Gli avvisi cambiano l'altezza delle righe: misura solo il layout definitivo.
    if (selected) {
      const row = panel.rows.get(selected.id)[0];
      panel.body.scrollTop += row.getBoundingClientRect().top-panel.body.getBoundingClientRect().top-16;
    }
  }
  function updatePanel(panel) {
    if (!panel.data) return;
    if (["edition","transcription"].includes(panel.config.type)) syncText(panel);
    if (panel.config.type === "facsimile") syncFacsimile(panel);
    if (panel.config.type === "entities") renderEntities(panel);
    panel.initialized = true;
  }

  function imageViewer(panel) {
    const view = el("div","facsimile-view"); view.tabIndex = 0;
    view.setAttribute("aria-label","Facsimile: rotella o pinch per zoom, trascina per spostare");
    const plane = el("div","image-plane"); const img = el("img"); img.loading = "lazy"; img.draggable = false;
    const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
    const message = el("p","image-message"); message.setAttribute("role","status");
    plane.append(img,svg); view.append(plane,message);
    let page, anchor, zoom = 1, cx = 0, cy = 0, scale = 1, x = 0, y = 0;
    const pointers = new Map();
    function layout() {
      if (!page || !view.clientWidth || !view.clientHeight) return;
      scale = Math.min(view.clientWidth/page.width,view.clientHeight/page.height)*zoom;
      if (anchor) {
        cx = anchor.x;
        cy = anchor.y + (view.clientHeight/2-Math.max(24,Math.min(96,view.clientHeight*.16)))/scale;
      }
      x = view.clientWidth/2-cx*scale; y = view.clientHeight/2-cy*scale;
      plane.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
    }
    function reset() { if (page) { anchor=null; zoom=1; cx=page.width/2; cy=page.height/2; layout(); } }
    function magnify(factor,px=view.clientWidth/2,py=view.clientHeight/2) {
      if (!page) return;
      anchor=null;
      const ix=(px-x)/scale, iy=(py-y)/scale;
      zoom = Math.min(20,Math.max(.3,zoom*factor)); layout();
      cx = ix-(px-view.clientWidth/2)/scale; cy = iy-(py-view.clientHeight/2)/scale; layout();
    }
    const controls = el("div","zoom-controls");
    controls.setAttribute("role","group"); controls.setAttribute("aria-label","Zoom e posizione immagine");
    controls.append(button("Ingrandisci","+",() => magnify(1.25)),button("Ripristina vista","⛶",reset),button("Riduci","−",() => magnify(.8)));
    controls.addEventListener("pointerdown",event => event.stopPropagation()); view.append(controls);
    img.addEventListener("load",() => { message.hidden=true; layout(); });
    img.addEventListener("error",() => { message.hidden=false; message.textContent="Immagine non disponibile."; });
    view.addEventListener("wheel",event => {
      if (!event.ctrlKey && (event.shiftKey || Math.abs(event.deltaX)>Math.abs(event.deltaY))) return;
      event.preventDefault(); event.stopPropagation(); const rect=view.getBoundingClientRect();
      magnify(Math.exp(-event.deltaY*.002),event.clientX-rect.left,event.clientY-rect.top);
    },{passive:false});
    view.addEventListener("pointerdown",event => {
      if (!page || event.target.closest("button")) return;
      anchor=null;
      view.setPointerCapture(event.pointerId); pointers.set(event.pointerId,{x:event.clientX,y:event.clientY}); view.focus({preventScroll:true});
    });
    view.addEventListener("pointermove",event => {
      if (!pointers.has(event.pointerId)) return;
      const before=[...pointers.values()], previous=pointers.get(event.pointerId);
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if (pointers.size===2) {
        const after=[...pointers.values()]; const distance=p => Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
        magnify(distance(after)/Math.max(1,distance(before)));
      } else { cx-=(event.clientX-previous.x)/scale; cy-=(event.clientY-previous.y)/scale; layout(); }
    });
    for (const event of ["pointerup","pointercancel","lostpointercapture"]) view.addEventListener(event,e => pointers.delete(e.pointerId));
    view.addEventListener("keydown",event => {
      if (event.target.closest("button")) return;
      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)) {
        event.preventDefault();
        anchor=null;
        cx += (event.key === "ArrowRight" ? 40 : event.key === "ArrowLeft" ? -40 : 0)/scale;
        cy += (event.key === "ArrowDown" ? 40 : event.key === "ArrowUp" ? -40 : 0)/scale;
        layout();
      }
      if (["+","=","-","0","PageDown","PageUp"].includes(event.key)) {
        event.preventDefault();
        if (event.key==="0") reset();
        else if (event.key.startsWith("Page")) turnPage(panel,event.key==="PageDown"?1:-1);
        else magnify(event.key==="-"?.8:1.25);
      }
    });
    const observer=new ResizeObserver(layout); observer.observe(view);
    return {el:view, destroy:() => observer.disconnect(),
      show(next,regions,highlight,center) {
        if (!next) { plane.hidden=true; message.hidden=false; message.textContent="Nessun foglio associato a questo riferimento."; return; }
        plane.hidden=!next.image;
        if (page?.id!==next.id) {
          page=next; plane.style.width=`${page.width}px`; plane.style.height=`${page.height}px`;
          svg.setAttribute("viewBox",`0 0 ${page.width} ${page.height}`);
          img.alt=`Foglio ${page.label}`; plane.hidden=!page.image;
          message.hidden=false; message.textContent=page.image?"Caricamento…":"Immagine non disponibile.";
          if (page.image) img.src=page.image; reset();
        } else if (img.complete && img.naturalWidth) message.hidden=true;
        view.dataset.pageId=page.id; svg.replaceChildren(); const points=[];
        for (const region of regions) {
          if (!region.points) continue;
          const polygon=document.createElementNS(svg.namespaceURI,"polygon");
          polygon.setAttribute("points",region.points); polygon.setAttribute("class",highlight); svg.append(polygon);
          points.push(...region.points.trim().split(/\s+/).map(p => p.split(",").map(Number)));
        }
        if (center && points.length) {
          anchor={x:(Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2,
            y:Math.min(...points.map(p=>p[1]))};
          layout();
        }
      }};
  }
  function renderFacsimile(panel) {
    panel.body.classList.add("image-body");
    panel.refs=new Set(panel.data.pages.flatMap(p => p.regions.flatMap(r => [r.ref,...(r.also || [])])));
    panel.viewer=imageViewer(panel);
    const nav=el("div","folio-navigation"); const select=el("select","form-select form-select-sm");
    select.setAttribute("aria-label","Foglio del facsimile");
    for (const page of panel.data.pages) { const option=el("option","",`Foglio ${page.label}`); option.value=page.id; select.append(option); }
    const previous=button("Foglio precedente","‹",() => turnPage(panel,-1));
    const next=button("Foglio successivo","›",() => turnPage(panel,1));
    select.addEventListener("change",() => goPage(panel,select.value));
    nav.append(previous,select,next); panel.body.append(nav,panel.viewer.el);
    panel.folio={select,previous,next};
  }
  function goPage(panel,id) {
    const page=panel.data.pages.find(p => p.id===id);
    if (!page) return;
    panel.page=id;
    if (page.first) navigate(page.first);
    else { panel.viewer.show(page,[],"",false); panel.folio.select.value=id; }
  }
  function turnPage(panel,direction) {
    const at=panel.data.pages.findIndex(p => p.id===panel.page);
    const next=panel.data.pages[at+direction]; if (next) goPage(panel,next.id);
  }
  function syncFacsimile(panel) {
    const at=resolve(state.v,panel.refs);
    const includes=(r,id) => r.ref===id || r.also?.includes(id);
    const page=at && (panel.data.pages.find(p => p.id===panel.page && p.regions.some(r => includes(r,at.id)))
      || panel.data.pages.find(p => p.regions.some(r => includes(r,at.id))));
    if (!page) { panel.viewer.show(null,[],"",false); return; }
    panel.page=page.id; panel.folio.select.value=page.id;
    panel.folio.previous.disabled=page===panel.data.pages[0]; panel.folio.next.disabled=page===panel.data.pages[panel.data.pages.length-1];
    const regions=page.regions.filter(r=>includes(r,at.id));
    panel.viewer.show(page,regions,at.fallback?"fallback-zone":"selected-zone",true);
  }

  function renderEntities(panel, scroll = true) {
    const previousScroll = panel.body.querySelector(".entity-list")?.scrollTop || 0;
    panel.body.classList.add("entities-body"); panel.body.replaceChildren();
    const occurrences=panel.data.entities.filter(e=>filters.has(e.type)).flatMap(entity=>entity.occurrences.map(o=>({...o,entity})))
      .sort((a,b)=>a.order-b.order);
    let index=occurrences.findIndex(o=>o.ref===state.v && (!panel.activeEntity || o.entity.id===panel.activeEntity));
    if (index<0) index=occurrences.findIndex(o=>o.ref===state.v);
    if (index<0) index=occurrences.findIndex(o=>chapterOf(o.ref)===chapterOf(state.v) && numberOf(o.ref)>=numberOf(state.v));
    if (index<0) index=0;
    const move=i=>{ panel.activeEntity=occurrences[i].entity.id; navigate(occurrences[i].ref); };
    const controls=el("div","entity-controls");
    const filter=button("Filtra categorie","",()=>openFilters(panel)); filter.classList.add("entity-filter");
    filter.setAttribute("aria-pressed",String(filters.size!==Object.keys(types).length));
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg"); svg.setAttribute("viewBox","0 0 24 24"); svg.setAttribute("aria-hidden","true");
    const path=document.createElementNS(svg.namespaceURI,"path"); path.setAttribute("d","M3 4h18l-7 8v8l-4-2v-6z");
    path.setAttribute("fill","none"); path.setAttribute("stroke","currentColor"); path.setAttribute("stroke-width","2"); svg.append(path); filter.append(svg);
    controls.append(el("span","occurrence-count",occurrences.length?`${index+1} / ${occurrences.length}`:""));
    if (index>0) {
      const previous=button("Occorrenza precedente","˄",()=>move(index-1));
      previous.classList.add("occurrence-nav"); controls.append(previous);
    }
    controls.append(filter);
    panel.body.append(controls);
    const list=el("div","entity-list"); panel.body.append(list);
    if (!occurrences.length) { list.append(el("p","","Nessuna entità nelle categorie selezionate.")); return; }
    for (const entity of panel.data.entities.filter(e=>filters.has(e.type))) {
      const card=el("article",`entity-card${entity.occurrences.some(o=>o.ref===state.v)?" selected":""}`);
      card.dataset.entityId=entity.id;
      const current=entity.occurrences.findIndex(o=>o.ref===state.v);
      const at=current<0?0:current;
      card.append(el("div","entity-meta",types[entity.type]),el("h3","",entity.name));
      if (entity.description) card.append(el("p","",entity.description));
      
      if (/^Q[1-9]\d*$/.test(entity.wikidata || "")) {
        const wiki = el("a", "", "Wikipedia");
        wiki.href = `https://www.wikidata.org/wiki/Special:GoToLinkedPage/itwiki/${entity.wikidata}`;
        const wd = el("a", "", "Wikidata");
        wd.href = `https://www.wikidata.org/wiki/${entity.wikidata}`;
        for (const link of [wiki, wd]) {
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.addEventListener("click", e => e.stopPropagation());
        }
        const links = el("div", "d-flex align-items-center gap-2");
        links.append(wiki, document.createTextNode("·"), wd);
        card.append(links);
      }

      const choose=i=>{panel.activeEntity=entity.id; navigate(entity.occurrences[i].ref);};
      card.tabIndex=0; card.setAttribute("role","button"); card.dataset.ref=entity.occurrences[at].ref;
      card.addEventListener("click",e=>{e.stopPropagation();choose(at);});
      card.addEventListener("keydown",e=>{if(e.target===card && ["Enter"," "].includes(e.key)){e.preventDefault();card.click();}});
      if (entity.occurrences.length>1) {
        const nav=el("div","entity-occurrences");
        if (at>0) nav.append(button("Precedente occorrenza di questa entità","‹",e=>{e.stopPropagation();choose(at-1);}));
        nav.append(el("span","",`${at+1} / ${entity.occurrences.length}`));
        if (at<entity.occurrences.length-1) nav.append(button("Successiva occorrenza di questa entità","›",e=>{e.stopPropagation();choose(at+1);}));
        card.append(nav);
      }
      list.append(card);
    }
    if (index<occurrences.length-1) {
      const next=button("Occorrenza successiva","˅",()=>move(index+1));
      next.classList.add("occurrence-nav"); panel.body.append(next);
    }
    const current=[...list.children].find(c=>c.dataset.entityId===occurrences[index].entity.id);
    if (current) current.classList.add("current-entity");
    list.scrollTop=scroll && current ? current.offsetTop : previousScroll;
  }
  function openFilters(panel) {
    filterPanel=panel;
    $("filter-options").replaceChildren();
    for (const [type,name] of Object.entries(types)) {
      const label=el("label","choice"); const input=el("input"); input.type="checkbox"; input.value=type; input.checked=filters.has(type);
      label.append(input,document.createTextNode(name)); $("filter-options").append(label);
    }
    modals.filter.show();
  }
  function openIndex() {
    const tree=$("index-tree"); tree.replaceChildren();
    const currentChapter=chapterOf(state.v);
    for (const book of edition.books) {
      const details=el("details"); details.open=book.chapters.some(c=>c.id===currentChapter); details.append(el("summary","",book.title));
      for (const chapter of book.chapters) {
        const choice=button(chapter.title,"",async ()=>{
          if (!panels.has("e") && state.p.length<5) { state.p.push("e"); await renderPanels(); }
          navigate(chapterStart(chapter));
          showPanel(panels.get("e")?.card);
          modals.index.hide();
        },"index-chapter");
        choice.append(el("strong","",chapter.title),el("span","index-description",chapter.description));
        if (chapter.id===currentChapter) choice.classList.add("active");
        details.append(choice);
      }
      tree.append(details);
    }
    modals.index.show();
  }
  function openAdd() {
    $("panel-options").replaceChildren();
    for (const group of ["Edizione","Facsimili","Trascrizioni","Entità"]) {
      const fieldset=el("fieldset"); fieldset.dataset.group=group; fieldset.append(el("legend","",group));
      for (const [code,config] of catalog) if (config.group===group) {
        const label=el("label","choice"); const input=el("input"); input.type="checkbox"; input.value=code;
        input.dataset.open=String(state.p.includes(code)); input.addEventListener("change",limitChoices);
        label.append(input,document.createTextNode(config.title+(state.p.includes(code)?" · aperto":""))); fieldset.append(label);
      }
      $("panel-options").append(fieldset);
    }
    limitChoices(); modals.add.show();
  }
  function limitChoices() {
    const inputs=[...$("panel-options").querySelectorAll("input")]; const selected=inputs.filter(i=>i.checked).length;
    const remaining=5-state.p.length-selected;
    inputs.forEach(i=>{i.disabled=i.dataset.open==="true" || (!i.checked && remaining===0);});
    $("confirm-add").disabled=!selected;
  }

  try {
    edition=await json("crespi");
    for (const book of edition.books) for (const chapter of book.chapters) {
      chapters.set(chapter.id,chapter);
      if (chapter.title || chapter.description) canonical.add(`${chapter.id}-h`);
      chapter.verses.forEach(v=>canonical.add(v.id));
    }
    catalog.set("e",{type:"edition",title:edition.title,group:"Edizione"});
    for (const [index,witness] of edition.manuscripts.entries()) for (const [code,type,suffix,label,group] of
      [["t","transcription","trascrizione","Trascrizione","Trascrizioni"],["f","facsimile","immagini","Facsimile","Facsimili"],["n","entities","entita","Entità","Entità"]]) {
      catalog.set(`${code}${index+1}`,{type,title:`${label} · ${witness.title}`,group,file:`${witness.id}-${suffix}`});
    }
    for (const name of ["index","add","filter"]) modals[name]=new bootstrap.Modal($(`${name}-modal`));
    state=readURL(); await renderPanels(true);
    $("load-status").hidden=true; $("open-index").disabled=false;
    $("open-index").addEventListener("click",openIndex); $("open-add").addEventListener("click",openAdd);
    $("confirm-add").addEventListener("click",()=>{
      writeURL(true); state.p=[...new Set([...state.p,...[...$("panel-options").querySelectorAll("input:checked")].map(i=>i.value)])].slice(0,5);
      modals.add.hide(); renderPanels(); writeURL();
    });
    $("confirm-filter").addEventListener("click",()=>{
      filters.clear(); $("filter-options").querySelectorAll("input:checked").forEach(i=>filters.add(i.value)); modals.filter.hide();
      for (const panel of panels.values()) if (panel.config.type==="entities" && panel.data) renderEntities(panel,false);
      filterPanel?.body.querySelector(".entity-filter")?.focus();
    });
    $("previous-panel").addEventListener("click",()=>movePanel(-1));
    $("next-panel").addEventListener("click",()=>movePanel(1));
    $("panels").addEventListener("scroll",updateCarousel,{passive:true});
    new ResizeObserver(updateCarousel).observe($("panels"));
    // Native scrolling cancels touch clicks; also suppress a click after a drag.
    let down, dragged=false;
    $("panels").addEventListener("pointerdown",e=>{down={x:e.clientX,y:e.clientY};dragged=false;},{passive:true});
    $("panels").addEventListener("pointermove",e=>{if(down && Math.hypot(e.clientX-down.x,e.clientY-down.y)>10) dragged=true;},{passive:true});
    $("panels").addEventListener("pointercancel",()=>{down=null;dragged=true;},{passive:true});
    $("panels").addEventListener("pointerup",()=>{down=null;},{passive:true});
    $("panels").addEventListener("click",e=>{if(dragged && e.detail){e.preventDefault();e.stopPropagation();}},{capture:true});
    window.addEventListener("popstate",()=>{
      state=readURL(); renderPanels(true).catch(console.error);
    });
  } catch (error) {
    console.error(error); $("load-status").hidden=false;
    $("load-status").textContent="Impossibile caricare l’edizione. Rigenera i JSON e apri la pagina tramite un server HTTP.";
  }
})();
