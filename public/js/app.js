(function () {
  const DAY_WIDTH = 40;

  const grid = document.getElementById('timeline-grid');
  const scrollWrap = document.getElementById('timeline-scroll');
  const taskCountEl = document.getElementById('task-count');
  const toastEl = document.getElementById('toast');
  const form = document.getElementById('task-form');
  const categorieSelect = document.getElementById('categorie');
  const legendEl = document.getElementById('legend');
  const personChecklistEl = document.getElementById('person-checklist');

  let tasks = [];
  let categories = [];
  let categoryMap = {}; // id -> { naam, kleur }
  let people = [];
  let personMap = {}; // id -> { naam, kleur }
  let settings = { rangeStart: null, rangeEnd: null };
  let range = null; // { start: Date, totalDays: number }

  // ---------- Datumhelpers (lokale tijd, geen UTC-verschuiving) ----------
  function pad(n) { return String(n).padStart(2, '0'); }
  function parseDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function formatDate(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function stripTime(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function daysBetween(a, b) { return Math.round((stripTime(b) - stripTime(a)) / 86400000); }
  const DOW = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
  const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  function isoWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = (d.getUTCDay() + 6) % 7; // maandag = 0
    d.setUTCDate(d.getUTCDate() - dayNum + 3); // donderdag van deze week
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
    return 1 + Math.round((d - firstThursday) / (7 * 86400000));
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function initials(naam) {
    const parts = String(naam).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function namesFor(ids) {
    return (ids || []).map(id => (personMap[id] && personMap[id].naam)).filter(Boolean);
  }

  // ---------- Personen-selectievakjes (herbruikt in formulier én bewerkvenster) ----------
  function buildPersonChecklist(container, selectedIds) {
    container.innerHTML = '';
    if (!people.length) {
      container.innerHTML = '<div class="hint">Nog geen personen. Voeg ze toe via Beheer.</div>';
      return;
    }
    people.forEach(p => {
      const label = document.createElement('label');
      label.className = 'person-check-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = p.id;
      cb.checked = (selectedIds || []).includes(p.id);
      const swatch = document.createElement('span');
      swatch.className = 'person-check-swatch';
      swatch.style.background = p.kleur;
      label.appendChild(cb);
      label.appendChild(swatch);
      label.appendChild(document.createTextNode(p.naam));
      container.appendChild(label);
    });
  }
  function selectedPersonIds(container) {
    return Array.from(container.querySelectorAll('input:checked')).map(cb => cb.value);
  }

  // ---------- Tooltip bij hover op een balk ----------
  const tooltipEl = document.createElement('div');
  tooltipEl.className = 'task-tooltip';
  document.body.appendChild(tooltipEl);

  function showTooltip(task, x, y) {
    const catLabel = (categoryMap[task.categorie] && categoryMap[task.categorie].naam) || task.categorie;
    const notesHtml = task.notities
      ? `<div class="tt-notes">${escapeHtml(task.notities)}</div>`
      : `<div class="tt-notes tt-empty">Geen notities</div>`;
    const names = namesFor(task.toegewezenAan);
    const peopleHtml = names.length
      ? `<div class="tt-people">${escapeHtml(names.join(', '))}</div>`
      : '';
    tooltipEl.innerHTML =
      `<strong>${escapeHtml(task.titel)}</strong>` +
      `<span class="tt-meta">${escapeHtml(catLabel)} · ${task.start} t/m ${task.eind}</span>` +
      peopleHtml +
      notesHtml;
    moveTooltip(x, y);
    tooltipEl.classList.add('show');
  }
  function moveTooltip(x, y) {
    const pad = 14;
    let left = x + pad, top = y + pad;
    const maxLeft = window.innerWidth - tooltipEl.offsetWidth - 10;
    const maxTop = window.innerHeight - tooltipEl.offsetHeight - 10;
    if (left > maxLeft) left = x - tooltipEl.offsetWidth - pad;
    if (top > maxTop) top = y - tooltipEl.offsetHeight - pad;
    tooltipEl.style.left = Math.max(10, left) + 'px';
    tooltipEl.style.top = Math.max(10, top) + 'px';
  }
  function hideTooltip() { tooltipEl.classList.remove('show'); }

  // ---------- API ----------
  async function api(path, options) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    if (res.status === 401) {
      window.location.href = '/';
      throw new Error('Niet ingelogd');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Er ging iets mis');
    }
    return res.status === 204 ? null : res.json();
  }

  async function loadTasks() {
    tasks = await api('/api/tasks');
    render();
  }

  async function loadCategories() {
    categories = await api('/api/categories');
    categoryMap = {};
    categories.forEach(c => { categoryMap[c.id] = c; });

    categorieSelect.innerHTML = '';
    categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.naam;
      categorieSelect.appendChild(opt);
    });

    legendEl.querySelectorAll('.legend-item').forEach(el => el.remove());
    categories.forEach(c => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `<span class="legend-swatch" style="background:${c.kleur}"></span>${c.naam}`;
      legendEl.appendChild(item);
    });
  }

  async function loadMe() {
    const me = await api('/api/me');
    if (!me.loggedIn) { window.location.href = '/'; return; }
    const whoami = document.getElementById('whoami');
    if (whoami) whoami.textContent = `${me.username} (${me.role === 'admin' ? 'beheerder' : 'gebruiker'})`;
    const adminLink = document.getElementById('admin-link');
    if (adminLink && me.role === 'admin') adminLink.style.display = '';
  }

  async function loadSettings() {
    settings = await api('/api/settings');
  }

  async function loadPeople() {
    people = await api('/api/people');
    personMap = {};
    people.forEach(p => { personMap[p.id] = p; });
    buildPersonChecklist(personChecklistEl, []);
  }

  // ---------- Bereik berekenen ----------
  function computeRange() {
    const today = stripTime(new Date());
    let min = settings.rangeStart ? parseDate(settings.rangeStart) : addDays(today, -7);
    let max = settings.rangeEnd ? parseDate(settings.rangeEnd) : addDays(today, 60);
    // Klussen buiten het ingestelde bereik blijven zichtbaar, zodat er nooit een balk "verdwijnt".
    tasks.forEach(t => {
      const s = addDays(parseDate(t.start), -3);
      const e = addDays(parseDate(t.eind), 3);
      if (s < min) min = s;
      if (e > max) max = e;
    });
    if (max < min) max = min;
    const totalDays = daysBetween(min, max) + 1;
    return { start: min, totalDays };
  }

  // ---------- Renderen ----------
  function render() {
    range = computeRange();
    grid.innerHTML = '';
    grid.style.setProperty('--day-w', DAY_WIDTH + 'px');

    taskCountEl.textContent = tasks.length
      ? `${tasks.length} ${tasks.length === 1 ? 'klus' : 'klussen'}`
      : '';

    // Header
    const header = document.createElement('div');
    header.className = 'tl-header';
    header.style.flexDirection = 'column';

    const monthRow = document.createElement('div');
    monthRow.style.display = 'flex';
    const monthSpacer = document.createElement('div');
    monthSpacer.className = 'tl-label-spacer';
    monthSpacer.style.borderBottom = 'none';
    monthRow.appendChild(monthSpacer);

    let i = 0;
    while (i < range.totalDays) {
      const d = addDays(range.start, i);
      const month = d.getMonth(), year = d.getFullYear();
      let count = 0;
      while (i + count < range.totalDays) {
        const dd = addDays(range.start, i + count);
        if (dd.getMonth() !== month || dd.getFullYear() !== year) break;
        count++;
      }
      const monthEl = document.createElement('div');
      monthEl.className = 'tl-month';
      monthEl.style.width = (count * DAY_WIDTH) + 'px';
      monthEl.textContent = `${MONTHS[month]} ${year}`;
      monthRow.appendChild(monthEl);
      i += count;
    }
    header.appendChild(monthRow);

    const daysRow = document.createElement('div');
    daysRow.className = 'tl-days-row';
    const daysSpacer = document.createElement('div');
    daysSpacer.className = 'tl-label-spacer';
    daysRow.appendChild(daysSpacer);

    const today = stripTime(new Date());
    for (let d = 0; d < range.totalDays; d++) {
      const date = addDays(range.start, d);
      const cell = document.createElement('div');
      cell.className = 'tl-day';
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const isToday = daysBetween(today, date) === 0;
      if (isWeekend) cell.classList.add('weekend');
      if (isToday) cell.classList.add('today');
      const isMonday = date.getDay() === 1;
      const weekBadge = isMonday ? `<span class="wk">wk ${isoWeekNumber(date)}</span>` : '';
      if (isMonday) cell.classList.add('monday');
      cell.innerHTML = `${weekBadge}<span class="dow">${DOW[date.getDay()]}</span>${date.getDate()}`;
      daysRow.appendChild(cell);
    }
    header.appendChild(daysRow);
    grid.appendChild(header);

    if (!tasks.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Nog geen klussen. Voeg links een taak toe om ze op de tijdlijn te zien.';
      grid.appendChild(empty);
      return;
    }

    const sorted = [...tasks].sort((a, b) => parseDate(a.start) - parseDate(b.start));
    sorted.forEach(task => grid.appendChild(buildRow(task)));
  }

  function buildRow(task) {
    const row = document.createElement('div');
    row.className = 'tl-row' + (task.status === 'klaar' ? ' status-klaar' : '');
    row.dataset.id = task.id;

    const label = document.createElement('div');
    label.className = 'tl-row-label';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.status === 'klaar';
    checkbox.title = 'Markeer als klaar';
    checkbox.addEventListener('change', async () => {
      try {
        const updated = await api(`/api/tasks/${task.id}`, {
          method: 'PUT',
          body: JSON.stringify({ status: checkbox.checked ? 'klaar' : 'open' })
        });
        Object.assign(task, updated);
        render();
      } catch (e) { showToast(e.message); }
    });

    const titleSpan = document.createElement('span');
    titleSpan.className = 'title-text';
    titleSpan.textContent = task.titel;
    const catLabel = (categoryMap[task.categorie] && categoryMap[task.categorie].naam) || task.categorie;
    const assignedNames = namesFor(task.toegewezenAan);
    titleSpan.title = `${catLabel} · ${task.start} t/m ${task.eind}`
      + (assignedNames.length ? `\n${assignedNames.join(', ')}` : '')
      + (task.notities ? `\n${task.notities}` : '');

    const delBtn = document.createElement('button');
    delBtn.className = 'del-btn';
    delBtn.type = 'button';
    delBtn.innerHTML = '&times;';
    delBtn.title = 'Verwijderen';
    delBtn.addEventListener('click', async () => {
      if (!confirm(`"${task.titel}" verwijderen?`)) return;
      try {
        await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
        tasks = tasks.filter(t => t.id !== task.id);
        render();
        showToast('Klus verwijderd');
      } catch (e) { showToast(e.message); }
    });

    label.appendChild(checkbox);
    label.appendChild(titleSpan);
    label.appendChild(delBtn);

    const track = document.createElement('div');
    track.className = 'tl-row-track';

    const today = stripTime(new Date());
    const todayIdx = daysBetween(range.start, today);
    if (todayIdx >= 0 && todayIdx < range.totalDays) {
      const todayLine = document.createElement('div');
      todayLine.className = 'today-line';
      todayLine.style.left = (todayIdx * DAY_WIDTH) + 'px';
      track.appendChild(todayLine);
    }

    const bar = buildBar(task, track);
    track.appendChild(bar);

    row.appendChild(label);
    row.appendChild(track);
    return row;
  }

  function buildBar(task, track) {
    const startIdx = daysBetween(range.start, parseDate(task.start));
    const endIdx = daysBetween(range.start, parseDate(task.eind));
    const bar = document.createElement('div');
    bar.className = 'task-bar' + (task.status === 'klaar' ? ' status-klaar' : '');
    bar.style.background = (categoryMap[task.categorie] && categoryMap[task.categorie].kleur) || '#8A8578';
    bar.style.left = (startIdx * DAY_WIDTH) + 'px';
    bar.style.width = ((endIdx - startIdx + 1) * DAY_WIDTH - 4) + 'px';

    const titleEl = document.createElement('span');
    titleEl.className = 'bar-title';
    titleEl.textContent = task.titel;
    bar.appendChild(titleEl);

    const assigned = (task.toegewezenAan || []).map(id => personMap[id]).filter(Boolean);
    if (assigned.length) {
      const avatars = document.createElement('span');
      avatars.className = 'bar-avatars';
      assigned.slice(0, 4).forEach(p => {
        const chip = document.createElement('span');
        chip.className = 'avatar-chip';
        chip.style.background = p.kleur;
        chip.textContent = initials(p.naam);
        avatars.appendChild(chip);
      });
      bar.appendChild(avatars);
    }

    const handleL = document.createElement('div');
    handleL.className = 'handle left';
    const handleR = document.createElement('div');
    handleR.className = 'handle right';
    bar.appendChild(handleL);
    bar.appendChild(handleR);

    attachDrag(bar, task, handleL, handleR);
    return bar;
  }

  // ---------- Bewerkvenster ----------
  function openEditModal(task) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.innerHTML = `
      <h3>Klus bewerken</h3>
      <div class="field">
        <label>Titel</label>
        <input type="text" class="m-titel">
      </div>
      <div class="field">
        <label>Categorie</label>
        <select class="m-categorie"></select>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Startdatum</label>
          <input type="date" class="m-start">
        </div>
        <div class="field">
          <label>Einddatum</label>
          <input type="date" class="m-eind">
        </div>
      </div>
      <div class="field">
        <label>Notities</label>
        <textarea class="m-notities" rows="3"></textarea>
      </div>
      <div class="field">
        <label>Toegewezen aan</label>
        <div class="person-checklist m-personen"></div>
      </div>
      <div class="field">
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" class="m-status" style="width:auto;">
          Klaar
        </label>
      </div>
      <div class="error-msg m-error"></div>
      <div class="modal-actions">
        <button type="button" class="btn secondary danger m-delete">Verwijderen</button>
        <div class="modal-actions-right">
          <button type="button" class="btn secondary m-cancel">Annuleren</button>
          <button type="button" class="btn m-save">Opslaan</button>
        </div>
      </div>
    `;
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const titelInput = card.querySelector('.m-titel');
    const catSelect = card.querySelector('.m-categorie');
    const startInput = card.querySelector('.m-start');
    const eindInput = card.querySelector('.m-eind');
    const notitiesInput = card.querySelector('.m-notities');
    const statusInput = card.querySelector('.m-status');
    const personenContainer = card.querySelector('.m-personen');
    const errorEl = card.querySelector('.m-error');

    titelInput.value = task.titel;
    categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.naam;
      if (c.id === task.categorie) opt.selected = true;
      catSelect.appendChild(opt);
    });
    startInput.value = task.start;
    eindInput.value = task.eind;
    notitiesInput.value = task.notities || '';
    statusInput.checked = task.status === 'klaar';
    buildPersonChecklist(personenContainer, task.toegewezenAan || []);

    card.querySelector('.m-cancel').addEventListener('click', () => overlay.remove());

    card.querySelector('.m-delete').addEventListener('click', async () => {
      if (!confirm(`"${task.titel}" verwijderen?`)) return;
      try {
        await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
        tasks = tasks.filter(t => t.id !== task.id);
        overlay.remove();
        render();
        showToast('Klus verwijderd');
      } catch (e) { errorEl.textContent = e.message; }
    });

    card.querySelector('.m-save').addEventListener('click', async () => {
      const payload = {
        titel: titelInput.value.trim(),
        categorie: catSelect.value,
        start: startInput.value,
        eind: eindInput.value,
        notities: notitiesInput.value.trim(),
        status: statusInput.checked ? 'klaar' : 'open',
        toegewezenAan: selectedPersonIds(personenContainer)
      };
      if (!payload.titel || !payload.start || !payload.eind) {
        errorEl.textContent = 'Titel, startdatum en einddatum zijn verplicht';
        return;
      }
      if (parseDate(payload.eind) < parseDate(payload.start)) {
        errorEl.textContent = 'Einddatum ligt voor de startdatum';
        return;
      }
      try {
        const updated = await api(`/api/tasks/${task.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        Object.assign(task, updated);
        overlay.remove();
        render();
        showToast('Klus bijgewerkt');
      } catch (e) { errorEl.textContent = e.message; }
    });

    titelInput.focus();
  }

  function attachDrag(bar, task, handleL, handleR) {
    let mode = null; // 'move' | 'resize-left' | 'resize-right'
    let startX = 0;
    let origStartIdx = 0;
    let origEndIdx = 0;
    let curStartIdx = 0;
    let curEndIdx = 0;

    function begin(e, m) {
      mode = m;
      startX = e.clientX;
      origStartIdx = daysBetween(range.start, parseDate(task.start));
      origEndIdx = daysBetween(range.start, parseDate(task.eind));
      curStartIdx = origStartIdx;
      curEndIdx = origEndIdx;
      bar.classList.add('dragging');
      bar.setPointerCapture(e.pointerId);
      hideTooltip();
      e.stopPropagation();
    }

    function move(e) {
      if (!mode) return;
      const deltaDays = Math.round((e.clientX - startX) / DAY_WIDTH);
      if (mode === 'move') {
        let s = origStartIdx + deltaDays;
        let en = origEndIdx + deltaDays;
        if (s < 0) { en -= s; s = 0; }
        if (en > range.totalDays - 1) { s -= (en - (range.totalDays - 1)); en = range.totalDays - 1; }
        curStartIdx = s; curEndIdx = en;
      } else if (mode === 'resize-left') {
        curStartIdx = Math.min(Math.max(0, origStartIdx + deltaDays), origEndIdx);
      } else if (mode === 'resize-right') {
        curEndIdx = Math.max(Math.min(range.totalDays - 1, origEndIdx + deltaDays), origStartIdx);
      }
      bar.style.left = (curStartIdx * DAY_WIDTH) + 'px';
      bar.style.width = ((curEndIdx - curStartIdx + 1) * DAY_WIDTH - 4) + 'px';
    }

    async function end(e) {
      if (!mode) return;
      bar.classList.remove('dragging');
      const changed = curStartIdx !== origStartIdx || curEndIdx !== origEndIdx;
      const wasMove = mode === 'move';
      mode = null;
      if (!changed) {
        if (wasMove) openEditModal(task);
        return;
      }
      const newStart = formatDate(addDays(range.start, curStartIdx));
      const newEnd = formatDate(addDays(range.start, curEndIdx));
      try {
        const updated = await api(`/api/tasks/${task.id}`, {
          method: 'PUT',
          body: JSON.stringify({ start: newStart, eind: newEnd })
        });
        Object.assign(task, updated);
        showToast(`"${task.titel}" verplaatst naar ${newStart} t/m ${newEnd}`);
      } catch (err) {
        showToast(err.message);
        render();
      }
    }

    bar.addEventListener('pointerdown', (e) => begin(e, 'move'));
    handleL.addEventListener('pointerdown', (e) => begin(e, 'resize-left'));
    handleR.addEventListener('pointerdown', (e) => begin(e, 'resize-right'));
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);

    bar.addEventListener('mouseenter', (e) => { if (!mode) showTooltip(task, e.clientX, e.clientY); });
    bar.addEventListener('mousemove', (e) => { if (!mode) moveTooltip(e.clientX, e.clientY); });
    bar.addEventListener('mouseleave', () => hideTooltip());
  }

  // ---------- Formulier: nieuwe klus ----------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      titel: document.getElementById('titel').value.trim(),
      categorie: document.getElementById('categorie').value,
      start: document.getElementById('start').value,
      eind: document.getElementById('eind').value,
      notities: document.getElementById('notities').value.trim(),
      toegewezenAan: selectedPersonIds(personChecklistEl)
    };
    if (!data.titel || !data.start || !data.eind) return;
    if (parseDate(data.eind) < parseDate(data.start)) {
      showToast('Einddatum ligt voor de startdatum');
      return;
    }
    try {
      const task = await api('/api/tasks', { method: 'POST', body: JSON.stringify(data) });
      tasks.push(task);
      form.reset();
      buildPersonChecklist(personChecklistEl, []);
      render();
      showToast(`"${task.titel}" toegevoegd`);
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    window.location.href = '/';
  });

  async function init() {
    await loadMe();
    await loadCategories();
    await loadPeople();
    await loadSettings();
    await loadTasks();
  }

  init().catch(err => showToast(err.message));
})();
