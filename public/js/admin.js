(function () {
  const toastEl = document.getElementById('toast');
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove('show'), 2400);
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

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  let currentUserId = null;

  async function init() {
    const me = await api('/api/me');
    if (!me.loggedIn) { window.location.href = '/'; return; }
    if (me.role !== 'admin') { window.location.href = '/planner'; return; }
    document.getElementById('whoami').textContent = `${me.username} (beheerder)`;
    loadVersion();

    document.getElementById('logout-btn').addEventListener('click', async () => {
      await api('/api/logout', { method: 'POST' });
      window.location.href = '/';
    });

    await loadRangeSettings();
    await loadLabels();
    await loadPeople();
    await loadUsers();
    await loadCategories();
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

  // ---------- Labels ----------
  const ICON_PRESETS = ['🏷️', '📦', '⚡', '🔑', '🚚', '🧰', '📋', '⚠️', '🧹', '🐾', '👶', '🌿'];

  (function initIconPresets() {
    const wrap = document.getElementById('icon-presets');
    ICON_PRESETS.forEach(icon => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-preset-btn';
      btn.textContent = icon;
      btn.addEventListener('click', () => {
        document.getElementById('new-label-icoon').value = icon;
      });
      wrap.appendChild(btn);
    });
  })();

  async function loadLabels() {
    const labels = await api('/api/labels');
    const tbody = document.getElementById('labels-tbody');
    tbody.innerHTML = '';
    labels.forEach(l => {
      const tr = document.createElement('tr');

      const tdIcon = document.createElement('td');
      const iconInput = document.createElement('input');
      iconInput.type = 'text';
      iconInput.value = l.icoon;
      iconInput.maxLength = 16;
      iconInput.className = 'inline-text-input icon-input';
      iconInput.addEventListener('change', async () => {
        try {
          await api(`/api/labels/${l.id}`, { method: 'PUT', body: JSON.stringify({ icoon: iconInput.value }) });
          showToast('Icoon bijgewerkt');
        } catch (e) { showToast(e.message); }
      });
      tdIcon.appendChild(iconInput);

      const tdName = document.createElement('td');
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = l.naam;
      nameInput.className = 'inline-text-input';
      nameInput.addEventListener('change', async () => {
        try {
          await api(`/api/labels/${l.id}`, { method: 'PUT', body: JSON.stringify({ naam: nameInput.value }) });
          showToast('Naam bijgewerkt');
        } catch (e) { showToast(e.message); }
      });
      tdName.appendChild(nameInput);

      const tdColor = document.createElement('td');
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = l.kleur;
      colorInput.addEventListener('change', async () => {
        try {
          await api(`/api/labels/${l.id}`, { method: 'PUT', body: JSON.stringify({ kleur: colorInput.value }) });
          showToast(`Kleur van "${l.naam}" bijgewerkt`);
        } catch (e) { showToast(e.message); }
      });
      tdColor.appendChild(colorInput);

      const tdActions = document.createElement('td');
      tdActions.className = 'actions-cell';
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn secondary small danger';
      delBtn.textContent = 'Verwijderen';
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Label "${l.naam}" verwijderen? Deze wordt ook van alle klussen verwijderd.`)) return;
        try {
          await api(`/api/labels/${l.id}`, { method: 'DELETE' });
          showToast('Label verwijderd');
          loadLabels();
        } catch (e) { showToast(e.message); }
      });
      tdActions.appendChild(delBtn);

      tr.appendChild(tdIcon);
      tr.appendChild(tdName);
      tr.appendChild(tdColor);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
  }

  document.getElementById('label-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('label-error');
    errorEl.textContent = '';
    const naam = document.getElementById('new-label-naam').value.trim();
    const icoon = document.getElementById('new-label-icoon').value.trim() || '🏷️';
    const kleur = document.getElementById('new-label-kleur').value;
    try {
      await api('/api/labels', { method: 'POST', body: JSON.stringify({ naam, icoon, kleur }) });
      document.getElementById('label-form').reset();
      document.getElementById('new-label-icoon').value = '🏷️';
      document.getElementById('new-label-kleur').value = '#1F3A5F';
      showToast(`Label "${naam}" toegevoegd`);
      loadLabels();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  // ---------- Personen ----------
  async function loadPeople() {
    const people = await api('/api/people');
    const tbody = document.getElementById('people-tbody');
    tbody.innerHTML = '';
    people.forEach(p => {
      const tr = document.createElement('tr');

      const tdColor = document.createElement('td');
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = p.kleur;
      colorInput.addEventListener('change', async () => {
        try {
          await api(`/api/people/${p.id}`, { method: 'PUT', body: JSON.stringify({ kleur: colorInput.value }) });
          showToast(`Kleur van "${p.naam}" bijgewerkt`);
        } catch (e) { showToast(e.message); }
      });
      tdColor.appendChild(colorInput);

      const tdName = document.createElement('td');
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = p.naam;
      nameInput.className = 'inline-text-input';
      nameInput.addEventListener('change', async () => {
        try {
          await api(`/api/people/${p.id}`, { method: 'PUT', body: JSON.stringify({ naam: nameInput.value }) });
          showToast('Naam bijgewerkt');
        } catch (e) { showToast(e.message); }
      });
      tdName.appendChild(nameInput);

      const tdActions = document.createElement('td');
      tdActions.className = 'actions-cell';
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn secondary small danger';
      delBtn.textContent = 'Verwijderen';
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Persoon "${p.naam}" verwijderen? Deze wordt ook van alle klussen ontkoppeld.`)) return;
        try {
          await api(`/api/people/${p.id}`, { method: 'DELETE' });
          showToast('Persoon verwijderd');
          loadPeople();
        } catch (e) { showToast(e.message); }
      });
      tdActions.appendChild(delBtn);

      tr.appendChild(tdColor);
      tr.appendChild(tdName);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
  }

  document.getElementById('person-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('person-error');
    errorEl.textContent = '';
    const naam = document.getElementById('new-person-naam').value.trim();
    const kleur = document.getElementById('new-person-kleur').value;
    try {
      await api('/api/people', { method: 'POST', body: JSON.stringify({ naam, kleur }) });
      document.getElementById('person-form').reset();
      document.getElementById('new-person-kleur').value = '#1F3A5F';
      showToast(`Persoon "${naam}" toegevoegd`);
      loadPeople();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  // ---------- Tijdlijnbereik ----------
  async function loadRangeSettings() {
    const settings = await api('/api/settings');
    document.getElementById('range-start').value = settings.rangeStart || '';
    document.getElementById('range-end').value = settings.rangeEnd || '';
  }

  document.getElementById('range-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('range-error');
    errorEl.textContent = '';
    const rangeStart = document.getElementById('range-start').value || null;
    const rangeEnd = document.getElementById('range-end').value || null;
    try {
      await api('/api/settings', { method: 'PUT', body: JSON.stringify({ rangeStart, rangeEnd }) });
      showToast('Tijdlijnbereik opgeslagen');
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  document.getElementById('range-reset').addEventListener('click', async () => {
    document.getElementById('range-start').value = '';
    document.getElementById('range-end').value = '';
    try {
      await api('/api/settings', { method: 'PUT', body: JSON.stringify({ rangeStart: null, rangeEnd: null }) });
      showToast('Tijdlijnbereik staat weer op automatisch');
    } catch (err) {
      document.getElementById('range-error').textContent = err.message;
    }
  });

  // ---------- Gebruikers ----------
  async function loadUsers() {
    const users = await api('/api/users');
    const me = await api('/api/me');
    currentUserId = null; // server bepaalt zelf-check, we tonen alleen UI-hint
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '';
    users.forEach(u => {
      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      tdName.textContent = u.username;
      if (u.username === me.username) {
        const badge = document.createElement('span');
        badge.className = 'you-badge';
        badge.textContent = 'jij';
        tdName.appendChild(document.createTextNode(' '));
        tdName.appendChild(badge);
      }

      const tdRole = document.createElement('td');
      const roleSelect = document.createElement('select');
      ['gebruiker', 'admin'].forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = r === 'admin' ? 'Beheerder' : 'Gebruiker';
        if (u.role === r) opt.selected = true;
        roleSelect.appendChild(opt);
      });
      roleSelect.addEventListener('change', async () => {
        try {
          await api(`/api/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ role: roleSelect.value }) });
          showToast(`Rol van ${u.username} bijgewerkt`);
          loadUsers();
        } catch (e) {
          showToast(e.message);
          roleSelect.value = u.role;
        }
      });
      tdRole.appendChild(roleSelect);

      const tdCreated = document.createElement('td');
      tdCreated.textContent = u.createdAt ? new Date(u.createdAt).toLocaleDateString('nl-NL') : '';

      const tdActions = document.createElement('td');
      tdActions.className = 'actions-cell';

      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'btn secondary small';
      resetBtn.textContent = 'Wachtwoord resetten';
      resetBtn.addEventListener('click', async () => {
        const pw = prompt(`Nieuw wachtwoord voor ${u.username} (minstens 6 tekens):`);
        if (!pw) return;
        try {
          await api(`/api/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ password: pw }) });
          showToast('Wachtwoord bijgewerkt');
        } catch (e) { showToast(e.message); }
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn secondary small danger';
      delBtn.textContent = 'Verwijderen';
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Gebruiker "${u.username}" verwijderen?`)) return;
        try {
          await api(`/api/users/${u.id}`, { method: 'DELETE' });
          showToast('Gebruiker verwijderd');
          loadUsers();
        } catch (e) { showToast(e.message); }
      });

      tdActions.appendChild(resetBtn);
      tdActions.appendChild(delBtn);

      tr.appendChild(tdName);
      tr.appendChild(tdRole);
      tr.appendChild(tdCreated);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
  }

  document.getElementById('user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('user-error');
    errorEl.textContent = '';
    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value;
    const role = document.getElementById('new-role').value;
    try {
      await api('/api/users', { method: 'POST', body: JSON.stringify({ username, password, role }) });
      document.getElementById('user-form').reset();
      showToast(`Gebruiker "${username}" toegevoegd`);
      loadUsers();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  // ---------- Categorieën ----------
  async function loadCategories() {
    const categories = await api('/api/categories');
    const tbody = document.getElementById('categories-tbody');
    tbody.innerHTML = '';
    categories.forEach(c => {
      const tr = document.createElement('tr');

      const tdColor = document.createElement('td');
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = c.kleur;
      colorInput.addEventListener('change', async () => {
        try {
          await api(`/api/categories/${c.id}`, { method: 'PUT', body: JSON.stringify({ kleur: colorInput.value }) });
          showToast(`Kleur van "${c.naam}" bijgewerkt`);
        } catch (e) { showToast(e.message); }
      });
      tdColor.appendChild(colorInput);

      const tdName = document.createElement('td');
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = c.naam;
      nameInput.className = 'inline-text-input';
      nameInput.addEventListener('change', async () => {
        try {
          await api(`/api/categories/${c.id}`, { method: 'PUT', body: JSON.stringify({ naam: nameInput.value }) });
          showToast('Naam bijgewerkt');
        } catch (e) { showToast(e.message); }
      });
      tdName.appendChild(nameInput);

      const tdActions = document.createElement('td');
      tdActions.className = 'actions-cell';
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn secondary small danger';
      delBtn.textContent = 'Verwijderen';
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Categorie "${c.naam}" verwijderen? Bestaande klussen met deze categorie behouden hun kleur niet meer.`)) return;
        try {
          await api(`/api/categories/${c.id}`, { method: 'DELETE' });
          showToast('Categorie verwijderd');
          loadCategories();
        } catch (e) { showToast(e.message); }
      });
      tdActions.appendChild(delBtn);

      tr.appendChild(tdColor);
      tr.appendChild(tdName);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
  }

  document.getElementById('category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('category-error');
    errorEl.textContent = '';
    const naam = document.getElementById('new-cat-naam').value.trim();
    const kleur = document.getElementById('new-cat-kleur').value;
    try {
      await api('/api/categories', { method: 'POST', body: JSON.stringify({ naam, kleur }) });
      document.getElementById('category-form').reset();
      document.getElementById('new-cat-kleur').value = '#1F3A5F';
      showToast(`Categorie "${naam}" toegevoegd`);
      loadCategories();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  init().catch(err => showToast(err.message));
})();
