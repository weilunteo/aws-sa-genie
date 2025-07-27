import { CognitoUserPool, CognitoUser, AuthenticationDetails, CognitoUserSession } from 'amazon-cognito-identity-js';

// Cognito configuration
const poolData = {
  UserPoolId: process.env.COGNITO_USER_POOL_ID || '',
  ClientId: process.env.COGNITO_CLIENT_ID || ''
};

// Create user pool instance
const userPool = new CognitoUserPool(poolData);

// Auth class to handle Cognito operations
export class Auth {
  // Get current authenticated user
  static getCurrentUser(): CognitoUser | null {
    return userPool.getCurrentUser();
  }

  // Get current session (includes JWT tokens)
  static getSession(): Promise<CognitoUserSession> {
    const user = this.getCurrentUser();
    
    return new Promise((resolve, reject) => {
      if (!user) {
        reject(new Error('No user found'));
        return;
      }
      
      user.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err) {
          reject(err);
          return;
        }
        if (!session) {
          reject(new Error('No session found'));
          return;
        }
        resolve(session);
      });
    });
  }

  // Get JWT token
  static async getJwtToken(): Promise<string> {
    try {
      const session = await this.getSession();
      return session.getIdToken().getJwtToken();
    } catch (error) {
      console.error('Error getting JWT token:', error);
      throw error;
    }
  }

  // Sign in user
  static signIn(username: string, password: string): Promise<CognitoUserSession> {
    const authenticationDetails = new AuthenticationDetails({
      Username: username,
      Password: password
    });

    const cognitoUser = new CognitoUser({
      Username: username,
      Pool: userPool
    });

    return new Promise((resolve, reject) => {
      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (session) => {
          resolve(session);
        },
        onFailure: (err) => {
          reject(err);
        }
      });
    });
  }

  // Sign up user
  static signUp(username: string, password: string, email: string): Promise<any> {
    const attributeList = [
      {
        Name: 'email',
        Value: email
      }
    ];

    return new Promise((resolve, reject) => {
      userPool.signUp(username, password, attributeList, [], (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      });
    });
  }

  // Sign out user
  static signOut(): void {
    const user = this.getCurrentUser();
    if (user) {
      user.signOut();
    }
  }

  // Check if user is authenticated
  static async isAuthenticated(): Promise<boolean> {
    try {
      await this.getSession();
      return true;
    } catch (error) {
      return false;
    }
  }
}