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

  let todos = [];
  let labels = [];
  let labelMap = {};
  const labelChecklistEl = document.getElementById('todo-label-checklist');

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

    await loadLabels();
    await loadTodos();
  }

  // ---------- Labels ----------
  async function loadLabels() {
    labels = await api('/api/labels');
    labelMap = {};
    labels.forEach(l => { labelMap[l.id] = l; });
    buildLabelChecklist(labelChecklistEl, []);
  }

  function buildLabelChecklist(container, selectedIds) {
    container.innerHTML = '';
    if (!labels.length) {
      container.innerHTML = '<div class="hint">Nog geen labels. Voeg ze toe via Beheer.</div>';
      return;
    }
    labels.forEach(l => {
      const label = document.createElement('label');
      label.className = 'person-check-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = l.id;
      cb.checked = (selectedIds || []).includes(l.id);
      label.appendChild(cb);
      label.appendChild(document.createTextNode(l.icoon + ' ' + l.naam));
      container.appendChild(label);
    });
  }
  function selectedLabelIds(container) {
    return Array.from(container.querySelectorAll('input:checked')).map(cb => cb.value);
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

  // ---------- To-do's ----------
  async function loadTodos() {
    todos = await api('/api/todos');
    render();
  }

  function render() {
    const list = document.getElementById('todo-list');
    list.innerHTML = '';

    if (!todos.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Nog geen to-do\'s. Voeg er hierboven een toe.';
      list.appendChild(empty);
      return;
    }

    // Onafgeronde/niet-geplande to-do's bovenaan, daarna geplande, daarna afgevinkte.
    const sorted = [...todos].sort((a, b) => {
      const rank = t => t.klaar ? 2 : (t.taskId ? 1 : 0);
      return rank(a) - rank(b) || new Date(a.createdAt) - new Date(b.createdAt);
    });

    sorted.forEach(todo => list.appendChild(buildTodoRow(todo)));
  }

  function buildTodoRow(todo) {
    const row = document.createElement('div');
    row.className = 'todo-item' + (todo.klaar ? ' klaar' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = todo.klaar;
    checkbox.title = 'Markeer als klaar';
    checkbox.addEventListener('change', async () => {
      try {
        const updated = await api(`/api/todos/${todo.id}`, {
          method: 'PUT',
          body: JSON.stringify({ klaar: checkbox.checked })
        });
        Object.assign(todo, updated);
        render();
      } catch (e) { showToast(e.message); }
    });

    const text = document.createElement('span');
    text.className = 'todo-text';
    const taskLabels = (todo.labels || []).map(id => labelMap[id]).filter(Boolean);
    const iconPrefix = taskLabels.length ? taskLabels.map(l => l.icoon).join(' ') + ' ' : '';
    const donePrefix = todo.klaar ? '✅ ' : '';
    text.textContent = iconPrefix + donePrefix + todo.tekst;

    row.appendChild(checkbox);
    row.appendChild(text);

    const labelBtn = document.createElement('button');
    labelBtn.type = 'button';
    labelBtn.className = 'btn secondary small';
    labelBtn.textContent = '🏷️';
    labelBtn.title = 'Labels wijzigen';
    row.appendChild(labelBtn);

    if (todo.taskId) {
      const badge = document.createElement('span');
      badge.className = 'todo-badge';
      badge.textContent = 'Op tijdlijn';
      row.appendChild(badge);
    } else {
      const planBtn = document.createElement('button');
      planBtn.type = 'button';
      planBtn.className = 'btn secondary small';
      planBtn.textContent = 'Inplannen →';
      planBtn.addEventListener('click', () => {
        window.location.href = `/planner?todo=${encodeURIComponent(todo.id)}`;
      });
      row.appendChild(planBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn secondary small danger';
    delBtn.textContent = 'Verwijderen';
    delBtn.addEventListener('click', async () => {
      if (!confirm(`"${todo.tekst}" verwijderen?`)) return;
      try {
        await api(`/api/todos/${todo.id}`, { method: 'DELETE' });
        todos = todos.filter(t => t.id !== todo.id);
        render();
        showToast('To-do verwijderd');
      } catch (e) { showToast(e.message); }
    });
    row.appendChild(delBtn);

    const wrapper = document.createElement('div');
    wrapper.className = 'todo-item-wrapper';
    wrapper.appendChild(row);

    const editPanel = document.createElement('div');
    editPanel.className = 'person-checklist todo-label-edit';
    editPanel.hidden = true;
    buildLabelChecklist(editPanel, todo.labels || []);
    editPanel.querySelectorAll('input').forEach(cb => {
      cb.addEventListener('change', async () => {
        try {
          const updated = await api(`/api/todos/${todo.id}`, {
            method: 'PUT',
            body: JSON.stringify({ labels: selectedLabelIds(editPanel) })
          });
          Object.assign(todo, updated);
          render();
        } catch (e) { showToast(e.message); }
      });
    });
    labelBtn.addEventListener('click', () => { editPanel.hidden = !editPanel.hidden; });
    wrapper.appendChild(editPanel);

    return wrapper;
  }

  document.getElementById('todo-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('todo-tekst');
    const tekst = input.value.trim();
    if (!tekst) return;
    try {
      const todo = await api('/api/todos', {
        method: 'POST',
        body: JSON.stringify({ tekst, labels: selectedLabelIds(labelChecklistEl) })
      });
      todos.push(todo);
      input.value = '';
      buildLabelChecklist(labelChecklistEl, []);
      render();
      showToast('To-do toegevoegd');
    } catch (err) {
      showToast(err.message);
    }
  });

  init().catch(err => showToast(err.message));
})();
