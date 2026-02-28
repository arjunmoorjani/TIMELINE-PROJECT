(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  const els = {
    viewport: document.getElementById("viewport"),
    timelineSvg: document.getElementById("timelineSvg"),
    zoomSlider: document.getElementById("zoomSlider"),
    zoomValue: document.getElementById("zoomValue"),
    minYearInput: document.getElementById("minYearInput"),
    maxYearInput: document.getElementById("maxYearInput"),
    applyRangeBtn: document.getElementById("applyRangeBtn"),
    exportPngBtn: document.getElementById("exportPngBtn"),
    exportJsonBtn: document.getElementById("exportJsonBtn"),
    importJsonBtn: document.getElementById("importJsonBtn"),
    importJsonInput: document.getElementById("importJsonInput"),

    eventForm: document.getElementById("eventForm"),
    titleInput: document.getElementById("titleInput"),
    yearInput: document.getElementById("yearInput"),
    eraSelect: document.getElementById("eraSelect"),
    colorInput: document.getElementById("colorInput"),
    hexInput: document.getElementById("hexInput"),
    notesInput: document.getElementById("notesInput"),
    imageInput: document.getElementById("imageInput"),
    imgFitSelect: document.getElementById("imgFitSelect"),
    removeImageBtn: document.getElementById("removeImageBtn"),

    addResourceBtn: document.getElementById("addResourceBtn"),
    resourcesList: document.getElementById("resourcesList"),

    categoryToggleBtn: document.getElementById("categoryToggleBtn"),
    categoryMenu: document.getElementById("categoryMenu"),
    selectedCategoryChips: document.getElementById("selectedCategoryChips"),
    newCategoryName: document.getElementById("newCategoryName"),
    newCategoryCode: document.getElementById("newCategoryCode"),
    addCategoryBtn: document.getElementById("addCategoryBtn"),

    codePreview: document.getElementById("codePreview"),
    selectedIdPreview: document.getElementById("selectedIdPreview"),

    addEventBtn: document.getElementById("addEventBtn"),
    saveEventBtn: document.getElementById("saveEventBtn"),
    deleteEventBtn: document.getElementById("deleteEventBtn"),
    clearFormBtn: document.getElementById("clearFormBtn")
  };

  const CONFIG = {
    storageKey: "timeline-editor-v3",
    leftMargin: 120,
    rightPadding: 200,
    axisPaddingY: 80,
    initialCardWidth: 220,
    initialCardHeight: 130,
    minCardWidth: 140,
    minCardHeight: 80
  };

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function toInt(value, fallback = null) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : fallback;
  }

  function deepCopy(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function sanitizeHex(value, fallback = "#4f46e5") {
    const text = String(value || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
  }

  function formatDisplayYear(year) {
    if (year < 0) return `${Math.abs(year)} BCE`;
    if (year > 0) return `${year} CE`;
    return "0";
  }

  function formatYearToken(year) {
    const abs4 = String(Math.abs(year)).padStart(4, "0");
    if (year < 0) return `${abs4}BCE`;
    return abs4;
  }

  function sortCodes(codes) {
    return [...codes].sort((a, b) => a.localeCompare(b));
  }

  const Store = {
    state: {
      minYear: -1000,
      maxYear: 2100,
      pxPerYear: 40,
      categories: [
        { name: "General", code: "GEN" }
      ],
      events: [],
      selectedEventId: null
    },

    async init() {
      const local = localStorage.getItem(CONFIG.storageKey);
      if (local) {
        try {
          const parsed = JSON.parse(local);
          this.loadDataset(parsed, false);
          return;
        } catch {
          localStorage.removeItem(CONFIG.storageKey);
        }
      }

      try {
        const res = await fetch("data.json", { cache: "no-store" });
        if (!res.ok) throw new Error("seed load failed");
        const seed = await res.json();
        if (Array.isArray(seed)) {
          this.state.events = seed.map((item) => this.normalizeEvent(item));
        } else {
          this.loadDataset(seed, false);
        }
      } catch {
        this.state.events = [];
      }

      this.recomputeCodes();
      this.persist();
    },

    yearToX(year) {
      return (year - this.state.minYear) * this.state.pxPerYear + CONFIG.leftMargin;
    },

    xToYear(x) {
      return Math.round((x - CONFIG.leftMargin) / this.state.pxPerYear + this.state.minYear);
    },

    normalizeEvent(raw) {
      const id = String(raw.id || crypto.randomUUID());
      const year = toInt(raw.year, 0);
      return {
        id,
        title: String(raw.title || "Untitled"),
        year,
        y: toInt(raw.y, 20),
        color: sanitizeHex(raw.color),
        notes: String(raw.notes || ""),
        categories: Array.isArray(raw.categories) ? raw.categories.map(String) : [],
        code: String(raw.code || ""),
        resources: Array.isArray(raw.resources)
          ? raw.resources.map((r) => ({ type: String(r.type || "note"), value: String(r.value || "") }))
          : [],
        imageDataUrl: typeof raw.imageDataUrl === "string" ? raw.imageDataUrl : null,
        imgFit: raw.imgFit === "contain" ? "contain" : "cover",
        w: clamp(toInt(raw.w, CONFIG.initialCardWidth), CONFIG.minCardWidth, 560),
        h: clamp(toInt(raw.h, CONFIG.initialCardHeight), CONFIG.minCardHeight, 520)
      };
    },

    loadDataset(dataset, persist = true) {
      if (!dataset || typeof dataset !== "object") return;
      if (Number.isFinite(dataset.minYear)) this.state.minYear = Math.round(dataset.minYear);
      if (Number.isFinite(dataset.maxYear)) this.state.maxYear = Math.round(dataset.maxYear);
      if (this.state.maxYear <= this.state.minYear) this.state.maxYear = this.state.minYear + 10;
      if (Number.isFinite(dataset.pxPerYear)) this.state.pxPerYear = clamp(dataset.pxPerYear, 6, 220);
      if (Array.isArray(dataset.categories) && dataset.categories.length) {
        this.state.categories = dataset.categories
          .map((c) => ({ name: String(c.name || ""), code: String(c.code || "").toUpperCase() }))
          .filter((c) => /^[A-Z0-9]{2,6}$/.test(c.code));
      }
      if (!this.state.categories.length) this.state.categories = [{ name: "General", code: "GEN" }];
      if (Array.isArray(dataset.events)) {
        this.state.events = dataset.events.map((e) => this.normalizeEvent(e));
      }
      this.recomputeCodes();
      if (persist) this.persist();
    },

    persist() {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(this.exportDataset()));
    },

    exportDataset() {
      return {
        minYear: this.state.minYear,
        maxYear: this.state.maxYear,
        pxPerYear: this.state.pxPerYear,
        categories: this.state.categories,
        events: this.state.events
      };
    },

    getSelectedEvent() {
      return this.state.events.find((e) => e.id === this.state.selectedEventId) || null;
    },

    select(id) {
      this.state.selectedEventId = id;
    },

    clearSelection() {
      this.state.selectedEventId = null;
    },

    addEvent(payload) {
      const event = this.normalizeEvent({ ...payload, id: crypto.randomUUID() });
      this.state.events.push(event);
      this.state.selectedEventId = event.id;
      this.autoExpandForYear(event.year);
      this.recomputeCodes();
      this.persist();
      return event;
    },

    updateEvent(id, patch) {
      const idx = this.state.events.findIndex((e) => e.id === id);
      if (idx === -1) return null;
      const merged = this.normalizeEvent({ ...this.state.events[idx], ...patch, id });
      this.state.events[idx] = merged;
      this.autoExpandForYear(merged.year);
      this.recomputeCodes();
      this.persist();
      return merged;
    },

    removeEvent(id) {
      this.state.events = this.state.events.filter((e) => e.id !== id);
      if (this.state.selectedEventId === id) this.state.selectedEventId = null;
      this.recomputeCodes();
      this.persist();
    },

    addCategory(name, code) {
      const cleanCode = String(code || "").toUpperCase().trim();
      const cleanName = String(name || "").trim();
      if (!/^[A-Z0-9]{2,6}$/.test(cleanCode)) throw new Error("Category code must be 2-6 chars A-Z/0-9");
      if (!cleanName) throw new Error("Category name required");
      if (this.state.categories.some((c) => c.code === cleanCode)) throw new Error("Category code already exists");
      this.state.categories.push({ name: cleanName, code: cleanCode });
      this.persist();
    },

    autoExpandForYear(year) {
      if (year < this.state.minYear) this.state.minYear = year;
      if (year > this.state.maxYear) this.state.maxYear = year;
    },

    recomputeCodes() {
      const byYear = new Map();
      for (const evt of this.state.events) {
        if (!byYear.has(evt.year)) byYear.set(evt.year, []);
        byYear.get(evt.year).push(evt);
      }

      byYear.forEach((eventsInYear, year) => {
        eventsInYear.sort((a, b) => a.id.localeCompare(b.id));
        eventsInYear.forEach((evt, i) => {
          const catCodes = sortCodes(evt.categories).join("-") || "GEN";
          const yearToken = formatYearToken(year);
          const seq = String(i + 1).padStart(2, "0");
          evt.code = `${catCodes}-${yearToken}-${seq}`;
        });
      });
    }
  };

  const Renderer = {
    render() {
      const { minYear, maxYear } = Store.state;
      const width = Math.max(
        els.viewport.clientWidth,
        Store.yearToX(maxYear) + CONFIG.rightPadding
      );
      const eventBottom = Store.state.events.reduce((acc, e) => Math.max(acc, e.y + e.h), 0);
      const height = Math.max(700, els.viewport.clientHeight, CONFIG.axisPaddingY * 2 + eventBottom + 150);
      const spineY = Math.round(height / 2);

      els.timelineSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      els.timelineSvg.setAttribute("width", String(width));
      els.timelineSvg.setAttribute("height", String(height));
      els.timelineSvg.innerHTML = "";

      this.drawSpine(width, spineY);
      this.drawTicks(width, spineY);
      this.drawEvents(spineY);

      els.zoomValue.textContent = `${Store.state.pxPerYear} px/year`;
      els.minYearInput.value = String(Store.state.minYear);
      els.maxYearInput.value = String(Store.state.maxYear);
    },

    drawSpine(width, y) {
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", "0");
      line.setAttribute("y1", String(y));
      line.setAttribute("x2", String(width));
      line.setAttribute("y2", String(y));
      line.setAttribute("stroke", "#333");
      line.setAttribute("stroke-width", "1");
      els.timelineSvg.appendChild(line);
    },

    niceStep(targetYears) {
      const bases = [1, 2, 5];
      const power = Math.pow(10, Math.floor(Math.log10(Math.max(1, targetYears))));
      let best = power;
      for (const b of bases) {
        const cand = b * power;
        if (cand >= targetYears) return cand;
        best = cand;
      }
      return 10 * power > best ? 10 * power : best;
    },

    drawTicks(_, spineY) {
      const { minYear, maxYear, pxPerYear } = Store.state;
      const minorStep = this.niceStep(42 / pxPerYear);
      const majorStep = minorStep * 5;
      const start = Math.floor(minYear / minorStep) * minorStep;

      for (let y = start; y <= maxYear; y += minorStep) {
        if (y < minYear) continue;
        const x = Store.yearToX(y);
        const isMajor = y % majorStep === 0;

        const tick = document.createElementNS(SVG_NS, "line");
        tick.setAttribute("x1", String(x));
        tick.setAttribute("x2", String(x));
        tick.setAttribute("y1", String(spineY - (isMajor ? 9 : 4)));
        tick.setAttribute("y2", String(spineY + (isMajor ? 9 : 4)));
        tick.setAttribute("stroke", "#555");
        tick.setAttribute("stroke-width", isMajor ? "1.5" : "1");
        els.timelineSvg.appendChild(tick);

        if (isMajor) {
          const label = document.createElementNS(SVG_NS, "text");
          label.textContent = formatDisplayYear(y);
          label.setAttribute("x", String(x + 4));
          label.setAttribute("y", String(spineY - 12));
          label.setAttribute("font-size", "12");
          label.setAttribute("fill", "#222");
          els.timelineSvg.appendChild(label);
        }
      }
    },

    drawEvents(spineY) {
      for (const evt of Store.state.events) {
        const x = Store.yearToX(evt.year);
        const y = evt.y + spineY;
        const group = document.createElementNS(SVG_NS, "g");
        group.classList.add("card");
        group.dataset.id = evt.id;
        group.setAttribute("transform", `translate(${x}, ${y})`);

        if (Store.state.selectedEventId === evt.id) {
          group.classList.add("selected");
        }

        const rect = document.createElementNS(SVG_NS, "rect");
        rect.classList.add("card-rect");
        rect.setAttribute("x", "0");
        rect.setAttribute("y", "0");
        rect.setAttribute("rx", "8");
        rect.setAttribute("ry", "8");
        rect.setAttribute("width", String(evt.w));
        rect.setAttribute("height", String(evt.h));
        rect.setAttribute("fill", "#fff");
        rect.setAttribute("stroke", "#aaa");
        rect.setAttribute("stroke-width", "1");
        group.appendChild(rect);

        const stripe = document.createElementNS(SVG_NS, "rect");
        stripe.setAttribute("x", "0");
        stripe.setAttribute("y", "0");
        stripe.setAttribute("width", "6");
        stripe.setAttribute("height", String(evt.h));
        stripe.setAttribute("fill", evt.color);
        group.appendChild(stripe);

        let textY = 18;
        if (evt.imageDataUrl) {
          const imageHeight = Math.max(40, Math.floor(evt.h * 0.45));
          const clipId = `clip-${evt.id}`;

          const defs = document.createElementNS(SVG_NS, "defs");
          const clip = document.createElementNS(SVG_NS, "clipPath");
          clip.setAttribute("id", clipId);
          const clipRect = document.createElementNS(SVG_NS, "rect");
          clipRect.setAttribute("x", "7");
          clipRect.setAttribute("y", "7");
          clipRect.setAttribute("width", String(evt.w - 14));
          clipRect.setAttribute("height", String(imageHeight));
          clip.setAttribute("clipPathUnits", "userSpaceOnUse");
          clip.appendChild(clipRect);
          defs.appendChild(clip);
          group.appendChild(defs);

          const image = document.createElementNS(SVG_NS, "image");
          image.setAttributeNS("http://www.w3.org/1999/xlink", "href", evt.imageDataUrl);
          image.setAttribute("x", "7");
          image.setAttribute("y", "7");
          image.setAttribute("width", String(evt.w - 14));
          image.setAttribute("height", String(imageHeight));
          image.setAttribute("preserveAspectRatio", evt.imgFit === "contain" ? "xMidYMid meet" : "xMidYMid slice");
          image.setAttribute("clip-path", `url(#${clipId})`);
          group.appendChild(image);

          textY = imageHeight + 24;
        }

        const codeText = document.createElementNS(SVG_NS, "text");
        codeText.textContent = evt.code;
        codeText.setAttribute("x", "12");
        codeText.setAttribute("y", String(textY));
        codeText.setAttribute("font-size", "11");
        codeText.setAttribute("fill", "#444");
        group.appendChild(codeText);

        const titleText = document.createElementNS(SVG_NS, "text");
        titleText.textContent = evt.title;
        titleText.setAttribute("x", "12");
        titleText.setAttribute("y", String(textY + 18));
        titleText.setAttribute("font-size", "14");
        titleText.setAttribute("font-weight", "600");
        titleText.setAttribute("fill", "#111");
        group.appendChild(titleText);

        const dateText = document.createElementNS(SVG_NS, "text");
        dateText.textContent = formatDisplayYear(evt.year);
        dateText.setAttribute("x", "12");
        dateText.setAttribute("y", String(textY + 35));
        dateText.setAttribute("font-size", "12");
        dateText.setAttribute("fill", "#555");
        group.appendChild(dateText);

        if (Store.state.selectedEventId === evt.id) {
          const handle = document.createElementNS(SVG_NS, "rect");
          handle.classList.add("resize-handle");
          handle.dataset.id = evt.id;
          handle.setAttribute("x", String(evt.w - 12));
          handle.setAttribute("y", String(evt.h - 12));
          handle.setAttribute("width", "10");
          handle.setAttribute("height", "10");
          handle.setAttribute("fill", "#222");
          group.appendChild(handle);
        }

        els.timelineSvg.appendChild(group);
      }
    }
  };

  const DragController = {
    drag: null,

    bind() {
      els.timelineSvg.addEventListener("pointerdown", (e) => this.onPointerDown(e));
      els.timelineSvg.addEventListener("pointermove", (e) => this.onPointerMove(e));
      els.timelineSvg.addEventListener("pointerup", () => this.onPointerUp());
      els.timelineSvg.addEventListener("pointercancel", () => this.onPointerUp());
    },

    onPointerDown(e) {
      const handle = e.target.closest(".resize-handle");
      if (handle) {
        const id = handle.dataset.id;
        const evt = Store.state.events.find((x) => x.id === id);
        if (!evt) return;
        this.drag = {
          type: "resize",
          id,
          startX: e.clientX,
          startY: e.clientY,
          startW: evt.w,
          startH: evt.h
        };
        els.timelineSvg.setPointerCapture(e.pointerId);
        return;
      }

      const card = e.target.closest(".card");
      if (card) {
        const id = card.dataset.id;
        const evt = Store.state.events.find((x) => x.id === id);
        if (!evt) return;
        Store.select(id);
        FormController.loadSelected();
        Renderer.render();

        this.drag = {
          type: "move",
          id,
          pointerId: e.pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startYear: evt.year,
          startY: evt.y
        };
        els.timelineSvg.setPointerCapture(e.pointerId);
      } else {
        Store.clearSelection();
        FormController.loadSelected();
        Renderer.render();
      }
    },

    onPointerMove(e) {
      if (!this.drag) return;
      const evt = Store.state.events.find((x) => x.id === this.drag.id);
      if (!evt) return;

      if (this.drag.type === "move") {
        const svgPoint = this.clientToSvg(e.clientX, e.clientY);
        const year = Store.xToYear(svgPoint.x);
        const dyPixels = e.clientY - this.drag.startClientY;

        evt.year = year;
        evt.y = this.drag.startY + dyPixels;
        Store.autoExpandForYear(year);
        Store.recomputeCodes();
        Store.persist();
        FormController.syncCodePreview();
        FormController.loadSelected(false);
        Renderer.render();
      } else if (this.drag.type === "resize") {
        const dw = e.clientX - this.drag.startX;
        const dh = e.clientY - this.drag.startY;
        evt.w = clamp(this.drag.startW + dw, CONFIG.minCardWidth, 560);
        evt.h = clamp(this.drag.startH + dh, CONFIG.minCardHeight, 520);
        Store.persist();
        Renderer.render();
      }
    },

    onPointerUp() {
      this.drag = null;
    },

    clientToSvg(clientX, clientY) {
      const pt = els.timelineSvg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const matrix = els.timelineSvg.getScreenCTM();
      if (!matrix) return { x: 0, y: 0 };
      const transformed = pt.matrixTransform(matrix.inverse());
      return { x: transformed.x, y: transformed.y };
    }
  };

  const FormController = {
    selectedCategoryCodes: new Set(["GEN"]),

    bind() {
      els.colorInput.addEventListener("input", () => {
        els.hexInput.value = els.colorInput.value;
      });
      els.hexInput.addEventListener("input", () => {
        const clean = sanitizeHex(els.hexInput.value, els.colorInput.value);
        if (clean !== els.colorInput.value) els.colorInput.value = clean;
      });

      els.addResourceBtn.addEventListener("click", () => this.addResourceRow());
      els.addEventBtn.addEventListener("click", () => this.onAddEvent());
      els.eventForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.onSaveEvent();
      });
      els.deleteEventBtn.addEventListener("click", () => this.onDeleteEvent());
      els.clearFormBtn.addEventListener("click", () => this.clearForm());
      els.imageInput.addEventListener("change", (e) => this.onImagePick(e));
      els.removeImageBtn.addEventListener("click", () => this.onRemoveImage());
      els.addCategoryBtn.addEventListener("click", () => this.onAddCategory());

      els.categoryToggleBtn.addEventListener("click", () => {
        els.categoryMenu.hidden = !els.categoryMenu.hidden;
      });
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".category-picker")) els.categoryMenu.hidden = true;
      });

      [els.yearInput, els.eraSelect].forEach((el) => {
        el.addEventListener("input", () => this.syncCodePreview());
        el.addEventListener("change", () => this.syncCodePreview());
      });

      els.imgFitSelect.addEventListener("change", () => {
        const selected = Store.getSelectedEvent();
        if (!selected) return;
        Store.updateEvent(selected.id, { imgFit: els.imgFitSelect.value });
        Renderer.render();
      });

      this.renderCategoryMenu();
      this.renderSelectedChips();
      this.syncCodePreview();
      this.clearForm();
    },

    addResourceRow(resource = { type: "note", value: "" }) {
      const row = document.createElement("div");
      row.className = "resource-row";
      row.innerHTML = `
        <select>
          <option value="book">book</option>
          <option value="url">url</option>
          <option value="paper">paper</option>
          <option value="note">note</option>
        </select>
        <input type="text" placeholder="citation or URL" />
        <button type="button">x</button>
      `;
      row.querySelector("select").value = ["book", "url", "paper", "note"].includes(resource.type)
        ? resource.type
        : "note";
      row.querySelector("input").value = resource.value || "";
      row.querySelector("button").addEventListener("click", () => row.remove());
      els.resourcesList.appendChild(row);
    },

    collectResources() {
      const rows = Array.from(els.resourcesList.querySelectorAll(".resource-row"));
      return rows
        .map((row) => ({
          type: row.querySelector("select").value,
          value: row.querySelector("input").value.trim()
        }))
        .filter((r) => r.value.length > 0);
    },

    getFormYear() {
      const raw = toInt(els.yearInput.value, 0);
      if (els.eraSelect.value === "BCE") return -Math.abs(raw);
      return Math.abs(raw);
    },

    formToPayload(base = {}) {
      return {
        ...base,
        title: els.titleInput.value.trim() || "Untitled",
        year: this.getFormYear(),
        color: sanitizeHex(els.colorInput.value),
        notes: els.notesInput.value,
        categories: Array.from(this.selectedCategoryCodes),
        resources: this.collectResources(),
        imgFit: els.imgFitSelect.value === "contain" ? "contain" : "cover"
      };
    },

    onAddEvent() {
      const centerY = 0;
      const payload = this.formToPayload({
        y: centerY,
        imageDataUrl: null,
        w: CONFIG.initialCardWidth,
        h: CONFIG.initialCardHeight
      });
      const evt = Store.addEvent(payload);
      this.loadEvent(evt);
      Renderer.render();
      this.scrollToEvent(evt);
    },

    onSaveEvent() {
      const selected = Store.getSelectedEvent();
      if (!selected) return;
      const updated = Store.updateEvent(selected.id, this.formToPayload({
        imageDataUrl: selected.imageDataUrl,
        w: selected.w,
        h: selected.h,
        y: selected.y
      }));
      if (updated) {
        this.loadEvent(updated);
        Renderer.render();
      }
    },

    onDeleteEvent() {
      const selected = Store.getSelectedEvent();
      if (!selected) return;
      Store.removeEvent(selected.id);
      this.clearForm();
      Renderer.render();
    },

    async onImagePick(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const selected = Store.getSelectedEvent();
      if (!selected) return;

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Image read failed"));
        reader.readAsDataURL(file);
      });

      Store.updateEvent(selected.id, { imageDataUrl: dataUrl });
      Renderer.render();
      e.target.value = "";
    },

    onRemoveImage() {
      const selected = Store.getSelectedEvent();
      if (!selected) return;
      Store.updateEvent(selected.id, { imageDataUrl: null });
      Renderer.render();
    },

    onAddCategory() {
      try {
        Store.addCategory(els.newCategoryName.value, els.newCategoryCode.value);
        els.newCategoryName.value = "";
        els.newCategoryCode.value = "";
        this.renderCategoryMenu();
      } catch (err) {
        alert(err.message);
      }
    },

    renderCategoryMenu() {
      els.categoryMenu.innerHTML = "";
      for (const cat of Store.state.categories) {
        const row = document.createElement("label");
        row.className = "picker-item";
        row.innerHTML = `<input type="checkbox" value="${cat.code}" /> <span>${cat.code} - ${cat.name}</span>`;
        const cb = row.querySelector("input");
        cb.checked = this.selectedCategoryCodes.has(cat.code);
        cb.addEventListener("change", () => {
          if (cb.checked) this.selectedCategoryCodes.add(cat.code);
          else this.selectedCategoryCodes.delete(cat.code);
          this.renderSelectedChips();
          this.syncCodePreview();
        });
        els.categoryMenu.appendChild(row);
      }
    },

    renderSelectedChips() {
      els.selectedCategoryChips.innerHTML = "";
      const list = sortCodes(Array.from(this.selectedCategoryCodes));
      if (!list.length) {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = "GEN";
        els.selectedCategoryChips.appendChild(chip);
        return;
      }
      for (const code of list) {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = code;
        els.selectedCategoryChips.appendChild(chip);
      }
    },

    loadEvent(evt) {
      Store.select(evt.id);
      els.selectedIdPreview.textContent = evt.id;
      els.titleInput.value = evt.title;
      if (evt.year < 0) {
        els.eraSelect.value = "BCE";
        els.yearInput.value = String(Math.abs(evt.year));
      } else {
        els.eraSelect.value = "CE";
        els.yearInput.value = String(Math.abs(evt.year));
      }
      els.colorInput.value = sanitizeHex(evt.color);
      els.hexInput.value = sanitizeHex(evt.color);
      els.notesInput.value = evt.notes;
      els.imgFitSelect.value = evt.imgFit;

      this.selectedCategoryCodes = new Set(evt.categories);
      this.renderCategoryMenu();
      this.renderSelectedChips();

      els.resourcesList.innerHTML = "";
      evt.resources.forEach((resource) => this.addResourceRow(resource));
      this.syncCodePreview(evt.code);
    },

    loadSelected(updateResourceRows = true) {
      const selected = Store.getSelectedEvent();
      if (!selected) {
        this.clearForm();
        return;
      }
      els.selectedIdPreview.textContent = selected.id;
      els.titleInput.value = selected.title;
      if (selected.year < 0) {
        els.eraSelect.value = "BCE";
        els.yearInput.value = String(Math.abs(selected.year));
      } else {
        els.eraSelect.value = "CE";
        els.yearInput.value = String(Math.abs(selected.year));
      }
      els.colorInput.value = sanitizeHex(selected.color);
      els.hexInput.value = sanitizeHex(selected.color);
      els.notesInput.value = selected.notes;
      els.imgFitSelect.value = selected.imgFit;

      this.selectedCategoryCodes = new Set(selected.categories);
      this.renderCategoryMenu();
      this.renderSelectedChips();

      if (updateResourceRows) {
        els.resourcesList.innerHTML = "";
        selected.resources.forEach((resource) => this.addResourceRow(resource));
      }
      this.syncCodePreview(selected.code);
    },

    clearForm() {
      Store.clearSelection();
      els.selectedIdPreview.textContent = "None";
      els.titleInput.value = "";
      els.yearInput.value = "200";
      els.eraSelect.value = "CE";
      els.colorInput.value = "#4f46e5";
      els.hexInput.value = "#4f46e5";
      els.notesInput.value = "";
      els.imgFitSelect.value = "cover";
      els.resourcesList.innerHTML = "";
      this.selectedCategoryCodes = new Set(["GEN"]);
      this.renderCategoryMenu();
      this.renderSelectedChips();
      this.syncCodePreview();
    },

    syncCodePreview(existingCode = null) {
      if (existingCode) {
        els.codePreview.textContent = existingCode;
        return;
      }
      const year = this.getFormYear();
      const catCodes = sortCodes(Array.from(this.selectedCategoryCodes)).join("-") || "GEN";
      els.codePreview.textContent = `${catCodes}-${formatYearToken(year)}-01`;
    },

    scrollToEvent(evt) {
      const x = Store.yearToX(evt.year);
      const y = evt.y + els.timelineSvg.height.baseVal.value / 2;
      els.viewport.scrollTo({
        left: Math.max(0, x - els.viewport.clientWidth * 0.4),
        top: Math.max(0, y - els.viewport.clientHeight * 0.4),
        behavior: "smooth"
      });
    }
  };

  const Exporter = {
    exportJSON() {
      const blob = new Blob([JSON.stringify(Store.exportDataset(), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `timeline-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },

    async importJSON(file) {
      const text = await file.text();
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        Store.loadDataset({ events: data });
      } else {
        Store.loadDataset(data);
      }
      FormController.clearForm();
      Renderer.render();
    },

    async exportPNG() {
      const svg = els.timelineSvg;
      const width = Number(svg.getAttribute("width"));
      const height = Number(svg.getAttribute("height"));

      const clone = svg.cloneNode(true);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", String(width));
      clone.setAttribute("height", String(height));

      const serialized = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const pngUrl = URL.createObjectURL(pngBlob);
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = `timeline-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(pngUrl);
    }
  };

  function bindTopToolbar() {
    els.zoomSlider.addEventListener("input", () => {
      const old = Store.state.pxPerYear;
      const next = clamp(Number(els.zoomSlider.value), 6, 220);
      if (old === next) return;

      const centerX = els.viewport.scrollLeft + els.viewport.clientWidth / 2;
      const centerYear = Store.xToYear(centerX);

      Store.state.pxPerYear = next;
      Store.persist();
      Renderer.render();

      const newX = Store.yearToX(centerYear);
      els.viewport.scrollLeft = Math.max(0, newX - els.viewport.clientWidth / 2);
    });

    els.applyRangeBtn.addEventListener("click", () => {
      const min = toInt(els.minYearInput.value, Store.state.minYear);
      const max = toInt(els.maxYearInput.value, Store.state.maxYear);
      if (max <= min) {
        alert("Max year must be greater than min year.");
        return;
      }
      Store.state.minYear = min;
      Store.state.maxYear = max;
      Store.persist();
      Renderer.render();
    });

    els.exportJsonBtn.addEventListener("click", () => Exporter.exportJSON());
    els.importJsonBtn.addEventListener("click", () => els.importJsonInput.click());
    els.importJsonInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        await Exporter.importJSON(file);
      } catch (err) {
        alert(`Import failed: ${err.message}`);
      }
      e.target.value = "";
    });
    els.exportPngBtn.addEventListener("click", async () => {
      try {
        await Exporter.exportPNG();
      } catch (err) {
        alert(`PNG export failed: ${err.message}`);
      }
    });

    window.addEventListener("resize", () => Renderer.render());
  }

  async function init() {
    await Store.init();
    bindTopToolbar();
    DragController.bind();
    FormController.bind();
    Renderer.render();
  }

  init();
})();
