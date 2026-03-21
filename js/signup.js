const API = 'https://uwi-comp3435-project.onrender.com';
const form       = document.getElementById('signup-form');
const errorMsg   = document.getElementById('errorMsg');
const successMsg = document.getElementById('successMsg');
const goToLogin  = document.getElementById('goToLogin');

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.add('visible');
}

// Password rules
const passwordRules = [
  { regex: /.{8,}/,                   message: 'At least 8 characters'          },
  { regex: /[A-Z]/,                   message: 'At least one uppercase letter'  },
  { regex: /[a-z]/,                   message: 'At least one lowercase letter'  },
  { regex: /[0-9]/,                   message: 'At least one number'            },
  { regex: /[!@#$%^&*(),.?":{}|<>]/, message: 'At least one special character' },
];

function validatePassword(password) {
  return passwordRules
    .filter(rule => !rule.regex.test(password))
    .map(rule => rule.message);
}


form.addEventListener('submit', async function (e) {
  e.preventDefault();
  errorMsg.classList.remove('visible');

  const fullname       = document.getElementById('fullName').value.trim();
  const email          = document.getElementById('email').value.trim();
  const password       = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const role           = document.getElementById('role').value;

  if (!fullname || !email || !password || !confirmPassword || !role) {
    showError('Please fill in all fields.');
    return;
  }

  const failures = validatePassword(password);
  if (failures.length > 0) {
    showError('Password must contain:\n• ' + failures.join('\n• '));
    return;
  }

  if (password !== confirmPassword) {
    showError('Passwords do not match.');
    return;
  }

  try {
    const res  = await fetch(API + '/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fullname, email, password, role })
    });

    const data = await res.json();

    if (!data.success) {
      showError(data.message || 'Registration failed. Please try again.');
      return;
    }

    form.style.display = 'none';
    successMsg.textContent = 'Account created successfully! You can now sign in.';
    successMsg.classList.add('visible');
    goToLogin.style.display = 'block';

  } catch (err) {
    showError('Could not connect to the server. Please try again.');
  }
});
