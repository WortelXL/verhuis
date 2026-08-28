(function () {
  const toastEl = document.getElementById('toast');
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  async function api(path, options) {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
    if (res.status === 401) { window.location.href = '/'; throw new Error('Niet ingelogd'); }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Er ging iets mis');
    }
    return res.status === 204 ? null : res.json();
  }

  let metingen = [];

  async function init() {
    const me = await api('/api/me');
    if (!me.loggedIn) { window.location.href = '/'; return; }
    document.getElementById('whoami').textContent = `${me.username} (${me.role === 'admin' ? 'beheerder' : 'gebruiker'})`;
    if (me.role === 'admin') document.getElementById('admin-link').style.display = '';
    loadVersion();

    document.getElementById('logout-btn').addEventListener('click', async () => {
      await api('/api/logout', { method: 'POST' });
      window.location.href = '/';
    });

    await loadMetingen();
  }

  // ---------- Versiebadge & changelog ----------
  async function loadVersion() {
    try {
      const data = await api('/api/version');
      const badge = document.getElementById('version-badge');
      const popover = document.getElementById('changelog-popover');
      if (!badge || !popover) return;
      badge.textContent = 'v' + data.version;
      popover.innerHTML = data.changelog.map(entry => `
        <div class="changelog-entry">
          <span class="changelog-version">v${escapeHtml(entry.version)}</span>
          <ul>${entry.wijzigingen.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
        </div>
      `).join('');
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        popover.hidden = !popover.hidden;
      });
      document.addEventListener('click', (e) => {
        if (!popover.hidden && !popover.contains(e.target) && e.target !== badge) {
          popover.hidden = true;
        }
      });
    } catch (e) { /* niet kritiek, negeren */ }
  }

  // ---------- Maten ----------
  async function loadMetingen() {
    metingen = await api('/api/metingen');
    render();
  }

  function numberInput(value, onChange) {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.1';
    input.min = '0';
    input.placeholder = '—';
    input.className = 'inline-text-input maten-number';
    input.value = value === null || value === undefined ? '' : value;
    input.addEventListener('change', onChange);
    return input;
  }

  function render() {
    const tbody = document.getElementById('maten-tbody');
    tbody.innerHTML = '';

    if (!metingen.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 7;
      td.className = 'empty-state';
      td.textContent = 'Nog geen maten. Voeg er hieronder een toe.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    metingen.forEach(m => {
      const tr = document.createElement('tr');

      const tdNaam = document.createElement('td');
      const naamInput = document.createElement('input');
      naamInput.type = 'text';
      naamInput.value = m.naam;
      naamInput.className = 'inline-text-input';
      naamInput.maxLength = 100;
      naamInput.addEventListener('change', async () => {
        try {
          const updated = await api(`/api/metingen/${m.id}`, { method: 'PUT', body: JSON.stringify({ naam: naamInput.value }) });
          Object.assign(m, updated);
          showToast('Naam bijgewerkt');
        } catch (e) { showToast(e.message); naamInput.value = m.naam; }
      });
      tdNaam.appendChild(naamInput);

      const tdLengte = document.createElement('td');
      const lengteInput = numberInput(m.lengte, async () => {
        try {
          const updated = await api(`/api/metingen/${m.id}`, { method: 'PUT', body: JSON.stringify({ lengte: lengteInput.value }) });
          Object.assign(m, updated);
        } catch (e) { showToast(e.message); lengteInput.value = m.lengte ?? ''; }
      });
      tdLengte.appendChild(lengteInput);

      const tdBreedte = document.createElement('td');
      const breedteInput = numberInput(m.breedte, async () => {
        try {
          const updated = await api(`/api/metingen/${m.id}`, { method: 'PUT', body: JSON.stringify({ breedte: breedteInput.value }) });
          Object.assign(m, updated);
        } catch (e) { showToast(e.message); breedteInput.value = m.breedte ?? ''; }
      });
      tdBreedte.appendChild(breedteInput);

      const tdHoogte = document.createElement('td');
      const hoogteInput = numberInput(m.hoogte, async () => {
        try {
          const updated = await api(`/api/metingen/${m.id}`, { method: 'PUT', body: JSON.stringify({ hoogte: hoogteInput.value }) });
          Object.assign(m, updated);
        } catch (e) { showToast(e.message); hoogteInput.value = m.hoogte ?? ''; }
      });
      tdHoogte.appendChild(hoogteInput);

      const tdEenheid = document.createElement('td');
      const eenheidSelect = document.createElement('select');
      ['cm', 'm', 'mm', 'inch'].forEach(eh => {
        const opt = document.createElement('option');
        opt.value = eh;
        opt.textContent = eh;
        if (m.eenheid === eh) opt.selected = true;
        eenheidSelect.appendChild(opt);
      });
      eenheidSelect.addEventListener('change', async () => {
        try {
          const updated = await api(`/api/metingen/${m.id}`, { method: 'PUT', body: JSON.stringify({ eenheid: eenheidSelect.value }) });
          Object.assign(m, updated);
        } catch (e) { showToast(e.message); eenheidSelect.value = m.eenheid; }
      });
      tdEenheid.appendChild(eenheidSelect);

      const tdNotities = document.createElement('td');
      const notitiesInput = document.createElement('input');
      notitiesInput.type = 'text';
      notitiesInput.value = m.notities || '';
      notitiesInput.placeholder = 'Optioneel';
      notitiesInput.className = 'inline-text-input';
      notitiesInput.maxLength = 300;
      notitiesInput.addEventListener('change', async () => {
        try {
          const updated = await api(`/api/metingen/${m.id}`, { method: 'PUT', body: JSON.stringify({ notities: notitiesInput.value }) });
          Object.assign(m, updated);
        } catch (e) { showToast(e.message); notitiesInput.value = m.notities || ''; }
      });
      tdNotities.appendChild(notitiesInput);

      const tdActions = document.createElement('td');
      tdActions.className = 'actions-cell';
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn secondary small danger';
      delBtn.textContent = 'Verwijderen';
      delBtn.addEventListener('click', async () => {
        if (!confirm(`"${m.naam}" verwijderen?`)) return;
        try {
          await api(`/api/metingen/${m.id}`, { method: 'DELETE' });
          metingen = metingen.filter(x => x.id !== m.id);
          render();
          showToast('Meting verwijderd');
        } catch (e) { showToast(e.message); }
      });
      tdActions.appendChild(delBtn);

      tr.appendChild(tdNaam);
      tr.appendChild(tdLengte);
      tr.appendChild(tdBreedte);
      tr.appendChild(tdHoogte);
      tr.appendChild(tdEenheid);
      tr.appendChild(tdNotities);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
  }

  document.getElementById('maten-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('maten-error');
    errorEl.textContent = '';
    const payload = {
      naam: document.getElementById('new-maten-naam').value.trim(),
      lengte: document.getElementById('new-maten-lengte').value,
      breedte: document.getElementById('new-maten-breedte').value,
      hoogte: document.getElementById('new-maten-hoogte').value,
      eenheid: document.getElementById('new-maten-eenheid').value,
      notities: document.getElementById('new-maten-notities').value.trim()
    };
    try {
      const meting = await api('/api/metingen', { method: 'POST', body: JSON.stringify(payload) });
      metingen.push(meting);
      document.getElementById('maten-form').reset();
      document.getElementById('new-maten-eenheid').value = 'cm';
      render();
      showToast(`"${meting.naam}" toegevoegd`);
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  init().catch(err => showToast(err.message));
})();
