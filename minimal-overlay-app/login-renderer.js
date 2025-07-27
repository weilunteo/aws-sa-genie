// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const showSignupLink = document.getElementById('show-signup');
  const showLoginLink = document.getElementById('show-login');

  // Login form elements
  const loginEmail = document.getElementById('login-email');
  const loginPassword = document.getElementById('login-password');
  const loginButton = document.getElementById('login-button');
  const loginError = document.getElementById('login-error');

  // Signup form elements
  const signupUsername = document.getElementById('signup-username');
  const signupEmail = document.getElementById('signup-email');
  const signupPassword = document.getElementById('signup-password');
  const signupButton = document.getElementById('signup-button');
  const signupError = document.getElementById('signup-error');

  // Confirmation form elements
  const confirmForm = document.getElementById('confirm-form');
  const confirmUsername = document.getElementById('confirm-username');
  const confirmCode = document.getElementById('confirm-code');
  const confirmButton = document.getElementById('confirm-button');
  const confirmError = document.getElementById('confirm-error');
  const showLoginFromConfirm = document.getElementById('show-login-from-confirm');

  // Toggle between forms
  showSignupLink.addEventListener('click', () => {
    loginForm.classList.add('hidden');
    confirmForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
  });

  showLoginLink.addEventListener('click', () => {
    signupForm.classList.add('hidden');
    confirmForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
  });
  
  showLoginFromConfirm.addEventListener('click', () => {
    confirmForm.classList.add('hidden');
    signupForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
  });

  // Handle login
  loginButton.addEventListener('click', async () => {
    const email = loginEmail.value.trim();
    const password = loginPassword.value;
    
    if (!email || !password) {
      loginError.textContent = 'Please enter both email and password';
      return;
    }
    
    loginError.textContent = '';
    loginButton.disabled = true;
    loginButton.textContent = 'Logging in...';
    
    try {
      window.electronAPI.send('auth-login', { email, password });
    } catch (error) {
      loginError.textContent = error.message || 'Login failed. Please try again.';
      loginButton.disabled = false;
      loginButton.textContent = 'Login';
    }
  });

  // Handle signup
  signupButton.addEventListener('click', async () => {
    const username = document.getElementById('signup-username').value.trim();
    const email = signupEmail.value.trim();
    const password = signupPassword.value;
    
    if (!username || !email || !password) {
      signupError.textContent = 'Please fill in all fields';
      return;
    }
    
    if (password.length < 8) {
      signupError.textContent = 'Password must be at least 8 characters';
      return;
    }
    
    signupError.textContent = '';
    signupButton.disabled = true;
    signupButton.textContent = 'Signing up...';
    
    try {
      window.electronAPI.send('auth-signup', { username, email, password });
    } catch (error) {
      signupError.textContent = error.message || 'Signup failed. Please try again.';
      signupButton.disabled = false;
      signupButton.textContent = 'Sign Up';
    }
  });
  
  // Handle confirmation code submission
  confirmButton.addEventListener('click', async () => {
    const username = confirmUsername.value.trim();
    const code = confirmCode.value.trim();
    
    if (!username || !code) {
      confirmError.textContent = 'Please enter both username and confirmation code';
      return;
    }
    
    confirmError.textContent = '';
    confirmButton.disabled = true;
    confirmButton.textContent = 'Confirming...';
    
    try {
      window.electronAPI.send('auth-confirm', { username, code });
    } catch (error) {
      confirmError.textContent = error.message || 'Confirmation failed. Please try again.';
      confirmButton.disabled = false;
      confirmButton.textContent = 'Confirm';
    }
  });

  // Listen for auth responses from main process
  window.electronAPI.on('auth-response', (response) => {
    if (response.success) {
      // Authentication successful, main process will load the main app
      if (response.form === 'login') {
        loginButton.textContent = 'Success!';
      } else if (response.form === 'signup') {
        signupButton.textContent = 'Success!';
        // Show confirmation form after successful signup
        signupForm.classList.add('hidden');
        confirmForm.classList.remove('hidden');
        // Pre-fill username if available
        if (signupUsername.value) {
          confirmUsername.value = signupUsername.value;
        }
      } else if (response.form === 'confirm') {
        confirmButton.textContent = 'Success!';
        // Redirect to login after successful confirmation
        setTimeout(() => {
          confirmForm.classList.add('hidden');
          loginForm.classList.remove('hidden');
        }, 1500);
      }
    } else {
      // Authentication failed, show error message
      if (response.form === 'login') {
        loginError.textContent = response.message || 'Login failed';
        loginButton.disabled = false;
        loginButton.textContent = 'Login';
      } else if (response.form === 'signup') {
        signupError.textContent = response.message || 'Signup failed';
        signupButton.disabled = false;
        signupButton.textContent = 'Sign Up';
      } else if (response.form === 'confirm') {
        confirmError.textContent = response.message || 'Confirmation failed';
        confirmButton.disabled = false;
        confirmButton.textContent = 'Confirm';
      }
    }
  });

  // Check if we're already authenticated on page load
  window.electronAPI.send('auth-check');

  console.log("Login renderer script loaded.");
});