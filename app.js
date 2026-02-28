(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const XLINK_NS = "http://www.w3.org/1999/xlink";

  const CONFIG = {
    dbName: "timeline-editor-db-v1",
    dbVersion: 1,
    settingsKey: "timeline-editor-settings-v1",
    leftMargin: 120,
    rightPadding: 220,
    axisPaddingY: 80,
    initialCardWidth: 220,
    initialCardHeight: 130,
    minCardWidth: 140,
    minCardHeight: 80,
    spanMinHeight: 34,
    autoSaveDelayMs: 350
  };

  const els = {
    viewport: document.getElementById("viewport"),
    timelineSvg: document.getElementById("timelineSvg"),

    projectSelect: document.getElementById("projectSelect"),
    openProjectBtn: document.getElementById("openProjectBtn"),
    newProjectBtn: document.getElementById("newProjectBtn"),
    renameProjectBtn: document.getElementById("renameProjectBtn"),
    duplicateProjectBtn: document.getElementById("duplicateProjectBtn"),
    deleteProjectBtn: document.getElementById("deleteProjectBtn"),
    saveAsProjectBtn: document.getElementById("saveAsProjectBtn"),

    zoomSlider: document.getElementById("zoomSlider"),
    zoomValue: document.getElementById("zoomValue"),
    minYearInput: document.getElementById("minYearInput"),
    maxYearInput: document.getElementById("maxYearInput"),
    applyRangeBtn: document.getElementById("applyRangeBtn"),
    exportPngBtn: document.getElementById("exportPngBtn"),
    exportJsonBtn: document.getElementById("exportJsonBtn"),
    importJsonBtn: document.getElementById("importJsonBtn"),
    importJsonInput: document.getElementById("importJsonInput"),
    themeToggleBtn: document.getElementById("themeToggleBtn"),

    sidebar: document.getElementById("sidebar"),
    sidebarCollapseBtn: document.getElementById("sidebarCollapseBtn"),
    sidebarExpandBtn: document.getElementById("sidebarExpandBtn"),
    sidebarWideToggle: document.getElementById("sidebarWideToggle"),

    eventForm: document.getElementById("eventForm"),
    itemTypeSelect: document.getElementById("itemTypeSelect"),
    zInput: document.getElementById("zInput"),
    titleInput: document.getElementById("titleInput"),
    pointDateFields: document.getElementById("pointDateFields"),
    spanDateFields: document.getElementById("spanDateFields"),
    yearInput: document.getElementById("yearInput"),
    eraSelect: document.getElementById("eraSelect"),
    startYearInput: document.getElementById("startYearInput"),
    startEraSelect: document.getElementById("startEraSelect"),
    endYearInput: document.getElementById("endYearInput"),
    endEraSelect: document.getElementById("endEraSelect"),
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
    clearFormBtn: document.getElementById("clearFormBtn"),
    bringFrontBtn: document.getElementById("bringFrontBtn"),
    sendBackBtn: document.getElementById("sendBackBtn")
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

  function generateId(prefix) {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  }

  function formatDisplayYear(year) {
    if (year < 0) return `${Math.abs(year)} BCE`;
    if (year > 0) return `${year} CE`;
    return "0";
  }

  function yearToEra(year) {
    if (year < 0) return { value: Math.abs(year), era: "BCE" };
    return { value: Math.abs(year), era: "CE" };
  }

  function eraToYear(value, era) {
    const n = toInt(value, 0);
    return era === "BCE" ? -Math.abs(n) : Math.abs(n);
  }

  function formatYearToken(year) {
    const abs4 = String(Math.abs(year)).padStart(4, "0");
    if (year < 0) return `${abs4}BCE`;
    return abs4;
  }

  function sortCodes(codes) {
    return [...codes].sort((a, b) => a.localeCompare(b));
  }

  function niceTickStep(targetYears) {
    const bases = [1, 2, 5];
    const power = Math.pow(10, Math.floor(Math.log10(Math.max(1, targetYears))));
    for (const base of bases) {
      const candidate = base * power;
      if (candidate >= targetYears) return candidate;
    }
    return 10 * power;
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("blob read failed"));
      reader.readAsDataURL(blob);
    });
  }

  async function dataURLToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    return response.blob();
  }

  const SettingsStore = {
    state: {
      theme: "dark",
      sidebarCollapsed: false,
      sidebarWide: false,
      lastProjectId: null
    },

    load() {
      const raw = localStorage.getItem(CONFIG.settingsKey);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        this.state.theme = parsed.theme === "light" ? "light" : "dark";
        this.state.sidebarCollapsed = Boolean(parsed.sidebarCollapsed);
        this.state.sidebarWide = Boolean(parsed.sidebarWide);
        this.state.lastProjectId = parsed.lastProjectId || null;
      } catch {
        localStorage.removeItem(CONFIG.settingsKey);
      }
    },

    save() {
      localStorage.setItem(CONFIG.settingsKey, JSON.stringify(this.state));
    },

    applyTheme() {
      const root = document.documentElement;
      root.classList.toggle("theme-dark", this.state.theme === "dark");
      root.classList.toggle("theme-light", this.state.theme === "light");
      els.themeToggleBtn.textContent = this.state.theme === "dark" ? "Theme: Dark" : "Theme: Light";
    },

    applySidebarPrefs() {
      document.body.classList.toggle("sidebar-collapsed", this.state.sidebarCollapsed);
      document.body.classList.toggle("sidebar-wide", this.state.sidebarWide);
      els.sidebarWideToggle.checked = this.state.sidebarWide;
    },

    setTheme(theme) {
      this.state.theme = theme;
      this.applyTheme();
      this.save();
      Renderer.render();
    },

    setSidebarCollapsed(value) {
      this.state.sidebarCollapsed = value;
      this.applySidebarPrefs();
      this.save();
      Renderer.render();
    },

    setSidebarWide(value) {
      this.state.sidebarWide = value;
      this.applySidebarPrefs();
      this.save();
      Renderer.render();
    },

    setLastProjectId(projectId) {
      this.state.lastProjectId = projectId;
      this.save();
    }
  };

  const ProjectStore = {
    dbPromise: null,

    openDb() {
      if (this.dbPromise) return this.dbPromise;
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(CONFIG.dbName, CONFIG.dbVersion);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("projects")) {
            db.createObjectStore("projects", { keyPath: "projectId" });
          }
          if (!db.objectStoreNames.contains("images")) {
            const store = db.createObjectStore("images", { keyPath: "imageId" });
            store.createIndex("byProject", "projectId", { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
      });
      return this.dbPromise;
    },

    async tx(storeNames, mode, fn) {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeNames, mode);
        const stores = storeNames.map((name) => tx.objectStore(name));
        let result;
        try {
          result = fn(...stores, tx);
        } catch (err) {
          reject(err);
          return;
        }
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || new Error("transaction failed"));
        tx.onabort = () => reject(tx.error || new Error("transaction aborted"));
      });
    },

    requestToPromise(req) {
      return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error("request failed"));
      });
    },

    async listProjects() {
      return this.tx(["projects"], "readonly", async (projects) => {
        const rows = await this.requestToPromise(projects.getAll());
        return rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      });
    },

    async getProject(projectId) {
      return this.tx(["projects"], "readonly", async (projects) => {
        return this.requestToPromise(projects.get(projectId));
      });
    },

    async putProject(record) {
      return this.tx(["projects"], "readwrite", async (projects) => {
        return this.requestToPromise(projects.put(record));
      });
    },

    async createProject(name, timelineData) {
      const now = Date.now();
      const projectId = generateId("project");
      const record = {
        projectId,
        name,
        createdAt: now,
        updatedAt: now,
        timelineData
      };
      await this.putProject(record);
      return record;
    },

    async renameProject(projectId, name) {
      const record = await this.getProject(projectId);
      if (!record) throw new Error("Project not found");
      record.name = name;
      record.updatedAt = Date.now();
      await this.putProject(record);
      return record;
    },

    async duplicateProject(projectId, nextName) {
      const base = await this.getProject(projectId);
      if (!base) throw new Error("Project not found");
      const now = Date.now();
      const targetProjectId = generateId("project");
      const timelineData = deepCopy(base.timelineData);
      await this.cloneImagesAndRewriteTimeline(projectId, targetProjectId, timelineData);
      const copy = {
        projectId: targetProjectId,
        name: nextName,
        createdAt: now,
        updatedAt: now,
        timelineData
      };
      await this.putProject(copy);
      return copy;
    },

    async saveAsProject(name, timelineData, sourceProjectId = null) {
      const now = Date.now();
      const targetProjectId = generateId("project");
      const clonedTimeline = deepCopy(timelineData);
      if (sourceProjectId) {
        await this.cloneImagesAndRewriteTimeline(sourceProjectId, targetProjectId, clonedTimeline);
      }
      const created = {
        projectId: targetProjectId,
        name,
        createdAt: now,
        updatedAt: now,
        timelineData: clonedTimeline
      };
      await this.putProject(created);
      return created;
    },

    async deleteProject(projectId) {
      await this.tx(["projects"], "readwrite", async (projects) => {
        return this.requestToPromise(projects.delete(projectId));
      });
      await this.deleteImagesByProject(projectId);
    },

    async saveImageBlob(projectId, blob, mimeType) {
      const imageId = generateId("img");
      const payload = { imageId, projectId, blob, mimeType: mimeType || blob.type || "application/octet-stream" };
      await this.tx(["images"], "readwrite", async (images) => {
        return this.requestToPromise(images.put(payload));
      });
      return imageId;
    },

    async getImageBlob(imageId) {
      return this.tx(["images"], "readonly", async (images) => {
        return this.requestToPromise(images.get(imageId));
      }).then((row) => (row ? row.blob : null));
    },

    async copyProjectImages(sourceProjectId, targetProjectId) {
      const rows = await this.getImagesByProject(sourceProjectId);
      if (!rows.length) return;
      await this.tx(["images"], "readwrite", async (images) => {
        for (const row of rows) {
          const copy = {
            imageId: generateId("img"),
            projectId: targetProjectId,
            blob: row.blob,
            mimeType: row.mimeType
          };
          await this.requestToPromise(images.put(copy));
        }
      });
    },

    async cloneImagesAndRewriteTimeline(sourceProjectId, targetProjectId, timelineData) {
      const rows = await this.getImagesByProject(sourceProjectId);
      if (!rows.length || !Array.isArray(timelineData.items)) return;

      const map = new Map();
      await this.tx(["images"], "readwrite", async (images) => {
        for (const row of rows) {
          const newImageId = generateId("img");
          map.set(row.imageId, newImageId);
          await this.requestToPromise(images.put({
            imageId: newImageId,
            projectId: targetProjectId,
            blob: row.blob,
            mimeType: row.mimeType
          }));
        }
      });

      timelineData.items = timelineData.items.map((item) => ({
        ...item,
        imageId: item.imageId ? (map.get(item.imageId) || null) : null
      }));
    },

    async getImagesByProject(projectId) {
      return this.tx(["images"], "readonly", async (images) => {
        const idx = images.index("byProject");
        return this.requestToPromise(idx.getAll(projectId));
      });
    },

    async deleteImagesByProject(projectId) {
      const rows = await this.getImagesByProject(projectId);
      if (!rows.length) return;
      await this.tx(["images"], "readwrite", async (images) => {
        for (const row of rows) {
          await this.requestToPromise(images.delete(row.imageId));
        }
      });
    }
  };

  const TimelineStore = {
    state: {
      projectId: null,
      projectName: "",
      minYear: -1000,
      maxYear: 2100,
      pxPerYear: 40,
      categories: [{ name: "General", code: "GEN" }],
      items: [],
      selectedItemId: null
    },
    listeners: [],
    autoSaveTimer: null,

    yearToX(year) {
      return (year - this.state.minYear) * this.state.pxPerYear + CONFIG.leftMargin;
    },

    xToYear(x) {
      return Math.round((x - CONFIG.leftMargin) / this.state.pxPerYear + this.state.minYear);
    },

    getSelectedItem() {
      return this.state.items.find((i) => i.id === this.state.selectedItemId) || null;
    },

    subscribe(fn) {
      this.listeners.push(fn);
    },

    emit(change) {
      for (const fn of this.listeners) fn(change, this.state);
    },

    normalizeItem(raw) {
      const type = raw.type === "span" ? "span" : "point";
      const year = toInt(raw.year, 0);
      const startYear = toInt(raw.startYear, year);
      const endYear = toInt(raw.endYear, startYear);
      const normStart = Math.min(startYear, endYear);
      const normEnd = Math.max(startYear, endYear);
      const legacyImage = typeof raw.imageDataUrl === "string" && raw.imageDataUrl ? raw.imageDataUrl : null;
      return {
        id: String(raw.id || generateId("item")),
        type,
        z: toInt(raw.z, 0),
        y: toInt(raw.y, 0),
        color: sanitizeHex(raw.color),
        notes: String(raw.notes || ""),
        categories: Array.isArray(raw.categories) ? raw.categories.map(String) : [],
        code: String(raw.code || ""),
        resources: Array.isArray(raw.resources)
          ? raw.resources.map((r) => ({ type: String(r.type || "note"), value: String(r.value || "") }))
          : [],
        imageId: raw.imageId || null,
        _legacyImageDataUrl: legacyImage,
        imgFit: raw.imgFit === "contain" ? "contain" : "cover",
        w: clamp(toInt(raw.w, CONFIG.initialCardWidth), CONFIG.minCardWidth, 700),
        h: clamp(toInt(raw.h, CONFIG.initialCardHeight), CONFIG.minCardHeight, 620),
        title: String(raw.title || "Untitled"),
        year,
        startYear: normStart,
        endYear: normEnd
      };
    },

    normalizeData(dataset) {
      const categories = Array.isArray(dataset.categories) && dataset.categories.length
        ? dataset.categories
          .map((c) => ({ name: String(c.name || ""), code: String(c.code || "").toUpperCase() }))
          .filter((c) => /^[A-Z0-9]{2,6}$/.test(c.code))
        : [{ name: "General", code: "GEN" }];

      const rawItems = Array.isArray(dataset.items)
        ? dataset.items
        : Array.isArray(dataset.events)
          ? dataset.events.map((evt) => ({ ...evt, type: evt.type || "point" }))
          : [];

      const items = rawItems.map((item) => {
        const normalized = this.normalizeItem(item);
        if (normalized.type === "span") {
          normalized.year = normalized.startYear;
        } else {
          normalized.startYear = normalized.year;
          normalized.endYear = normalized.year;
        }
        return normalized;
      });

      return {
        minYear: Number.isFinite(dataset.minYear) ? Math.round(dataset.minYear) : -1000,
        maxYear: Number.isFinite(dataset.maxYear) ? Math.round(dataset.maxYear) : 2100,
        pxPerYear: Number.isFinite(dataset.pxPerYear) ? clamp(dataset.pxPerYear, 6, 220) : 40,
        categories,
        items
      };
    },

    loadProject(record) {
      const norm = this.normalizeData(record.timelineData || {});
      this.state.projectId = record.projectId;
      this.state.projectName = record.name;
      this.state.minYear = norm.minYear;
      this.state.maxYear = Math.max(norm.maxYear, norm.minYear + 1);
      this.state.pxPerYear = norm.pxPerYear;
      this.state.categories = norm.categories;
      this.state.items = norm.items;
      this.state.selectedItemId = null;
      this.recomputeCodes();
      this.emit({ type: "project-loaded" });
    },

    exportTimelineData() {
      return {
        minYear: this.state.minYear,
        maxYear: this.state.maxYear,
        pxPerYear: this.state.pxPerYear,
        categories: this.state.categories,
        items: this.state.items.map((item) => {
          const out = { ...item };
          delete out._legacyImageDataUrl;
          return out;
        })
      };
    },

    select(itemId) {
      this.state.selectedItemId = itemId;
      this.emit({ type: "selection-changed", itemId });
    },

    clearSelection() {
      this.state.selectedItemId = null;
      this.emit({ type: "selection-changed", itemId: null });
    },

    mutate(mutator, options = { autosave: true, emitType: "changed" }) {
      mutator(this.state);
      this.recomputeCodes();
      this.emit({ type: options.emitType || "changed" });
      if (options.autosave !== false) this.scheduleAutosave();
    },

    scheduleAutosave() {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = setTimeout(() => {
        App.saveCurrentProject().catch((err) => {
          console.error("Autosave failed", err);
        });
      }, CONFIG.autoSaveDelayMs);
    },

    addCategory(name, code) {
      const cleanCode = String(code || "").toUpperCase().trim();
      const cleanName = String(name || "").trim();
      if (!/^[A-Z0-9]{2,6}$/.test(cleanCode)) throw new Error("Category code must be 2-6 chars A-Z/0-9");
      if (!cleanName) throw new Error("Category name required");
      if (this.state.categories.some((c) => c.code === cleanCode)) throw new Error("Category code already exists");

      this.mutate((state) => {
        state.categories.push({ name: cleanName, code: cleanCode });
      }, { emitType: "categories-changed" });
    },

    addItem(payload) {
      const maxZ = this.state.items.reduce((acc, item) => Math.max(acc, item.z), 0);
      const normalized = this.normalizeItem({
        ...payload,
        id: generateId("item"),
        z: maxZ + 1
      });
      if (normalized.type === "point") {
        normalized.startYear = normalized.year;
        normalized.endYear = normalized.year;
        this.autoExpandForYears(normalized.year, normalized.year);
      } else {
        normalized.year = normalized.startYear;
        this.autoExpandForYears(normalized.startYear, normalized.endYear);
      }

      this.mutate((state) => {
        state.items.push(normalized);
        state.selectedItemId = normalized.id;
      }, { emitType: "items-changed" });
      return normalized;
    },

    updateItem(id, patch) {
      this.mutate((state) => {
        const idx = state.items.findIndex((it) => it.id === id);
        if (idx === -1) return;
        const merged = this.normalizeItem({ ...state.items[idx], ...patch, id });
        if (merged.type === "point") {
          merged.startYear = merged.year;
          merged.endYear = merged.year;
          this.autoExpandForYears(merged.year, merged.year);
        } else {
          merged.year = merged.startYear;
          this.autoExpandForYears(merged.startYear, merged.endYear);
        }
        state.items[idx] = merged;
      }, { emitType: "items-changed" });
    },

    removeItem(id) {
      this.mutate((state) => {
        state.items = state.items.filter((it) => it.id !== id);
        if (state.selectedItemId === id) state.selectedItemId = null;
      }, { emitType: "items-changed" });
    },

    bringToFront(id) {
      this.mutate((state) => {
        const item = state.items.find((it) => it.id === id);
        if (!item) return;
        const maxZ = state.items.reduce((acc, cur) => Math.max(acc, cur.z), 0);
        item.z = maxZ + 1;
      }, { emitType: "items-changed" });
    },

    sendToBack(id) {
      this.mutate((state) => {
        const item = state.items.find((it) => it.id === id);
        if (!item) return;
        const minZ = state.items.reduce((acc, cur) => Math.min(acc, cur.z), 0);
        item.z = minZ - 1;
      }, { emitType: "items-changed" });
    },

    autoExpandForYears(a, b) {
      const min = Math.min(a, b);
      const max = Math.max(a, b);
      if (min < this.state.minYear) this.state.minYear = min;
      if (max > this.state.maxYear) this.state.maxYear = max;
    },

    recomputeCodes() {
      const byYear = new Map();
      for (const item of this.state.items) {
        const yearKey = item.type === "span" ? item.startYear : item.year;
        if (!byYear.has(yearKey)) byYear.set(yearKey, []);
        byYear.get(yearKey).push(item);
      }

      byYear.forEach((items, year) => {
        items.sort((a, b) => a.id.localeCompare(b.id));
        items.forEach((item, idx) => {
          const catCodes = sortCodes(item.categories).join("-") || "GEN";
          const token = formatYearToken(year);
          item.code = `${catCodes}-${token}-${String(idx + 1).padStart(2, "0")}`;
        });
      });
    }
  };

  const Renderer = {
    imageUrlCache: new Map(),

    clearProjectImageCache() {
      for (const [, url] of this.imageUrlCache) URL.revokeObjectURL(url);
      this.imageUrlCache.clear();
    },

    async ensureImageUrl(imageId) {
      if (!imageId) return null;
      if (this.imageUrlCache.has(imageId)) return this.imageUrlCache.get(imageId);
      const blob = await ProjectStore.getImageBlob(imageId);
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      this.imageUrlCache.set(imageId, url);
      return url;
    },

    async render() {
      const { minYear, maxYear } = TimelineStore.state;
      const width = Math.max(els.viewport.clientWidth, TimelineStore.yearToX(maxYear) + CONFIG.rightPadding);
      const itemsBottom = TimelineStore.state.items.reduce((acc, item) => Math.max(acc, item.y + item.h), 0);
      const height = Math.max(700, els.viewport.clientHeight, CONFIG.axisPaddingY * 2 + itemsBottom + 160);
      const spineY = Math.round(height / 2);

      els.timelineSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      els.timelineSvg.setAttribute("width", String(width));
      els.timelineSvg.setAttribute("height", String(height));
      els.timelineSvg.innerHTML = "";

      this.drawSpine(width, spineY);
      this.drawTicks(spineY);

      const sorted = [...TimelineStore.state.items].sort((a, b) => a.z - b.z || a.id.localeCompare(b.id));
      for (const item of sorted) {
        if (item.type === "span") {
          this.drawSpanItem(item, spineY);
        } else {
          await this.drawPointItem(item, spineY);
        }
      }

      els.zoomValue.textContent = `${TimelineStore.state.pxPerYear} px/year`;
      els.minYearInput.value = String(TimelineStore.state.minYear);
      els.maxYearInput.value = String(TimelineStore.state.maxYear);
    },

    drawSpine(width, y) {
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", "0");
      line.setAttribute("y1", String(y));
      line.setAttribute("x2", String(width));
      line.setAttribute("y2", String(y));
      line.setAttribute("stroke", "var(--spine)");
      line.setAttribute("stroke-width", "1");
      els.timelineSvg.appendChild(line);
    },

    drawTicks(spineY) {
      const { minYear, maxYear, pxPerYear } = TimelineStore.state;
      const minorStep = niceTickStep(42 / pxPerYear);
      const majorStep = minorStep * 5;
      const start = Math.floor(minYear / minorStep) * minorStep;

      for (let year = start; year <= maxYear; year += minorStep) {
        if (year < minYear) continue;
        const x = TimelineStore.yearToX(year);
        const isMajor = year % majorStep === 0;

        const tick = document.createElementNS(SVG_NS, "line");
        tick.setAttribute("x1", String(x));
        tick.setAttribute("x2", String(x));
        tick.setAttribute("y1", String(spineY - (isMajor ? 9 : 4)));
        tick.setAttribute("y2", String(spineY + (isMajor ? 9 : 4)));
        tick.setAttribute("stroke", "var(--tick)");
        tick.setAttribute("stroke-width", isMajor ? "1.5" : "1");
        els.timelineSvg.appendChild(tick);

        if (isMajor) {
          const label = document.createElementNS(SVG_NS, "text");
          label.textContent = formatDisplayYear(year);
          label.setAttribute("x", String(x + 4));
          label.setAttribute("y", String(spineY - 12));
          label.setAttribute("font-size", "12");
          label.setAttribute("fill", "var(--text)");
          els.timelineSvg.appendChild(label);
        }
      }
    },

    async drawPointItem(item, spineY) {
      const x = TimelineStore.yearToX(item.year);
      const y = spineY + item.y;
      const selected = TimelineStore.state.selectedItemId === item.id;

      const group = document.createElementNS(SVG_NS, "g");
      group.classList.add("card", "timeline-item");
      if (selected) group.classList.add("selected");
      group.dataset.id = item.id;
      group.dataset.type = item.type;
      group.setAttribute("transform", `translate(${x}, ${y})`);

      const rect = document.createElementNS(SVG_NS, "rect");
      rect.classList.add("card-rect");
      rect.setAttribute("x", "0");
      rect.setAttribute("y", "0");
      rect.setAttribute("rx", "8");
      rect.setAttribute("ry", "8");
      rect.setAttribute("width", String(item.w));
      rect.setAttribute("height", String(item.h));
      rect.setAttribute("fill", "var(--card-bg)");
      rect.setAttribute("stroke", "var(--card-stroke)");
      rect.setAttribute("stroke-width", "1");
      group.appendChild(rect);

      const stripe = document.createElementNS(SVG_NS, "rect");
      stripe.setAttribute("x", "0");
      stripe.setAttribute("y", "0");
      stripe.setAttribute("width", "6");
      stripe.setAttribute("height", String(item.h));
      stripe.setAttribute("fill", item.color);
      group.appendChild(stripe);

      let textY = 18;
      if (item.imageId) {
        const imageUrl = await this.ensureImageUrl(item.imageId);
        if (imageUrl) {
          const imageHeight = Math.max(40, Math.floor(item.h * 0.45));
          const clipId = `clip-${item.id}`;

          const defs = document.createElementNS(SVG_NS, "defs");
          const clip = document.createElementNS(SVG_NS, "clipPath");
          clip.setAttribute("id", clipId);
          const clipRect = document.createElementNS(SVG_NS, "rect");
          clipRect.setAttribute("x", "7");
          clipRect.setAttribute("y", "7");
          clipRect.setAttribute("width", String(item.w - 14));
          clipRect.setAttribute("height", String(imageHeight));
          clip.appendChild(clipRect);
          defs.appendChild(clip);
          group.appendChild(defs);

          const image = document.createElementNS(SVG_NS, "image");
          image.setAttributeNS(XLINK_NS, "href", imageUrl);
          image.setAttribute("x", "7");
          image.setAttribute("y", "7");
          image.setAttribute("width", String(item.w - 14));
          image.setAttribute("height", String(imageHeight));
          image.setAttribute("preserveAspectRatio", item.imgFit === "contain" ? "xMidYMid meet" : "xMidYMid slice");
          image.setAttribute("clip-path", `url(#${clipId})`);
          group.appendChild(image);

          textY = imageHeight + 24;
        }
      }

      const codeText = document.createElementNS(SVG_NS, "text");
      codeText.textContent = item.code;
      codeText.setAttribute("x", "12");
      codeText.setAttribute("y", String(textY));
      codeText.setAttribute("font-size", "11");
      codeText.setAttribute("fill", "var(--muted)");
      group.appendChild(codeText);

      const titleText = document.createElementNS(SVG_NS, "text");
      titleText.textContent = item.title;
      titleText.setAttribute("x", "12");
      titleText.setAttribute("y", String(textY + 18));
      titleText.setAttribute("font-size", "14");
      titleText.setAttribute("font-weight", "600");
      titleText.setAttribute("fill", "var(--text)");
      group.appendChild(titleText);

      const dateText = document.createElementNS(SVG_NS, "text");
      dateText.textContent = formatDisplayYear(item.year);
      dateText.setAttribute("x", "12");
      dateText.setAttribute("y", String(textY + 35));
      dateText.setAttribute("font-size", "12");
      dateText.setAttribute("fill", "var(--muted)");
      group.appendChild(dateText);

      if (selected) {
        const handle = document.createElementNS(SVG_NS, "rect");
        handle.classList.add("resize-handle");
        handle.dataset.id = item.id;
        handle.setAttribute("x", String(item.w - 12));
        handle.setAttribute("y", String(item.h - 12));
        handle.setAttribute("width", "10");
        handle.setAttribute("height", "10");
        handle.setAttribute("fill", "var(--text)");
        group.appendChild(handle);
      }

      els.timelineSvg.appendChild(group);
    },

    drawSpanItem(item, spineY) {
      const x = TimelineStore.yearToX(item.startYear);
      const endX = TimelineStore.yearToX(item.endYear);
      const width = Math.max(14, endX - x);
      const y = spineY + item.y;
      const selected = TimelineStore.state.selectedItemId === item.id;

      const group = document.createElementNS(SVG_NS, "g");
      group.classList.add("span-item", "timeline-item");
      if (selected) group.classList.add("selected");
      group.dataset.id = item.id;
      group.dataset.type = item.type;
      group.setAttribute("transform", `translate(${x}, ${y})`);

      const rect = document.createElementNS(SVG_NS, "rect");
      rect.classList.add("span-rect");
      rect.setAttribute("x", "0");
      rect.setAttribute("y", "0");
      rect.setAttribute("width", String(width));
      rect.setAttribute("height", String(Math.max(CONFIG.spanMinHeight, item.h)));
      rect.setAttribute("rx", "10");
      rect.setAttribute("ry", "10");
      rect.setAttribute("fill", item.color);
      rect.setAttribute("fill-opacity", "0.3");
      rect.setAttribute("stroke", item.color);
      rect.setAttribute("stroke-width", "1.5");
      group.appendChild(rect);

      const label = document.createElementNS(SVG_NS, "text");
      label.textContent = `${item.code} ${item.title}`;
      label.setAttribute("x", "8");
      label.setAttribute("y", "18");
      label.setAttribute("font-size", "12");
      label.setAttribute("fill", "var(--text)");
      group.appendChild(label);

      const date = document.createElementNS(SVG_NS, "text");
      date.textContent = `${formatDisplayYear(item.startYear)} - ${formatDisplayYear(item.endYear)}`;
      date.setAttribute("x", "8");
      date.setAttribute("y", "32");
      date.setAttribute("font-size", "11");
      date.setAttribute("fill", "var(--muted)");
      group.appendChild(date);

      if (selected) {
        const leftHandle = document.createElementNS(SVG_NS, "rect");
        leftHandle.classList.add("span-handle", "left");
        leftHandle.dataset.id = item.id;
        leftHandle.dataset.side = "left";
        leftHandle.setAttribute("x", "-4");
        leftHandle.setAttribute("y", "6");
        leftHandle.setAttribute("width", "8");
        leftHandle.setAttribute("height", String(Math.max(18, item.h - 12)));
        leftHandle.setAttribute("fill", "var(--text)");
        group.appendChild(leftHandle);

        const rightHandle = document.createElementNS(SVG_NS, "rect");
        rightHandle.classList.add("span-handle", "right");
        rightHandle.dataset.id = item.id;
        rightHandle.dataset.side = "right";
        rightHandle.setAttribute("x", String(width - 4));
        rightHandle.setAttribute("y", "6");
        rightHandle.setAttribute("width", "8");
        rightHandle.setAttribute("height", String(Math.max(18, item.h - 12)));
        rightHandle.setAttribute("fill", "var(--text)");
        group.appendChild(rightHandle);
      }

      els.timelineSvg.appendChild(group);
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
      const spanHandle = e.target.closest(".span-handle");
      if (spanHandle) {
        const id = spanHandle.dataset.id;
        const side = spanHandle.dataset.side;
        const item = TimelineStore.state.items.find((x) => x.id === id && x.type === "span");
        if (!item) return;
        TimelineStore.select(id);
        this.drag = {
          mode: side === "left" ? "span-resize-left" : "span-resize-right",
          id,
          pointerId: e.pointerId,
          startStartYear: item.startYear,
          startEndYear: item.endYear
        };
        els.timelineSvg.setPointerCapture(e.pointerId);
        FormController.loadSelected();
        Renderer.render();
        return;
      }

      const resizeHandle = e.target.closest(".resize-handle");
      if (resizeHandle) {
        const id = resizeHandle.dataset.id;
        const item = TimelineStore.state.items.find((x) => x.id === id && x.type === "point");
        if (!item) return;
        this.drag = {
          mode: "point-resize",
          id,
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          startW: item.w,
          startH: item.h
        };
        els.timelineSvg.setPointerCapture(e.pointerId);
        return;
      }

      const itemGroup = e.target.closest(".timeline-item");
      if (!itemGroup) {
        TimelineStore.clearSelection();
        FormController.loadSelected();
        Renderer.render();
        return;
      }

      const id = itemGroup.dataset.id;
      const item = TimelineStore.state.items.find((x) => x.id === id);
      if (!item) return;

      TimelineStore.select(id);
      FormController.loadSelected();
      Renderer.render();

      this.drag = {
        mode: item.type === "span" ? "span-move" : "point-move",
        id,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startYear: item.year,
        startStartYear: item.startYear,
        startEndYear: item.endYear,
        startY: item.y
      };
      els.timelineSvg.setPointerCapture(e.pointerId);
    },

    onPointerMove(e) {
      if (!this.drag) return;
      const item = TimelineStore.state.items.find((x) => x.id === this.drag.id);
      if (!item) return;

      if (this.drag.mode === "point-resize") {
        const dw = e.clientX - this.drag.startX;
        const dh = e.clientY - this.drag.startY;
        TimelineStore.updateItem(item.id, {
          w: clamp(this.drag.startW + dw, CONFIG.minCardWidth, 700),
          h: clamp(this.drag.startH + dh, CONFIG.minCardHeight, 620)
        });
        FormController.loadSelected(false);
        return;
      }

      const deltaYears = Math.round((e.clientX - this.drag.startClientX) / TimelineStore.state.pxPerYear);
      const deltaY = e.clientY - this.drag.startClientY;

      if (this.drag.mode === "point-move") {
        TimelineStore.updateItem(item.id, {
          year: this.drag.startYear + deltaYears,
          y: this.drag.startY + deltaY
        });
        FormController.loadSelected(false);
        return;
      }

      if (this.drag.mode === "span-move") {
        TimelineStore.updateItem(item.id, {
          startYear: this.drag.startStartYear + deltaYears,
          endYear: this.drag.startEndYear + deltaYears,
          y: this.drag.startY + deltaY
        });
        FormController.loadSelected(false);
        return;
      }

      const svgPoint = this.clientToSvg(e.clientX, e.clientY);
      const year = TimelineStore.xToYear(svgPoint.x);
      if (this.drag.mode === "span-resize-left") {
        TimelineStore.updateItem(item.id, {
          startYear: Math.min(year, item.endYear - 1)
        });
        FormController.loadSelected(false);
        return;
      }

      if (this.drag.mode === "span-resize-right") {
        TimelineStore.updateItem(item.id, {
          endYear: Math.max(year, item.startYear + 1)
        });
        FormController.loadSelected(false);
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
      els.itemTypeSelect.addEventListener("change", () => this.onTypeChanged());
      els.colorInput.addEventListener("input", () => {
        els.hexInput.value = els.colorInput.value;
      });
      els.hexInput.addEventListener("input", () => {
        const clean = sanitizeHex(els.hexInput.value, els.colorInput.value);
        if (clean !== els.colorInput.value) els.colorInput.value = clean;
      });

      els.addResourceBtn.addEventListener("click", () => this.addResourceRow());
      els.addEventBtn.addEventListener("click", () => this.onAddItem());
      els.eventForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.onSaveItem();
      });
      els.deleteEventBtn.addEventListener("click", () => this.onDeleteItem());
      els.clearFormBtn.addEventListener("click", () => this.clearForm());
      els.imageInput.addEventListener("change", (e) => this.onImagePick(e));
      els.removeImageBtn.addEventListener("click", () => this.onRemoveImage());
      els.addCategoryBtn.addEventListener("click", () => this.onAddCategory());
      els.bringFrontBtn.addEventListener("click", () => this.onBringFront());
      els.sendBackBtn.addEventListener("click", () => this.onSendBack());

      els.categoryToggleBtn.addEventListener("click", () => {
        els.categoryMenu.hidden = !els.categoryMenu.hidden;
      });
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".category-picker")) els.categoryMenu.hidden = true;
      });

      [
        els.yearInput,
        els.eraSelect,
        els.startYearInput,
        els.startEraSelect,
        els.endYearInput,
        els.endEraSelect,
        els.itemTypeSelect
      ].forEach((el) => {
        el.addEventListener("input", () => this.syncCodePreview());
        el.addEventListener("change", () => this.syncCodePreview());
      });

      els.imgFitSelect.addEventListener("change", () => {
        const selected = TimelineStore.getSelectedItem();
        if (!selected) return;
        TimelineStore.updateItem(selected.id, { imgFit: els.imgFitSelect.value });
      });

      this.renderCategoryMenu();
      this.renderSelectedChips();
      this.syncCodePreview();
      this.clearForm();
    },

    onTypeChanged() {
      const type = els.itemTypeSelect.value;
      els.pointDateFields.hidden = type !== "point";
      els.spanDateFields.hidden = type !== "span";
      this.syncCodePreview();
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
      row.querySelector("select").value = ["book", "url", "paper", "note"].includes(resource.type) ? resource.type : "note";
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

    getPointYear() {
      return eraToYear(els.yearInput.value, els.eraSelect.value);
    },

    getSpanYears() {
      const start = eraToYear(els.startYearInput.value, els.startEraSelect.value);
      const end = eraToYear(els.endYearInput.value, els.endEraSelect.value);
      return { startYear: Math.min(start, end), endYear: Math.max(start, end) };
    },

    formToPayload(base = {}) {
      const type = els.itemTypeSelect.value === "span" ? "span" : "point";
      const payload = {
        ...base,
        type,
        title: els.titleInput.value.trim() || "Untitled",
        color: sanitizeHex(els.colorInput.value),
        notes: els.notesInput.value,
        categories: Array.from(this.selectedCategoryCodes),
        resources: this.collectResources(),
        imgFit: els.imgFitSelect.value === "contain" ? "contain" : "cover",
        z: toInt(els.zInput.value, 0)
      };

      if (type === "point") {
        payload.year = this.getPointYear();
        payload.startYear = payload.year;
        payload.endYear = payload.year;
      } else {
        const years = this.getSpanYears();
        payload.startYear = years.startYear;
        payload.endYear = years.endYear;
        payload.year = payload.startYear;
        if (!Number.isFinite(payload.h) || payload.h < CONFIG.spanMinHeight) payload.h = Math.max(CONFIG.spanMinHeight, CONFIG.initialCardHeight * 0.5);
      }
      return payload;
    },

    async importLegacyImageIfNeeded(item) {
      if (!item || !item._legacyImageDataUrl || item.imageId) return;
      try {
        const blob = await dataURLToBlob(item._legacyImageDataUrl);
        const imageId = await ProjectStore.saveImageBlob(TimelineStore.state.projectId, blob, blob.type);
        TimelineStore.updateItem(item.id, { imageId, _legacyImageDataUrl: null });
      } catch {
        // Keep working even if migration fails.
      }
    },

    onAddItem() {
      const payload = this.formToPayload({
        y: 0,
        imageId: null,
        w: CONFIG.initialCardWidth,
        h: CONFIG.initialCardHeight
      });
      const item = TimelineStore.addItem(payload);
      this.loadItem(item);
    },

    onSaveItem() {
      const selected = TimelineStore.getSelectedItem();
      if (!selected) return;
      const patch = this.formToPayload({
        imageId: selected.imageId,
        w: selected.w,
        h: selected.h,
        y: selected.y
      });
      TimelineStore.updateItem(selected.id, patch);
      const updated = TimelineStore.getSelectedItem();
      if (updated) this.loadItem(updated);
    },

    onDeleteItem() {
      const selected = TimelineStore.getSelectedItem();
      if (!selected) return;
      TimelineStore.removeItem(selected.id);
      this.clearForm();
    },

    async onImagePick(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const selected = TimelineStore.getSelectedItem();
      if (!selected) return;
      const imageId = await ProjectStore.saveImageBlob(TimelineStore.state.projectId, file, file.type || "image/*");
      TimelineStore.updateItem(selected.id, { imageId });
      e.target.value = "";
    },

    onRemoveImage() {
      const selected = TimelineStore.getSelectedItem();
      if (!selected) return;
      TimelineStore.updateItem(selected.id, { imageId: null });
    },

    onBringFront() {
      const selected = TimelineStore.getSelectedItem();
      if (!selected) return;
      TimelineStore.bringToFront(selected.id);
      this.loadSelected(false);
    },

    onSendBack() {
      const selected = TimelineStore.getSelectedItem();
      if (!selected) return;
      TimelineStore.sendToBack(selected.id);
      this.loadSelected(false);
    },

    onAddCategory() {
      try {
        TimelineStore.addCategory(els.newCategoryName.value, els.newCategoryCode.value);
        els.newCategoryName.value = "";
        els.newCategoryCode.value = "";
        this.renderCategoryMenu();
      } catch (err) {
        alert(err.message);
      }
    },

    renderCategoryMenu() {
      els.categoryMenu.innerHTML = "";
      for (const cat of TimelineStore.state.categories) {
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

    loadItem(item) {
      TimelineStore.select(item.id);
      els.selectedIdPreview.textContent = item.id;
      els.itemTypeSelect.value = item.type;
      this.onTypeChanged();

      els.titleInput.value = item.title;
      if (item.type === "point") {
        const point = yearToEra(item.year);
        els.yearInput.value = String(point.value);
        els.eraSelect.value = point.era;
      } else {
        const start = yearToEra(item.startYear);
        const end = yearToEra(item.endYear);
        els.startYearInput.value = String(start.value);
        els.startEraSelect.value = start.era;
        els.endYearInput.value = String(end.value);
        els.endEraSelect.value = end.era;
      }

      els.zInput.value = String(item.z);
      els.colorInput.value = sanitizeHex(item.color);
      els.hexInput.value = sanitizeHex(item.color);
      els.notesInput.value = item.notes;
      els.imgFitSelect.value = item.imgFit;

      this.selectedCategoryCodes = new Set(item.categories);
      this.renderCategoryMenu();
      this.renderSelectedChips();

      els.resourcesList.innerHTML = "";
      item.resources.forEach((resource) => this.addResourceRow(resource));
      this.syncCodePreview(item.code);
      this.importLegacyImageIfNeeded(item);
    },

    loadSelected(updateResourceRows = true) {
      const selected = TimelineStore.getSelectedItem();
      if (!selected) {
        this.resetFormFields();
        return;
      }

      els.selectedIdPreview.textContent = selected.id;
      els.itemTypeSelect.value = selected.type;
      this.onTypeChanged();

      els.titleInput.value = selected.title;
      if (selected.type === "point") {
        const point = yearToEra(selected.year);
        els.yearInput.value = String(point.value);
        els.eraSelect.value = point.era;
      } else {
        const start = yearToEra(selected.startYear);
        const end = yearToEra(selected.endYear);
        els.startYearInput.value = String(start.value);
        els.startEraSelect.value = start.era;
        els.endYearInput.value = String(end.value);
        els.endEraSelect.value = end.era;
      }
      els.zInput.value = String(selected.z);
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
      TimelineStore.state.selectedItemId = null;
      els.selectedIdPreview.textContent = "None";
      this.resetFormFields();
      TimelineStore.emit({ type: "selection-changed", itemId: null });
    },

    resetFormFields() {
      els.itemTypeSelect.value = "point";
      this.onTypeChanged();
      els.zInput.value = "0";
      els.titleInput.value = "";
      els.yearInput.value = "200";
      els.eraSelect.value = "CE";
      els.startYearInput.value = "200";
      els.startEraSelect.value = "CE";
      els.endYearInput.value = "250";
      els.endEraSelect.value = "CE";
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
      const type = els.itemTypeSelect.value;
      const year = type === "span" ? this.getSpanYears().startYear : this.getPointYear();
      const catCodes = sortCodes(Array.from(this.selectedCategoryCodes)).join("-") || "GEN";
      els.codePreview.textContent = `${catCodes}-${formatYearToken(year)}-01`;
    }
  };

  const Exporter = {
    async exportJSON() {
      const data = TimelineStore.exportTimelineData();
      const withPortableImages = deepCopy(data);

      for (const item of withPortableImages.items) {
        if (!item.imageId) continue;
        const blob = await ProjectStore.getImageBlob(item.imageId);
        if (!blob) continue;
        item.imageDataUrl = await blobToDataURL(blob);
      }

      const blob = new Blob([JSON.stringify(withPortableImages, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${TimelineStore.state.projectName || "timeline"}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },

    async importJSON(file) {
      const text = await file.text();
      const json = JSON.parse(text);
      const replaceCurrent = confirm("Replace current project? Click Cancel to import as a new project.");

      const dataset = Array.isArray(json) ? { items: json } : json;
      const normalized = TimelineStore.normalizeData(dataset);

      if (replaceCurrent) {
        for (const item of normalized.items) {
          if (!item._legacyImageDataUrl) continue;
          const blob = await dataURLToBlob(item._legacyImageDataUrl);
          item.imageId = await ProjectStore.saveImageBlob(TimelineStore.state.projectId, blob, blob.type || "image/*");
          item._legacyImageDataUrl = null;
        }
        TimelineStore.mutate((state) => {
          state.minYear = normalized.minYear;
          state.maxYear = normalized.maxYear;
          state.pxPerYear = normalized.pxPerYear;
          state.categories = normalized.categories;
          state.items = normalized.items;
          state.selectedItemId = null;
        }, { emitType: "project-loaded" });
        await App.saveCurrentProject(true);
      } else {
        const name = prompt("Name for imported project", `Imported ${new Date().toLocaleString()}`) || "Imported";
        const targetProjectId = generateId("project");
        for (const item of normalized.items) {
          if (!item._legacyImageDataUrl) continue;
          const blob = await dataURLToBlob(item._legacyImageDataUrl);
          item.imageId = await ProjectStore.saveImageBlob(targetProjectId, blob, blob.type || "image/*");
          item._legacyImageDataUrl = null;
        }
        const now = Date.now();
        const created = {
          projectId: targetProjectId,
          name,
          createdAt: now,
          updatedAt: now,
          timelineData: {
            minYear: normalized.minYear,
            maxYear: normalized.maxYear,
            pxPerYear: normalized.pxPerYear,
            categories: normalized.categories,
            items: normalized.items
          }
        };
        await ProjectStore.putProject(created);
        await App.openProject(targetProjectId);
      }
    },

    async exportPNG() {
      const svg = els.timelineSvg;
      const width = Number(svg.getAttribute("width"));
      const height = Number(svg.getAttribute("height"));

      const clone = svg.cloneNode(true);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", String(width));
      clone.setAttribute("height", String(height));

      const style = document.createElementNS(SVG_NS, "style");
      style.textContent = `
        .svg-bg { fill: ${getComputedStyle(document.documentElement).getPropertyValue("--panel").trim()}; }
        text { font-family: Arial, Helvetica, sans-serif; }
      `;
      clone.insertBefore(style, clone.firstChild);

      // Subtle but important: exported SVG needs explicit background for PNG.
      const bg = document.createElementNS(SVG_NS, "rect");
      bg.setAttribute("class", "svg-bg");
      bg.setAttribute("x", "0");
      bg.setAttribute("y", "0");
      bg.setAttribute("width", String(width));
      bg.setAttribute("height", String(height));
      clone.insertBefore(bg, clone.firstChild);

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
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const pngUrl = URL.createObjectURL(pngBlob);
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = `${TimelineStore.state.projectName || "timeline"}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(pngUrl);
    }
  };

  const App = {
    async ensureInitialProject() {
      let projects = await ProjectStore.listProjects();
      if (!projects.length) {
        let seed = { minYear: -1000, maxYear: 2100, pxPerYear: 40, categories: [{ name: "General", code: "GEN" }], items: [] };
        try {
          const res = await fetch("data.json", { cache: "no-store" });
          if (res.ok) {
            const seedJson = await res.json();
            if (Array.isArray(seedJson)) seed.items = seedJson;
            else if (seedJson && typeof seedJson === "object") seed = { ...seed, ...seedJson };
          }
        } catch {
          // Opening file:// can block fetch; fallback is empty seed.
        }
        const created = await ProjectStore.createProject("My Timeline", TimelineStore.normalizeData(seed));
        projects = [created];
      }

      let targetId = SettingsStore.state.lastProjectId;
      if (!targetId || !projects.some((p) => p.projectId === targetId)) {
        targetId = projects[0].projectId;
      }
      await this.openProject(targetId);
    },

    async openProject(projectId) {
      const record = await ProjectStore.getProject(projectId);
      if (!record) return;
      Renderer.clearProjectImageCache();
      TimelineStore.loadProject(record);
      SettingsStore.setLastProjectId(projectId);
      await this.refreshProjectList(projectId);
      FormController.clearForm();
      await Renderer.render();
    },

    async refreshProjectList(selectedId = null) {
      const projects = await ProjectStore.listProjects();
      els.projectSelect.innerHTML = "";
      for (const project of projects) {
        const option = document.createElement("option");
        option.value = project.projectId;
        option.textContent = project.name;
        if ((selectedId || TimelineStore.state.projectId) === project.projectId) option.selected = true;
        els.projectSelect.appendChild(option);
      }
    },

    async saveCurrentProject(force = false) {
      if (!TimelineStore.state.projectId) return;
      const existing = await ProjectStore.getProject(TimelineStore.state.projectId);
      if (!existing) return;
      existing.updatedAt = Date.now();
      existing.timelineData = TimelineStore.exportTimelineData();
      if (force) {
        existing.timelineData = deepCopy(existing.timelineData);
      }
      await ProjectStore.putProject(existing);
      await this.refreshProjectList(existing.projectId);
    },

    bindProjectUi() {
      els.openProjectBtn.addEventListener("click", async () => {
        const projectId = els.projectSelect.value;
        if (!projectId) return;
        await this.openProject(projectId);
      });

      els.newProjectBtn.addEventListener("click", async () => {
        const name = prompt("Project name", "New Timeline");
        if (!name) return;
        const timeline = {
          minYear: -1000,
          maxYear: 2100,
          pxPerYear: 40,
          categories: [{ name: "General", code: "GEN" }],
          items: []
        };
        const created = await ProjectStore.createProject(name, timeline);
        await this.openProject(created.projectId);
      });

      els.renameProjectBtn.addEventListener("click", async () => {
        const current = await ProjectStore.getProject(TimelineStore.state.projectId);
        if (!current) return;
        const name = prompt("Rename project", current.name);
        if (!name) return;
        await ProjectStore.renameProject(current.projectId, name);
        TimelineStore.state.projectName = name;
        await this.refreshProjectList(current.projectId);
      });

      els.duplicateProjectBtn.addEventListener("click", async () => {
        const current = await ProjectStore.getProject(TimelineStore.state.projectId);
        if (!current) return;
        const name = prompt("Duplicate project name", `${current.name} Copy`);
        if (!name) return;
        const copy = await ProjectStore.duplicateProject(current.projectId, name);
        await this.openProject(copy.projectId);
      });

      els.saveAsProjectBtn.addEventListener("click", async () => {
        const name = prompt("Save As name", `${TimelineStore.state.projectName} Copy`);
        if (!name) return;
        const copy = await ProjectStore.saveAsProject(name, TimelineStore.exportTimelineData(), TimelineStore.state.projectId);
        await this.openProject(copy.projectId);
      });

      els.deleteProjectBtn.addEventListener("click", async () => {
        const currentId = TimelineStore.state.projectId;
        if (!currentId) return;
        if (!confirm("Delete current project?")) return;
        await ProjectStore.deleteProject(currentId);
        const projects = await ProjectStore.listProjects();
        if (projects.length) {
          await this.openProject(projects[0].projectId);
        } else {
          await this.ensureInitialProject();
        }
      });
    },

    bindToolbar() {
      els.zoomSlider.addEventListener("input", async () => {
        const old = TimelineStore.state.pxPerYear;
        const next = clamp(Number(els.zoomSlider.value), 6, 220);
        if (old === next) return;

        const centerX = els.viewport.scrollLeft + els.viewport.clientWidth / 2;
        const centerYear = TimelineStore.xToYear(centerX);

        TimelineStore.mutate((state) => {
          state.pxPerYear = next;
        }, { emitType: "zoom-changed" });

        const newX = TimelineStore.yearToX(centerYear);
        els.viewport.scrollLeft = Math.max(0, newX - els.viewport.clientWidth / 2);
        await Renderer.render();
      });

      els.applyRangeBtn.addEventListener("click", () => {
        const min = toInt(els.minYearInput.value, TimelineStore.state.minYear);
        const max = toInt(els.maxYearInput.value, TimelineStore.state.maxYear);
        if (max <= min) {
          alert("Max year must be greater than min year.");
          return;
        }
        TimelineStore.mutate((state) => {
          state.minYear = min;
          state.maxYear = max;
        }, { emitType: "range-changed" });
      });

      els.exportJsonBtn.addEventListener("click", async () => Exporter.exportJSON());
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

      els.themeToggleBtn.addEventListener("click", () => {
        const next = SettingsStore.state.theme === "dark" ? "light" : "dark";
        SettingsStore.setTheme(next);
      });

      els.sidebarCollapseBtn.addEventListener("click", () => {
        SettingsStore.setSidebarCollapsed(true);
      });
      els.sidebarExpandBtn.addEventListener("click", () => {
        SettingsStore.setSidebarCollapsed(false);
      });
      els.sidebarWideToggle.addEventListener("change", () => {
        SettingsStore.setSidebarWide(els.sidebarWideToggle.checked);
      });

      window.addEventListener("resize", () => {
        Renderer.render();
      });
    },

    async init() {
      SettingsStore.load();
      SettingsStore.applyTheme();
      SettingsStore.applySidebarPrefs();

      this.bindProjectUi();
      this.bindToolbar();
      DragController.bind();
      FormController.bind();

      TimelineStore.subscribe(async (change) => {
        if (change.type === "selection-changed") {
          if (change.itemId) FormController.loadSelected();
          else FormController.resetFormFields();
          await Renderer.render();
          return;
        }

        await Renderer.render();
      });

      await this.ensureInitialProject();
      els.zoomSlider.value = String(TimelineStore.state.pxPerYear);
      await Renderer.render();
    }
  };

  App.init().catch((err) => {
    console.error(err);
    alert(`Initialization failed: ${err.message}`);
  });
})();
