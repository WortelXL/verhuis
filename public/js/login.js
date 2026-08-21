document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('error-msg');
  errorEl.textContent = '';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      window.location.href = '/planner';
    } else {
      const data = await res.json().catch(() => ({}));
      errorEl.textContent = data.error || 'Inloggen mislukt';
    }
  } catch (err) {
    errorEl.textContent = 'Kan geen verbinding maken met de server';
  }
});
