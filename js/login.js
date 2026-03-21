const API = 'https://uwi-comp3435-project.onrender.com';
const form = document.getElementById('login-form');
const errorMsg = document.getElementById('errorMsg');

form.addEventListener('submit', async function (e) {
  e.preventDefault();
  errorMsg.classList.remove('visible');
  errorMsg.innerHTML = '';

  const email    = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !password) {
    errorMsg.textContent = 'Please fill in all fields.';
    errorMsg.classList.add('visible');
    return;
  }

  try {
    const res  = await fetch(API + '/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!data.success) {
      errorMsg.textContent = data.message || 'Login failed. Please try again.';
      errorMsg.classList.add('visible');
      return;
    }

    sessionStorage.setItem('userFullName', data.fullName);
    sessionStorage.setItem('userRole', data.role);

    if (data.role === 'maintenance') {
      window.location.href = 'maintenance.html';
    } else {
      window.location.href = 'user.html';
    }

  } catch (err) {
    errorMsg.textContent = 'Could not connect to the server. Please try again.';
    errorMsg.classList.add('visible');
  }
});
