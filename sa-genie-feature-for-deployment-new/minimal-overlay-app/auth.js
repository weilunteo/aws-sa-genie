"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Auth = void 0;
const amazon_cognito_identity_js_1 = require("amazon-cognito-identity-js");
// Cognito configuration
const poolData = {
    UserPoolId: process.env.COGNITO_USER_POOL_ID || 'us-east-1_example',
    ClientId: process.env.COGNITO_CLIENT_ID || '1example23456789'
};
// Create user pool instance
const userPool = new amazon_cognito_identity_js_1.CognitoUserPool(poolData);
// Auth class to handle Cognito operations
class Auth {
    // Get current authenticated user
    static getCurrentUser() {
        return userPool.getCurrentUser();
    }
    // Confirm sign up with verification code
    static confirmSignUp(username, code) {
        const cognitoUser = new amazon_cognito_identity_js_1.CognitoUser({
            Username: username,
            Pool: userPool
        });
        return new Promise((resolve, reject) => {
            cognitoUser.confirmRegistration(code, true, (err, result) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(result);
            });
        });
    }
    // Get current session (includes JWT tokens)
    static getSession() {
        const user = this.getCurrentUser();
        return new Promise((resolve, reject) => {
            if (!user) {
                reject(new Error('No user found'));
                return;
            }
            user.getSession((err, session) => {
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
    static async getJwtToken() {
        try {
            const session = await this.getSession();
            return session.getIdToken().getJwtToken();
        }
        catch (error) {
            console.error('Error getting JWT token:', error);
            throw error;
        }
    }
    // Sign in user
    static signIn(username, password) {
        const authenticationDetails = new amazon_cognito_identity_js_1.AuthenticationDetails({
            Username: username,
            Password: password
        });
        const cognitoUser = new amazon_cognito_identity_js_1.CognitoUser({
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
    static signUp(username, password, email) {
        // Create proper CognitoUserAttribute objects
        const attributeList = [
            new amazon_cognito_identity_js_1.CognitoUserAttribute({
                Name: 'email',
                Value: email
            })
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
    static signOut() {
        const user = this.getCurrentUser();
        if (user) {
            user.signOut();
        }
    }
    // Check if user is authenticated
    static async isAuthenticated() {
        try {
            await this.getSession();
            return true;
        }
        catch (error) {
            return false;
        }
    }
}
exports.Auth = Auth;
//# sourceMappingURL=auth.js.map