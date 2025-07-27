const { CognitoIdentityServiceProvider } = require('aws-sdk');
const crypto = require('crypto');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Cognito configuration
const userPoolId = process.env.COGNITO_USER_POOL_ID;
const clientId = process.env.COGNITO_CLIENT_ID;
const clientSecret = process.env.COGNITO_CLIENT_SECRET;

console.log('Cognito Config:', {
  UserPoolId: userPoolId,
  ClientId: clientId,
  HasSecret: !!clientSecret
});

// Initialize Cognito client
const cognito = new CognitoIdentityServiceProvider({
  region: process.env.AWS_REGION || 'us-east-1'
});

// Calculate the SECRET_HASH
function calculateSecretHash(username) {
  const message = username + clientId;
  const hmac = crypto.createHmac('sha256', clientSecret);
  hmac.update(message);
  return hmac.digest('base64');
}

// Auth class to handle Cognito operations
class Auth {
  constructor() {
    this.token = null;
    this.refreshToken = null;
    this.username = null;
  }

  // Sign in user
  async signIn(username, password) {
    console.log(`Attempting to sign in user: ${username}`);
    
    try {
      const params = {
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: clientId,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
          SECRET_HASH: calculateSecretHash(username)
        }
      };
      
      const response = await cognito.initiateAuth(params).promise();
      console.log('Authentication successful');
      
      this.token = response.AuthenticationResult.IdToken;
      this.refreshToken = response.AuthenticationResult.RefreshToken;
      this.username = username;
      
      return {
        token: this.token,
        refreshToken: this.refreshToken,
        username: this.username
      };
    } catch (error) {
      console.error('Authentication failed:', error);
      throw error;
    }
  }

  // Sign up user
  async signUp(username, password, email) {
    console.log(`Attempting to sign up user: ${username} with email: ${email}`);
    
    try {
      const params = {
        ClientId: clientId,
        Username: username,
        Password: password,
        SecretHash: calculateSecretHash(username),
        UserAttributes: [
          {
            Name: 'email',
            Value: email
          }
        ]
      };
      
      const response = await cognito.signUp(params).promise();
      console.log('Signup successful');
      return response;
    } catch (error) {
      console.error('Signup failed:', error);
      throw error;
    }
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.token;
  }

  // Get JWT token
  getToken() {
    return this.token;
  }

  // Get username
  getUsername() {
    return this.username;
  }

  // Sign out user
  signOut() {
    this.token = null;
    this.refreshToken = null;
    this.username = null;
  }
}

// Export singleton instance
module.exports = new Auth();