(function () {
  const DAY_WIDTH = 40;

  const grid = document.getElementById('timeline-grid');
  const scrollWrap = document.getElementById('timeline-scroll');
  const taskCountEl = document.getElementById('task-count');
  const toastEl = document.getElementById('toast');
  const form = document.getElementById('task-form');
  const categorieSelect = document.getElementById('categorie');
  const legendEl = document.getElementById('legend');

  let tasks = [];
  let categories = [];
  let categoryMap = {}; // id -> { naam, kleur }
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

  // ---------- Bereik berekenen ----------
  function computeRange() {
    const today = stripTime(new Date());
    let min = addDays(today, -7);
    let max = addDays(today, 60);
    tasks.forEach(t => {
      const s = addDays(parseDate(t.start), -3);
      const e = addDays(parseDate(t.eind), 3);
      if (s < min) min = s;
      if (e > max) max = e;
    });
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
    titleSpan.title = `${catLabel} · ${task.start} t/m ${task.eind}` + (task.notities ? `\n${task.notities}` : '');

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
    bar.textContent = task.titel;

    const handleL = document.createElement('div');
    handleL.className = 'handle left';
    const handleR = document.createElement('div');
    handleR.className = 'handle right';
    bar.appendChild(handleL);
    bar.appendChild(handleR);

    attachDrag(bar, task, handleL, handleR);
    return bar;
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
      mode = null;
      if (!changed) return;
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
  }

  // ---------- Formulier: nieuwe klus ----------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      titel: document.getElementById('titel').value.trim(),
      categorie: document.getElementById('categorie').value,
      start: document.getElementById('start').value,
      eind: document.getElementById('eind').value,
      notities: document.getElementById('notities').value.trim()
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
    await loadTasks();
  }

  init().catch(err => showToast(err.message));
})();
