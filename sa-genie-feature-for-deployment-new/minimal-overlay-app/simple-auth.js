// Simple authentication module for minimal-overlay-app
// This is a simplified version that doesn't require Cognito

class SimpleAuth {
  constructor() {
    this.authenticated = false;
    this.token = null;
    this.email = null;
    // Add test users including the user's email
    this.users = {
      'user@example.com': 'password123',
      'test@example.com': 'test123',
      'admin@example.com': 'admin123',
      'fadylah@amazon.my': 'password' // Added user's email
    };
  }

  // Authenticate with email and password
  async login(email, password) {
    console.log(`[SimpleAuth] Login attempt with email: ${email}`);
    
    // Check if user exists and password matches
    if (this.users[email] && this.users[email] === password) {
      this.authenticated = true;
      this.email = email;
      // Generate a simple token
      this.token = `simulated-jwt-${Date.now()}`;
      console.log(`[SimpleAuth] Login successful for ${email}`);
      return { success: true, token: this.token };
    }
    
    console.log(`[SimpleAuth] Login failed - invalid credentials for ${email}`);
    throw new Error('Invalid email or password');
  }

  // Check if authenticated
  isAuthenticated() {
    return this.authenticated;
  }

  // Get token
  getToken() {
    return this.token;
  }

  // Get email
  getEmail() {
    return this.email;
  }

  // Logout
  logout() {
    this.authenticated = false;
    this.token = null;
    this.email = null;
    console.log(`[SimpleAuth] User logged out`);
  }
}

// Export singleton instance
module.exports = new SimpleAuth();