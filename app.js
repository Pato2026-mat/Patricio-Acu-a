(() => {
  "use strict";

  const state = {
    groups: new Map(),
    selectedGroup: "all",
    sourceNames: [],
    filters: { area: "", shift: "", plannerGroup: "" },
  };
  const palette = ["#17365d", "#2f75b5", "#70ad47", "#ed7d31", "#75869a"];
  const $ = (selector) => document.querySelector(selector);
  const numberFormat = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
  const decimalFormat = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });
  const currencyFormat = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });

  const aliases = {
    order: ["ot", "orden", "orden trabajo", "orden de trabajo"],
    equipment: ["equipo", "numero equipo", "n equipo"],
    equipmentType: ["tipo equipo", "clase equipo"],
    location: ["ubicacion tecnica", "ubicacion", "localizacion tecnica"],
    workCenter: ["puesto trabajo", "puesto de trabajo", "centro trabajo", "work center"],
    orderClass: ["clase orden", "clase de orden", "tipo orden"],
    maintenance: ["tipo mantenimiento", "clase mantenimiento"],
    status: ["estado", "status usuario", "status sistema"],
    systemStatus: ["status sistema"],
    failure: ["modo falla", "modo de falla"],
    area: ["area", "sector"],
    shift: ["turno", "shift"],
    plannerGroup: ["grupo planificador", "grupo planificacion", "grupo de planificacion"],
    abcIndicator: ["indicador abc", "abc"],
    planned: ["planificado", "programado"],
    cost: ["costo total clp", "costo total", "costo real clp", "costo"],
    downtime: ["downtime h", "tiempo fuera servicio h"],
    labor: ["horas mano obra", "horas hombre"],
    createdDate: ["fecha creacion", "fecha de creacion"],
    startDate: ["fecha inicio", "fecha de inicio"],
    endDate: ["fecha fin", "fecha de fin"],
    repairTime: ["tiempo reparacion h", "tiempo de reparacion h"],
  };

  function normalize(value) {
    return String(value ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/^'+/, "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function cleanValue(value) {
    const cleaned = String(value ?? "").trim().replace(/^'+/, "").trim();
    return cleaned === "" || /^(null|nan|n\/a)$/i.test(cleaned) ? "" : cleaned;
  }

  function parseCsv(text) {
    const content = text.replace(/^\uFEFF/, "");
    const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
    const delimiters = [",", ";", "\t", "|"];
    let delimiter = ",";
    let highestCount = -1;
    for (const candidate of delimiters) {
      let count = 0;
      let quoted = false;
      for (let i = 0; i < firstLine.length; i += 1) {
        if (firstLine[i] === '"') {
          if (quoted && firstLine[i + 1] === '"') i += 1;
          else quoted = !quoted;
        } else if (!quoted && firstLine[i] === candidate) {
          count += 1;
        }
      }
      if (count > highestCount) {
        delimiter = candidate;
        highestCount = count;
      }
    }

    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < content.length; i += 1) {
      const char = content[i];
      if (char === '"') {
        if (quoted && content[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if (!quoted && char === delimiter) {
        row.push(field);
        field = "";
      } else if (!quoted && (char === "\n" || char === "\r")) {
        if (char === "\r" && content[i + 1] === "\n") i += 1;
        row.push(field);
        if (row.some((item) => item.trim() !== "")) rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }
    row.push(field);
    if (row.some((item) => item.trim() !== "")) rows.push(row);
    return rows;
  }

  function parseNumber(value) {
    let text = cleanValue(value).replace(/[^\d,.\-+]/g, "");
    if (!text) return null;
    const comma = text.lastIndexOf(",");
    const period = text.lastIndexOf(".");
    if (comma >= 0 && period >= 0) {
      const decimalSeparator = comma > period ? "," : ".";
      const thousandsSeparator = decimalSeparator === "," ? /\./g : /,/g;
      text = text.replace(thousandsSeparator, "");
      if (decimalSeparator === ",") text = text.replace(",", ".");
    } else if (comma >= 0) {
      text = text.replace(",", ".");
    }
    const result = Number(text);
    return Number.isFinite(result) ? result : null;
  }

  function parseDate(value) {
    const text = cleanValue(value);
    if (!text) return null;
    const localDate = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    let date;
    if (localDate) {
      const day = Number(localDate[1]);
      const month = Number(localDate[2]);
      const year = Number(localDate[3]);
      const hour = Number(localDate[4] ?? 0);
      const minute = Number(localDate[5] ?? 0);
      const second = Number(localDate[6] ?? 0);
      date = new Date(Date.UTC(
        year,
        month - 1,
        day,
        hour,
        minute,
        second,
      ));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day || date.getUTCHours() !== hour
        || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) return null;
    } else {
      date = new Date(text);
    }
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function findColumns(headers) {
    const normalizedHeaders = headers.map(normalize);
    const result = {};
    for (const [field, candidates] of Object.entries(aliases)) {
      const index = normalizedHeaders.findIndex((header) =>
        candidates.some((candidate) => header === normalize(candidate)),
      );
      if (index >= 0) result[field] = index;
    }
    return result;
  }

  function normalizeMaintenance(value) {
    const key = normalize(value);
    if (key === "correctivo") return "Correctivo";
    if (key === "preventivo" || key === "preventiva") return "Preventivo";
    if (key === "predictivo") return "Predictivo";
    return cleanValue(value) || "Sin clasificar";
  }

  function normalizeStatus(value) {
    const key = normalize(value);
    if (key === "cerrada" || key === "cerrado" || key === "teco") return "Cerrada";
    if (key === "abierta" || key === "abierto") return "Abierta";
    if (key === "en ejecucion") return "En ejecución";
    return cleanValue(value) || "Sin clasificar";
  }

  function groupFromName(filename, index) {
    const match = filename.match(/grupo[\s_-]*([a-z0-9]+)/i);
    return match ? `Grupo ${match[1].toUpperCase()}` : `Archivo ${index + 1}`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  function escapeXml(value) {
    return escapeHtml(value);
  }

  async function readCsvFile(file) {
    const bytes = await file.arrayBuffer();
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      try {
        return new TextDecoder("windows-1252", { fatal: true }).decode(bytes);
      } catch {
        throw new Error(`${file.name}: no se pudo decodificar el archivo como UTF-8 ni Windows-1252.`);
      }
    }
  }
  async function loadCsvFile(file, index) {
    const text = await readCsvFile(file);
    const parsed = parseCsv(text);
    if (parsed.length < 2) throw new Error(`${file.name}: no contiene filas de datos.`);
    const headers = parsed[0].map(cleanValue);
    const columns = findColumns(headers);
    if (columns.order === undefined) {
      throw new Error(`${file.name}: no se identificó una columna OT/orden de trabajo.`);
    }
    const rawRows = parsed.slice(1);
    const rows = rawRows.map((raw) => {
      const value = (field) => columns[field] === undefined ? "" : cleanValue(raw[columns[field]]);
      const systemStatus = value("systemStatus");
      const status = normalizeStatus(value("status") || systemStatus);
      const repairTime = parseNumber(value("repairTime"));
      const createdRaw = value("createdDate");
      const startRaw = value("startDate");
      const endRaw = value("endDate");
      return {
        order: value("order"),
        equipment: value("equipment"),
        equipmentType: value("equipmentType"),
        location: value("location"),
        workCenter: value("workCenter"),
        orderClass: value("orderClass"),
        maintenance: normalizeMaintenance(value("maintenance")),
        status,
        systemStatus: normalize(systemStatus),
        failure: value("failure"),
        area: value("area"),
        shift: value("shift"),
        plannerGroup: value("plannerGroup"),
        abcIndicator: value("abcIndicator"),
        planned: value("planned"),
        cost: parseNumber(value("cost")) ?? 0,
        downtime: parseNumber(value("downtime")) ?? 0,
        labor: parseNumber(value("labor")) ?? 0,
        created: parseDate(createdRaw),
        start: parseDate(startRaw),
        end: parseDate(endRaw),
        repairTime,
      };
    }).filter((row) => row.order || Object.values(row).some((value) => value !== "" && value !== null));

    if (rows.length === 0) throw new Error(`${file.name}: no hay registros que analizar.`);
    const group = groupFromName(file.name, index);
    return {
      group,
      filename: file.name,
      headers,
      columns,
      rows,
      rowCount: rows.length,
      duplicateOrders: countDuplicateRows(rows, (row) => row.order),
      emptyOrders: rows.filter((row) => !row.order).length,
      exactDuplicateRows: rawRows.length - new Set(rawRows.map((row) => JSON.stringify(row))).size,
      invalidDates: rawRows.reduce((total, raw) => {
        const value = (field) => columns[field] === undefined ? "" : cleanValue(raw[columns[field]]);
        return total + ["createdDate", "startDate", "endDate"].filter((field) => {
          const dateText = value(field);
          return dateText !== "" && parseDate(dateText) === null;
        }).length;
      }, 0),
      missingFailure: rows.filter((row) => !row.failure).length,
    };
  }

  function countDuplicateRows(rows, key) {
    const counts = new Map();
    for (const row of rows) {
      const value = key(row);
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    let duplicated = 0;
    for (const count of counts.values()) if (count > 1) duplicated += count;
    return duplicated;
  }

  function distinctCount(rows, key) {
    return new Set(rows.map(key).filter(Boolean)).size;
  }

  function selectedGroups() {
    const group = state.groups.get(state.selectedGroup);
    return group ? [group] : [];
  }

  function rowsMatchingFilters(group) {
    return group.rows.filter((row) => Object.entries(state.filters).every(([field, selected]) => {
      if (!selected) return true;
      const value = cleanValue(row[field]);
      return selected === "__missing__" ? !value : value === selected;
    }));
  }

  function renderDimensionFilter(id, group, field, label) {
    const select = $(id);
    const available = group?.columns[field] !== undefined;
    const selected = state.filters[field] ?? "";
    const values = available
      ? [...new Set(group.rows.map((row) => cleanValue(row[field])).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "es"))
      : [];
    select.innerHTML = available
      ? `<option value="">Todas las opciones</option>${values.map((value) =>
        `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}<option value="__missing__">Sin dato</option>`
      : `<option value="">No disponible</option>`;
    select.disabled = !available;
    if (selected && selected !== "__missing__" && !values.includes(selected)) {
      state.filters[field] = "";
    }
    select.value = select.disabled ? "" : state.filters[field];
    select.setAttribute("aria-label", `${label}${available ? "" : " (no disponible en este archivo)"}`);
  }

  function refreshDimensionFilters() {
    const group = state.groups.get(state.selectedGroup);
    renderDimensionFilter("#areaFilter", group, "area", "Área");
    renderDimensionFilter("#shiftFilter", group, "shift", "Turno");
    renderDimensionFilter("#plannerFilter", group, "plannerGroup", "Grupo planificador");
  }

  function activeFilterLabels() {
    return [
      ["Área", state.filters.area],
      ["Turno", state.filters.shift],
      ["Grupo planificador", state.filters.plannerGroup],
    ].filter(([, value]) => value).map(([label, value]) =>
      `${label}: ${value === "__missing__" ? "Sin dato" : value}`,
    );
  }

  function hasField(groups, field) {
    return groups.length > 0 && groups.every((group) => group.columns[field] !== undefined);
  }

  function sum(rows, key) {
    return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  }

  function countBy(rows, key) {
    const counts = new Map();
    for (const row of rows) {
      const label = key(row) || "Sin clasificar";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts].map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }

  function aggregate(rows, category, metric) {
    const result = new Map();
    for (const row of rows) {
      const label = row[category] || `Sin ${category}`;
      const current = result.get(label) ?? { label, value: 0, count: 0, downtime: 0 };
      current.value += Number(row[metric]) || 0;
      current.count += 1;
      current.downtime += Number(row.downtime) || 0;
      result.set(label, current);
    }
    return [...result.values()].sort((a, b) => b.value - a.value);
  }

  function formatValue(value) {
    return numberFormat.format(value);
  }

  function formatCurrency(value) {
    return currencyFormat.format(value);
  }

  function formatCompactCurrency(value) {
    const abs = Math.abs(value);
    if (abs >= 1e9) return `${decimalFormat.format(value / 1e9)} mil M`;
    if (abs >= 1e6) return `${decimalFormat.format(value / 1e6)} M`;
    if (abs >= 1e3) return `${decimalFormat.format(value / 1e3)} mil`;
    return formatCurrency(value);
  }

  function makeSvg(width, height, body) {
    return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  }

  function renderEmpty(target, message = "No hay datos suficientes para este gráfico.") {
    target.innerHTML = `<div class="chart-empty">${escapeHtml(message)}</div>`;
  }

  function renderBars(target, entries, unit, color = palette[1]) {
    const data = entries.slice(0, 10);
    if (!data.length) return renderEmpty(target);
    const width = 780;
    const rowHeight = 29;
    const height = Math.max(190, 52 + rowHeight * data.length);
    const left = 175;
    const right = 88;
    const plotWidth = width - left - right;
    const maxValue = Math.max(...data.map((entry) => entry.value), 1);
    let body = `<text class="title-label" x="${left}" y="18">${escapeXml(unit)}</text>`;
    for (let tick = 0; tick <= 4; tick += 1) {
      const x = left + (plotWidth * tick) / 4;
      body += `<line class="gridline" x1="${x}" y1="30" x2="${x}" y2="${height - 12}"/>`;
      body += `<text x="${x}" y="${height - 1}" text-anchor="middle">${escapeXml(decimalFormat.format(maxValue * tick / 4))}</text>`;
    }
    data.forEach((entry, index) => {
      const y = 32 + index * rowHeight;
      const barWidth = Math.max(1, (Math.max(0, entry.value) / maxValue) * plotWidth);
      const label = entry.label.length > 24 ? `${entry.label.slice(0, 22)}…` : entry.label;
      body += `<text x="${left - 9}" y="${y + 14}" text-anchor="end">${escapeXml(label)}</text>`;
      body += `<rect x="${left}" y="${y}" width="${barWidth}" height="18" rx="4" fill="${color}"><title>${escapeXml(entry.label)}: ${escapeXml(formatCurrency(entry.value))}</title></rect>`;
      body += `<text class="value-label" x="${Math.min(left + barWidth + 7, width - right + 8)}" y="${y + 13}">${escapeXml(decimalFormat.format(entry.value))}</text>`;
    });
    target.innerHTML = makeSvg(width, height, body);
  }

  function renderCounts(target, entries, unit = "Órdenes") {
    const data = entries.slice(0, 8);
    if (!data.length) return renderEmpty(target);
    const width = 780;
    const height = 250;
    const margin = { left: 48, right: 25, top: 30, bottom: 76 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const maxValue = Math.max(...data.map((entry) => entry.value), 1);
    const slot = plotWidth / data.length;
    let body = "";
    for (let i = 0; i <= 4; i += 1) {
      const y = margin.top + plotHeight * i / 4;
      const value = maxValue * (1 - i / 4);
      body += `<line class="gridline" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"/>`;
      body += `<text x="${margin.left - 8}" y="${y + 3}" text-anchor="end">${escapeXml(formatValue(value))}</text>`;
    }
    data.forEach((entry, i) => {
      const barWidth = slot * .58;
      const barHeight = plotHeight * entry.value / maxValue;
      const x = margin.left + i * slot + (slot - barWidth) / 2;
      const y = margin.top + plotHeight - barHeight;
      const label = entry.label.length > 14 ? `${entry.label.slice(0, 12)}…` : entry.label;
      body += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="${palette[i % palette.length]}"><title>${escapeXml(entry.label)}: ${escapeXml(formatValue(entry.value))} ${escapeXml(unit.toLowerCase())}</title></rect>`;
      body += `<text class="value-label" x="${x + barWidth / 2}" y="${y - 5}" text-anchor="middle">${escapeXml(formatValue(entry.value))}</text>`;
      body += `<text x="${x + barWidth / 2}" y="${height - margin.bottom + 15}" text-anchor="end" transform="rotate(-35 ${x + barWidth / 2} ${height - margin.bottom + 15})">${escapeXml(label)}</text>`;
    });
    body += `<text x="${width / 2}" y="${height - 5}" text-anchor="middle">${escapeXml(unit)}</text>`;
    target.innerHTML = makeSvg(width, height, body);
  }

  function renderPareto(target, entries) {
    const sorted = entries.filter((entry) => entry.value > 0).sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, 10);
    if (!top.length) return renderEmpty(target);
    const width = 780;
    const height = 330;
    const margin = { left: 57, right: 55, top: 31, bottom: 115 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const maxValue = Math.max(...top.map((entry) => entry.value), 1);
    const fullTotal = sorted.reduce((total, entry) => total + entry.value, 0);
    const slot = plotWidth / top.length;
    let body = `<text class="title-label" x="${margin.left}" y="16">Costo real (CLP)</text>`;
    for (let i = 0; i <= 4; i += 1) {
      const y = margin.top + plotHeight * i / 4;
      const percentage = 100 - i * 25;
      body += `<line class="gridline" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"/>`;
      body += `<text x="${margin.left - 8}" y="${y + 3}" text-anchor="end">${escapeXml(formatCompactCurrency(maxValue * (1 - i / 4)))}</text>`;
      body += `<text x="${width - margin.right + 8}" y="${y + 3}">${percentage}%</text>`;
    }
    let cumulative = 0;
    const points = [];
    top.forEach((entry, i) => {
      const barWidth = slot * .62;
      const barHeight = plotHeight * entry.value / maxValue;
      const x = margin.left + i * slot + (slot - barWidth) / 2;
      const y = margin.top + plotHeight - barHeight;
      const center = x + barWidth / 2;
      cumulative += entry.value;
      const percent = fullTotal ? cumulative / fullTotal * 100 : 0;
      points.push([center, margin.top + plotHeight * (1 - percent / 100)]);
      const label = entry.label.length > 15 ? `${entry.label.slice(0, 13)}…` : entry.label;
      body += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="3" fill="${palette[1]}"><title>${escapeXml(entry.label)}: ${escapeXml(formatCurrency(entry.value))}</title></rect>`;
      body += `<text x="${center}" y="${height - margin.bottom + 16}" text-anchor="end" transform="rotate(-38 ${center} ${height - margin.bottom + 16})">${escapeXml(label)}</text>`;
    });
    if (points.length > 0) {
      body += `<polyline points="${points.map(([x, y]) => `${x},${y}`).join(" ")}" fill="none" stroke="${palette[3]}" stroke-width="2"/>`;
      for (const [x, y] of points) body += `<circle cx="${x}" cy="${y}" r="3.5" fill="${palette[3]}"/>`;
    }
    body += `<text x="${width - margin.right + 8}" y="${margin.top - 7}" fill="${palette[3]}">Acumulado</text>`;
    body += `<text x="${width / 2}" y="${height - 5}" text-anchor="middle">Categorías — Top 10 (porcentaje sobre todas)</text>`;
    target.innerHTML = makeSvg(width, height, body);
  }

  function renderMonthly(target, groups) {
    const series = groups.map((group) => {
      const counts = new Map();
      for (const row of group.rows) {
        if (!row.start) continue;
        const month = `${row.start.getUTCFullYear()}-${String(row.start.getUTCMonth() + 1).padStart(2, "0")}`;
        counts.set(month, (counts.get(month) ?? 0) + 1);
      }
      return { name: group.group, counts };
    });
    const months = [...new Set(series.flatMap((item) => [...item.counts.keys()]))].sort();
    if (!months.length) return renderEmpty(target, "No se detectaron fechas de inicio válidas.");
    const width = 780;
    const height = 300;
    const margin = { left: 48, right: 18, top: 26, bottom: 48 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const maxValue = Math.max(...series.flatMap((item) => months.map((month) => item.counts.get(month) ?? 0)), 1);
    let body = "";
    for (let i = 0; i <= 4; i += 1) {
      const y = margin.top + plotHeight * i / 4;
      body += `<line class="gridline" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"/>`;
      body += `<text x="${margin.left - 8}" y="${y + 3}" text-anchor="end">${escapeXml(formatValue(maxValue * (1 - i / 4)))}</text>`;
    }
    series.forEach((item, i) => {
      const points = months.map((month, index) => {
        const x = margin.left + (months.length <= 1 ? plotWidth / 2 : plotWidth * index / (months.length - 1));
        const y = margin.top + plotHeight * (1 - (item.counts.get(month) ?? 0) / maxValue);
        return [x, y];
      });
      body += `<polyline points="${points.map(([x, y]) => `${x},${y}`).join(" ")}" fill="none" stroke="${palette[i % palette.length]}" stroke-width="2"/>`;
      points.forEach(([x, y]) => { body += `<circle cx="${x}" cy="${y}" r="2.5" fill="${palette[i % palette.length]}"/>`; });
    });
    const tickStep = Math.max(1, Math.ceil(months.length / 8));
    months.forEach((month, index) => {
      if (index % tickStep !== 0 && index !== months.length - 1) return;
      const x = margin.left + (months.length <= 1 ? plotWidth / 2 : plotWidth * index / (months.length - 1));
      body += `<text x="${x}" y="${height - 19}" text-anchor="middle">${escapeXml(month)}</text>`;
    });
    series.forEach((item, i) => {
      const x = margin.left + 12 + i * 115;
      body += `<line x1="${x}" y1="${height - 3}" x2="${x + 16}" y2="${height - 3}" stroke="${palette[i % palette.length]}" stroke-width="3"/>`;
      body += `<text x="${x + 21}" y="${height}">${escapeXml(item.name)}</text>`;
    });
    target.innerHTML = makeSvg(width, height, body);
  }

  function renderPriority(target, rows) {
    const groups = aggregate(rows, "equipment", "downtime")
      .map((item) => ({ ...item, frequency: item.count, meanDowntime: item.count ? item.downtime / item.count : 0 }));
    const positive = groups.filter((item) => item.frequency > 0);
    if (!positive.length) return renderEmpty(target);
    const width = 780;
    const height = 310;
    const margin = { left: 56, right: 20, top: 27, bottom: 45 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const maxX = Math.max(...positive.map((item) => item.frequency), 1);
    const maxY = Math.max(...positive.map((item) => item.meanDowntime), 1);
    const medianX = [...positive].map((item) => item.frequency).sort((a, b) => a - b)[Math.floor(positive.length / 2)];
    const medianYList = [...positive].map((item) => item.meanDowntime).sort((a, b) => a - b);
    const medianY = medianYList[Math.floor(medianYList.length / 2)];
    let body = "";
    for (let i = 0; i <= 4; i += 1) {
      const y = margin.top + plotHeight * i / 4;
      const x = margin.left + plotWidth * i / 4;
      body += `<line class="gridline" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"/>`;
      body += `<text x="${margin.left - 8}" y="${y + 3}" text-anchor="end">${escapeXml(decimalFormat.format(maxY * (1 - i / 4)))}</text>`;
      body += `<text x="${x}" y="${height - 20}" text-anchor="middle">${escapeXml(formatValue(maxX * i / 4))}</text>`;
    }
    const medianLineX = margin.left + plotWidth * medianX / maxX;
    const medianLineY = margin.top + plotHeight * (1 - medianY / maxY);
    body += `<line class="median-line" x1="${medianLineX}" y1="${margin.top}" x2="${medianLineX}" y2="${height - margin.bottom}"/>`;
    body += `<line class="median-line" x1="${margin.left}" y1="${medianLineY}" x2="${width - margin.right}" y2="${medianLineY}"/>`;
    for (const item of positive) {
      const x = margin.left + plotWidth * item.frequency / maxX;
      const y = margin.top + plotHeight * (1 - item.meanDowntime / maxY);
      const radius = Math.max(4, Math.min(12, 4 + Math.sqrt(item.downtime) / 4));
      body += `<circle cx="${x}" cy="${y}" r="${radius}" fill="${palette[1]}" fill-opacity=".72" stroke="white" stroke-width="1"><title>${escapeXml(item.label)}: ${formatValue(item.frequency)} OT; ${decimalFormat.format(item.meanDowntime)} h downtime medio</title></circle>`;
    }
    const labels = [...positive].sort((a, b) => b.downtime - a.downtime).slice(0, 6);
    labels.forEach((item) => {
      const x = margin.left + plotWidth * item.frequency / maxX;
      const y = margin.top + plotHeight * (1 - item.meanDowntime / maxY);
      body += `<text class="value-label" x="${x + 6}" y="${y - 5}">${escapeXml(item.label.slice(0, 18))}</text>`;
    });
    body += `<text x="${width / 2}" y="${height - 4}" text-anchor="middle">Frecuencia (órdenes de trabajo)</text>`;
    body += `<text x="12" y="${height / 2}" text-anchor="middle" transform="rotate(-90 12 ${height / 2})">Downtime medio (h/OT)</text>`;
    target.innerHTML = makeSvg(width, height, body);
  }

  function renderMttr(target, rows) {
    const closedCorrective = rows.filter((row) =>
      row.maintenance === "Correctivo"
      && (row.status === "Cerrada" || row.systemStatus.split(/\s+/).includes("teco"))
      && row.repairTime !== null
      && row.repairTime > 0,
    );
    const means = new Map();
    for (const row of closedCorrective) {
      const values = means.get(row.equipmentType) ?? [];
      values.push(row.repairTime);
      means.set(row.equipmentType, values);
    }
    const entries = [...means].map(([label, values]) => ({
      label,
      value: values.reduce((total, value) => total + value, 0) / values.length,
    })).sort((a, b) => b.value - a.value).slice(0, 8);
    if (!entries.length) return renderEmpty(target, "No hay correctivas cerradas con tiempo de reparación válido.");
    renderBars(target, entries, "Tiempo medio de reparación (h)", palette[2]);
  }

  function renderQualityTable() {
    $("#qualityTable").innerHTML = [...state.groups.values()].map((group) => {
      const uniqueOrders = distinctCount(group.rows, (row) => row.order);
      return `<tr>
        <td>${escapeHtml(group.filename)}</td>
        <td>${formatValue(group.rowCount)}</td>
        <td>${formatValue(uniqueOrders)}</td>
        <td>${formatValue(group.duplicateOrders)}</td>
        <td>${formatValue(group.emptyOrders)}</td>
        <td>${formatValue(group.invalidDates)}</td>
      </tr>`;
    }).join("");
  }

  function renderKpis(rows, groups) {
    const sumCost = sum(rows, "cost");
    const validRepair = rows.filter((row) => row.maintenance === "Correctivo"
      && (row.status === "Cerrada" || row.systemStatus.split(/\s+/).includes("teco"))
      && row.repairTime !== null && row.repairTime > 0);
    const mttr = validRepair.length
      ? validRepair.reduce((total, row) => total + row.repairTime, 0) / validRepair.length
      : null;
    const equipmentCount = hasField(groups, "equipment")
      ? formatValue(distinctCount(rows, (row) => row.equipment))
      : "N/D";
    const areaCount = hasField(groups, "area")
      ? formatValue(distinctCount(rows, (row) => row.area))
      : "N/D";
    const plannerCount = hasField(groups, "plannerGroup")
      ? formatValue(distinctCount(rows, (row) => row.plannerGroup))
      : "N/D";
    const costValue = hasField(groups, "cost") ? formatCurrency(sumCost) : "N/D";
    const downtimeValue = hasField(groups, "downtime")
      ? `${decimalFormat.format(sum(rows, "downtime"))} h`
      : "N/D";
    const values = [
      ["Órdenes registradas", formatValue(rows.length), `${formatValue(distinctCount(rows, (row) => row.order))} OT únicas`],
      ["Equipos atendidos", equipmentCount, hasField(groups, "equipment") ? "Equipos con órdenes en la selección" : "Columna no disponible"],
      ["Costo directo total", costValue, hasField(groups, "cost") ? `Promedio ${formatCurrency(rows.length ? sumCost / rows.length : 0)} por orden` : "Columna no disponible"],
      ["Downtime registrado", downtimeValue, hasField(groups, "downtime") ? "Suma del downtime en los registros" : "Columna no disponible"],
      ["Áreas con actividad", areaCount, hasField(groups, "area") ? "Áreas distintas informadas" : "Columna no disponible"],
      ["Grupos planificadores", plannerCount, hasField(groups, "plannerGroup") ? "Grupos distintos informados" : "Columna no disponible"],
      ["MTTR correctivo cerrado", mttr === null ? "N/D" : `${decimalFormat.format(mttr)} h`, `${formatValue(validRepair.length)} órdenes válidas`],
    ];
    $("#kpiGrid").innerHTML = values.map(([label, value, detail]) =>
      `<article class="kpi-card"><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value">${escapeHtml(value)}</div><div class="kpi-detail">${escapeHtml(detail)}</div></article>`,
    ).join("");
    return { sumCost, mttr, validRepairCount: validRepair.length };
  }

  function renderTable(rows) {
    const equipment = aggregate(rows, "equipment", "cost").slice(0, 10);
    $("#topEquipment").innerHTML = equipment.map((item) =>
      `<tr><td>${escapeHtml(item.label)}</td><td>${formatValue(item.count)}</td><td>${decimalFormat.format(item.downtime)}</td><td>${formatCurrency(item.value)}</td></tr>`,
    ).join("") || `<tr><td colspan="4">No hay datos suficientes para mostrar este resumen.</td></tr>`;
    if (!state.groups.get(state.selectedGroup)?.columns.equipment
      || !state.groups.get(state.selectedGroup)?.columns.cost) {
      $("#topEquipment").innerHTML = `<tr><td colspan="4">Se requieren las columnas de equipo y costo.</td></tr>`;
    }
    $("#tableGroupLabel").textContent = state.selectedGroup === "all" ? "Todos los grupos · sin sumar OT entre archivos" : state.selectedGroup;
  }

  function renderReport(rows, selected, metrics) {
    const title = selected;
    const groups = selectedGroups();
    const filters = activeFilterLabels();
    const costTop = hasField(groups, "equipment") && hasField(groups, "cost")
      ? aggregate(rows, "equipment", "cost")[0]
      : null;
    const downtimeTop = hasField(groups, "equipment") && hasField(groups, "downtime")
      ? aggregate(rows, "equipment", "downtime")[0]
      : null;
    const missingFailures = hasField(groups, "failure")
      ? rows.filter((row) => !row.failure).length
      : null;
    const preventiveCount = hasField(groups, "maintenance")
      ? rows.filter((row) => row.maintenance === "Preventivo").length
      : null;
    const areaTop = hasField(groups, "area")
      ? countBy(rows, (row) => row.area)[0]
      : null;
    const kpis = [
      ["Órdenes", formatValue(rows.length)],
      ["Costo directo", hasField(groups, "cost") ? formatCurrency(metrics.sumCost) : "No disponible"],
      ["Equipos", hasField(groups, "equipment") ? formatValue(distinctCount(rows, (row) => row.equipment)) : "No disponible"],
      ["Downtime", hasField(groups, "downtime") ? `${decimalFormat.format(sum(rows, "downtime"))} h` : "No disponible"],
      ["Ubicaciones", hasField(groups, "location") ? formatValue(distinctCount(rows, (row) => row.location)) : "No disponible"],
      ["MTTR correctivo cerrado", metrics.mttr === null ? "No disponible" : `${decimalFormat.format(metrics.mttr)} h`],
    ];
    const charts = [
      ["Evolución mensual", $("#monthlyChart")],
      ["Tipo de mantenimiento", $("#maintenanceChart")],
      ["Estados de órdenes", $("#statusChart")],
      ["Órdenes por área", $("#areaChart")],
      ["Órdenes por grupo planificador", $("#plannerChart")],
      ["Distribución del indicador ABC", $("#abcChart")],
      ["Registros por planificación", $("#plannedChart")],
      ["Pareto de costos por equipo", $("#equipmentCostChart")],
      ["Pareto de costos por ubicación", $("#locationCostChart")],
      ["Pareto de costos por puesto de trabajo", $("#workCenterCostChart")],
      ["Matriz de frecuencia y downtime", $("#priorityChart")],
      ["MTTR por tipo de equipo", $("#mttrChart")],
    ];
    const chartsHtml = charts.map(([label, target]) => {
      const svg = target.querySelector("svg");
      return svg ? `<article class="report-chart"><h3>${escapeHtml(label)}</h3>${svg.outerHTML}</article>` : "";
    }).join("");
    const qualityRows = selectedGroups().map((group) => `
      <tr>
        <td>${escapeHtml(group.filename)}</td>
        <td>${formatValue(group.rowCount)}</td>
        <td>${formatValue(distinctCount(group.rows, (row) => row.order))}</td>
        <td>${formatValue(group.duplicateOrders)}</td>
        <td>${formatValue(group.emptyOrders)}</td>
        <td>${formatValue(group.invalidDates)}</td>
      </tr>`).join("");
    const findings = [
      preventiveCount === null
        ? "No hay una columna de tipo de mantenimiento disponible para calcular la proporción de órdenes preventivas."
        : `${formatValue(preventiveCount)} órdenes preventivas (${rows.length ? decimalFormat.format(preventiveCount / rows.length * 100) : "0"}% de la selección).`,
      areaTop ? `Área con mayor volumen: ${areaTop.label} (${formatValue(areaTop.value)} órdenes).` : "No hay áreas disponibles para resumir el volumen por área.",
      `Mayor costo por equipo en la selección: ${costTop ? `${costTop.label} (${formatCurrency(costTop.value)})` : "sin datos"}.`,
      `Mayor downtime acumulado por equipo: ${downtimeTop ? `${downtimeTop.label} (${decimalFormat.format(downtimeTop.downtime)} h)` : "sin datos"}.`,
      missingFailures === null
        ? "No existe una columna de modo de falla para caracterizar estos registros."
        : `Registros sin modo de falla: ${formatValue(missingFailures)} de ${formatValue(rows.length)} (${rows.length ? decimalFormat.format(missingFailures / rows.length * 100) : "0"}%).`,
      `MTTR calculado con ${formatValue(metrics.validRepairCount)} órdenes correctivas cerradas con tiempo de reparación positivo.`,
      `Filas que pertenecen a identificadores OT repetidos: ${formatValue(selectedGroups().reduce((total, group) => total + group.duplicateOrders, 0))}.`,
      `Fechas informadas que no pudieron interpretarse: ${formatValue(selectedGroups().reduce((total, group) => total + group.invalidDates, 0))}.`,
    ];
    $("#printReport").innerHTML = `
      <section class="report-cover">
        <div class="report-cover-brand"><span class="report-brand-mark">G</span><span><strong>GMAO</strong><small>INTELIGENCIA DE MANTENIMIENTO</small></span></div>
        <div class="report-cover-kicker">INFORME DE GESTIÓN · ${escapeHtml(title).toUpperCase()}</div>
        <h1>Análisis de desempeño<br>y actividad de mantenimiento</h1>
        <p class="report-cover-subtitle">Lectura ejecutiva para priorizar conversaciones, validar datos y orientar el trabajo de mantenimiento.</p>
        <div class="report-cover-meta"><div><span>PERIODO DEL INFORME</span><strong>${escapeHtml(new Date().toLocaleDateString("es-CL", { year: "numeric", month: "long", day: "numeric" }))}</strong></div><div><span>REGISTROS ANALIZADOS</span><strong>${formatValue(rows.length)} órdenes</strong></div></div>
        <div class="report-rule"></div>
        <p class="report-source">Fuente: ${escapeHtml(groups.map((group) => group.filename).join(", "))}. Procesado localmente · ${formatValue(rows.length)} de ${formatValue(groups.reduce((total, group) => total + group.rowCount, 0))} filas del archivo tras filtros.</p>
        <div class="report-cover-note">Documento exploratorio. Las señales identificadas orientan la revisión; no constituyen diagnóstico de fallas ni evaluación de desempeño individual.</div>
      </section>
      <section class="report-section">
        <div class="report-section-kicker">01 · SÍNTESIS</div><h2>Resumen ejecutivo</h2>
        ${filters.length ? `<p class="report-lead"><strong>Alcance aplicado:</strong> ${escapeHtml(filters.join(" · "))}. La selección se analiza dentro de un único archivo y no consolida registros entre grupos.</p>` : `<p class="report-lead">Vista completa del archivo seleccionado. El análisis y las conclusiones se limitan a los registros observados.</p>`}
        <div class="report-kpis">${kpis.map(([label, value]) => `<div class="report-kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>
        <div class="report-highlights"><article><span>MANTENIMIENTO PREVENTIVO</span><strong>${preventiveCount === null ? "N/D" : `${rows.length ? decimalFormat.format(preventiveCount / rows.length * 100) : "0"}%`}</strong><small>Proporción en la selección</small></article><article><span>VOLUMEN POR ÁREA</span><strong>${areaTop ? escapeHtml(areaTop.label) : "N/D"}</strong><small>${areaTop ? `${formatValue(areaTop.value)} órdenes` : "Variable no disponible"}</small></article><article><span>CALIDAD DEL DATO</span><strong>${formatValue(groups.reduce((total, group) => total + group.duplicateOrders, 0))}</strong><small>Filas asociadas a OT repetidas</small></article></div>
        <h3>Calidad de los datos</h3>
        <div class="report-table-wrap"><table class="report-table"><thead><tr><th>Archivo</th><th>Filas</th><th>OT únicas</th><th>Filas con OT repetida</th><th>OT vacías</th><th>Fechas no válidas</th></tr></thead><tbody>${qualityRows}</tbody></table></div>
        <h3>Hallazgos basados en los datos</h3>
        <ul>${findings.map((finding) => `<li>${escapeHtml(finding)}</li>`).join("")}</ul>
        <p>Las variables que no aparecen en los encabezados del archivo se identifican como no disponibles; no se interpretan como valores cero.</p>
        <h3>Interpretación y validación técnica</h3>
        <p>El costo y downtime son medidas observadas, no causas. Equipos con alta frecuencia o impacto económico son candidatos para revisión contextual; validar criticidad, exposición, alcance de las órdenes y reglas de extracción con los responsables del CMMS.</p>
        <p>El MTTR es una media descriptiva de órdenes correctivas cerradas que tienen tiempo de reparación positivo. No es una predicción de confiabilidad. Los registros sin modo de falla no se utilizan para atribuir causas.</p>
        <div class="report-note"><strong>Comparación de grupos:</strong> las OT pueden compartir claves entre archivos. Por eso el panel compara cada grupo por separado y no interpreta una suma de grupos como órdenes únicas.</div>
      </section>
      <section class="report-section">
        <div class="report-section-kicker">02 · ANÁLISIS VISUAL</div><h2>Indicadores y gráficos</h2>
        <div class="report-chart-grid">${chartsHtml}</div>
      </section>
      <section class="report-section">
        <div class="report-section-kicker">03 · ACCIONES</div><h2>Conclusiones y próximos pasos</h2>
        <ol>
          <li>Revisar los Pareto de costo y los equipos que aparecen en la zona de alta frecuencia y downtime.</li>
          <li>Confirmar la calidad de OT repetidas, campos de modo de falla y tipos de estado antes de consolidar resultados.</li>
          <li>Contrastar las señales del análisis con criticidad, historial y conocimiento técnico de operación.</li>
        </ol>
        <p class="report-note">Los resultados son descriptivos y dependen de las columnas disponibles y de la calidad de los archivos cargados. Las recomendaciones no sustituyen una evaluación de ingeniería.</p>
      </section>`;
  }

  function refreshDashboard() {
    refreshDimensionFilters();
    const sourceGroups = selectedGroups();
    const groups = sourceGroups.map((group) => ({ ...group, rows: rowsMatchingFilters(group) }));
    const rows = groups.flatMap((group) => group.rows);
    const currentKpis = renderKpis(rows, groups);
    renderQualityTable();
    const fullCount = sourceGroups.reduce((total, group) => total + group.rowCount, 0);
    const activeFilters = activeFilterLabels();
    $("#datasetSummary").textContent = `${groups[0]?.filename ?? ""} · ${formatValue(rows.length)} de ${formatValue(fullCount)} registros${activeFilters.length ? ` · ${activeFilters.join(" · ")}` : " · vista completa del archivo"}`;
    $("#activeFilterSummary").textContent = activeFilters.length
      ? `${formatValue(rows.length)} registros coinciden con los filtros seleccionados.`
      : `Todos los ${formatValue(fullCount)} registros del archivo están incluidos.`;
    if (hasField(groups, "startDate")) renderMonthly($("#monthlyChart"), groups);
    else renderEmpty($("#monthlyChart"), "No se encontró la columna de fecha de inicio.");
    if (hasField(groups, "maintenance")) renderCounts($("#maintenanceChart"), countBy(rows, (row) => row.maintenance));
    else renderEmpty($("#maintenanceChart"), "No se encontró la columna de tipo de mantenimiento.");
    if (hasField(groups, "status") || hasField(groups, "systemStatus")) renderCounts($("#statusChart"), countBy(rows, (row) => row.status));
    else renderEmpty($("#statusChart"), "No se encontró una columna de estado.");
    if (hasField(groups, "orderClass")) renderCounts($("#classChart"), countBy(rows, (row) => row.orderClass));
    else renderEmpty($("#classChart"), "No se encontró la columna de clase de orden.");
    if (hasField(groups, "area")) renderCounts($("#areaChart"), countBy(rows, (row) => row.area));
    else renderEmpty($("#areaChart"), "No se encontró la columna de área.");
    if (hasField(groups, "plannerGroup")) renderCounts($("#plannerChart"), countBy(rows, (row) => row.plannerGroup));
    else renderEmpty($("#plannerChart"), "No se encontró la columna de grupo planificador.");
    if (hasField(groups, "abcIndicator")) renderCounts($("#abcChart"), countBy(rows, (row) => row.abcIndicator));
    else renderEmpty($("#abcChart"), "No se encontró la columna de indicador ABC.");
    if (hasField(groups, "planned")) renderCounts($("#plannedChart"), countBy(rows, (row) => row.planned));
    else renderEmpty($("#plannedChart"), "No se encontró la columna de planificación.");
    if (hasField(groups, "equipment") && hasField(groups, "cost")) {
      renderPareto($("#equipmentCostChart"), aggregate(rows, "equipment", "cost"));
    } else renderEmpty($("#equipmentCostChart"), "Se requieren las columnas de equipo y costo.");
    if (hasField(groups, "location") && hasField(groups, "cost")) {
      renderPareto($("#locationCostChart"), aggregate(rows, "location", "cost"));
    } else renderEmpty($("#locationCostChart"), "Se requieren las columnas de ubicación técnica y costo.");
    if (hasField(groups, "workCenter") && hasField(groups, "cost")) {
      renderPareto($("#workCenterCostChart"), aggregate(rows, "workCenter", "cost"));
    } else renderEmpty($("#workCenterCostChart"), "Se requieren las columnas de puesto de trabajo y costo.");
    if (hasField(groups, "equipment") && hasField(groups, "downtime")) renderPriority($("#priorityChart"), rows);
    else renderEmpty($("#priorityChart"), "Se requieren las columnas de equipo y downtime.");
    if (hasField(groups, "repairTime") && hasField(groups, "maintenance")
      && (hasField(groups, "status") || hasField(groups, "systemStatus"))) {
      renderMttr($("#mttrChart"), rows);
    } else renderEmpty($("#mttrChart"), "No están disponibles las columnas necesarias para calcular MTTR.");
    renderTable(rows);
    renderReport(rows, state.selectedGroup, currentKpis);
  }

  function showError(message) {
    const element = $("#loadMessage");
    element.className = "message error";
    element.textContent = message;
  }

  async function acceptFiles(files) {
    const csvFiles = [...files].filter((file) => /\.csv$/i.test(file.name));
    if (!csvFiles.length) {
      showError("Selecciona al menos un archivo CSV.");
      return;
    }
    const fileList = $("#fileList");
    fileList.textContent = `Procesando ${csvFiles.length} archivo(s)…`;
    $("#loadMessage").className = "message";
    try {
      const loaded = await Promise.all(csvFiles.map(loadCsvFile));
      state.groups.clear();
      for (const item of loaded) {
        if (state.groups.has(item.group)) {
          item.group = `${item.group} · ${state.groups.size + 1}`;
        }
        state.groups.set(item.group, item);
      }
      state.sourceNames = loaded.map((item) => item.filename);
      state.selectedGroup = "all";
      const filter = $("#groupFilter");
      filter.innerHTML = [...state.groups.keys()]
        .map((group) => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`).join("");
      state.selectedGroup = loaded[0].group;
      filter.value = state.selectedGroup;
      state.filters = { area: "", shift: "", plannerGroup: "" };
      fileList.textContent = loaded.map((item) => `${item.filename} (${formatValue(item.rowCount)} filas)`).join(" · ");
      $("#dashboard").hidden = false;
      $("#emptyState").hidden = true;
      $("#clearButton").disabled = false;
      $("#pdfButton").disabled = false;
      const warningMessages = [];
      for (const item of loaded) {
        if (!("cost" in item.columns)) warningMessages.push(`${item.filename}: no se encontró costo total; el Pareto de costos no estará disponible.`);
        if (!("startDate" in item.columns)) warningMessages.push(`${item.filename}: no se encontró fecha de inicio; no se podrá mostrar la evolución mensual.`);
        if (!("failure" in item.columns)) warningMessages.push(`${item.filename}: no se encontró modo de falla; no se podrá segmentar por esta variable.`);
        if (item.duplicateOrders) warningMessages.push(`${item.filename}: ${formatValue(item.duplicateOrders)} filas pertenecen a OT repetidas; se conservaron sin deduplicar.`);
        if (item.emptyOrders) warningMessages.push(`${item.filename}: ${formatValue(item.emptyOrders)} filas tienen el identificador OT vacío.`);
        if (item.invalidDates) warningMessages.push(`${item.filename}: ${formatValue(item.invalidDates)} valores de fecha informados no se pudieron interpretar.`);
        const missingPct = item.rowCount ? item.missingFailure / item.rowCount * 100 : 0;
        if (item.columns.failure !== undefined && missingPct >= 30) {
          warningMessages.push(`${item.filename}: ${decimalFormat.format(missingPct)}% de las filas no tiene modo de falla; interpreta cualquier segmentación por esta variable con cautela.`);
        }
      }
      $("#warningList").innerHTML = warningMessages.map((message) => `<div class="notice">${escapeHtml(message)}</div>`).join("");
      const message = $("#loadMessage");
      message.className = "message success";
      message.textContent = "Análisis actualizado. Los datos se mantienen en este navegador.";
      refreshDashboard();
    } catch (error) {
      fileList.textContent = "No se pudo completar la carga.";
      showError(error instanceof Error ? error.message : "Ocurrió un error al leer el archivo.");
    }
  }

  $("#fileInput").addEventListener("change", (event) => {
    if (event.target.files?.length) acceptFiles(event.target.files);
  });
  $("#groupFilter").addEventListener("change", (event) => {
    state.selectedGroup = event.target.value;
    state.filters = { area: "", shift: "", plannerGroup: "" };
    refreshDashboard();
  });
  for (const [id, field] of [["#areaFilter", "area"], ["#shiftFilter", "shift"], ["#plannerFilter", "plannerGroup"]]) {
    $(id).addEventListener("change", (event) => {
      state.filters[field] = event.target.value;
      refreshDashboard();
    });
  }
  $("#resetFilters").addEventListener("click", () => {
    state.filters = { area: "", shift: "", plannerGroup: "" };
    refreshDashboard();
  });
  $("#clearButton").addEventListener("click", () => {
    state.groups.clear();
    state.sourceNames = [];
    $("#fileInput").value = "";
    $("#fileList").textContent = "Ningún archivo seleccionado";
    $("#loadMessage").textContent = "";
    $("#loadMessage").className = "message";
    $("#warningList").innerHTML = "";
    state.filters = { area: "", shift: "", plannerGroup: "" };
    $("#groupFilter").innerHTML = "";
    $("#activeFilterSummary").textContent = "";
    for (const id of ["#areaFilter", "#shiftFilter", "#plannerFilter"]) {
      $(id).innerHTML = `<option value="">Carga un archivo para ver las opciones</option>`;
      $(id).disabled = true;
    }
    $("#dashboard").hidden = true;
    $("#emptyState").hidden = false;
    $("#clearButton").disabled = true;
    $("#pdfButton").disabled = true;
  });
  $("#pdfButton").addEventListener("click", () => {
    if (state.groups.size) window.print();
  });

  const dropzone = $("#dropzone");
  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-over");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-over"));
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-over");
    if (event.dataTransfer?.files.length) acceptFiles(event.dataTransfer.files);
  });
})();
