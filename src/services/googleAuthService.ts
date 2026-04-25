
const CLIENT_ID = "912695812878-f8lj6i7jbd37r7cud7lbnpo1qapgf47j.apps.googleusercontent.com";
const API_KEY = "AIzaSyCkI1jqz_e2e919ra7zmBNrZkKBtLH_Nfk";

const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';

interface TokenInfo {
  access_token: string;
  expires_at: number;
}

let tokenClient: any = null;
let initPromise: Promise<void> | null = null;
let isAuthClientReady = false;

export const AuthService = {
  initialize: (force = false) => {
    if (initPromise && !force) return initPromise;

    if (force) {
      tokenClient = null;
      initPromise = null;
      isAuthClientReady = false;
    }

    initPromise = new Promise<void>((resolve) => {
      if (typeof window === 'undefined') return resolve();

      const performInit = () => {
        if ((window as any).google?.accounts?.oauth2) {
          try {
            tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
              client_id: CLIENT_ID,
              scope: SCOPES,
              callback: (response: any) => {
                if (response.error) {
                  console.error('Google Auth Error:', response.error);
                  if (response.error === 'popup_closed_by_user') {
                    (window as any).dispatchEvent(new CustomEvent('google-auth-error', { detail: 'Sign-in cancelled by user.' }));
                  } else {
                    (window as any).dispatchEvent(new CustomEvent('google-auth-error', { detail: `Auth failed: ${response.error}` }));
                  }
                  return;
                }
                const expiresAt = Date.now() + (response.expires_in * 1000);
                const info: TokenInfo = {
                  access_token: response.access_token,
                  expires_at: expiresAt
                };
                localStorage.setItem('google_drive_token', JSON.stringify(info));
                (window as any).dispatchEvent(new CustomEvent('google-auth-success', { detail: info }));
              },
            });
            isAuthClientReady = true;
            console.log('Google Token Client successfully initialized.');
          } catch (error) {
            console.error('Failed to initialize Google Token Client:', error);
            isAuthClientReady = false;
          }
          resolve();
          return true;
        }
        return false;
      };

      if (performInit()) return;
      
      const checkGSI = setInterval(() => {
        if (performInit()) {
          clearInterval(checkGSI);
        }
      }, 100);

      // Timeout after 15 seconds
      setTimeout(() => {
        clearInterval(checkGSI);
        resolve();
      }, 15000);
    });

    return initPromise;
  },

  getToken: (): string | null => {
    const stored = localStorage.getItem('google_drive_token');
    if (!stored) return null;
    try {
      const info: TokenInfo = JSON.parse(stored);
      // Buffer of 5 minutes before expiration
      if (Date.now() > info.expires_at - 300000) {
        localStorage.removeItem('google_drive_token');
        return null;
      }
      return info.access_token;
    } catch (e) {
      localStorage.removeItem('google_drive_token');
      return null;
    }
  },

  getApiKey: () => API_KEY,

  login: async (silent = false) => {
    if (initPromise) await initPromise;
    
    // Explicitly check for GSI existence
    if (!(window as any).google?.accounts?.oauth2) {
      await AuthService.initialize(true);
    }

    if (!tokenClient) {
      // Re-try initialization once
      await AuthService.initialize(true);
    }

    if (!tokenClient) {
      if (!silent) {
        console.error('Auth client not initialized.');
        (window as any).dispatchEvent(new CustomEvent('google-auth-error', { detail: 'Google services failed to load. Please check your connection or refresh.' }));
      }
      return;
    }
    
    try {
      tokenClient.requestAccessToken({ prompt: silent ? 'none' : '' });
    } catch (error: any) {
      console.error('Error requesting access token:', error);
      if (!silent) {
        (window as any).dispatchEvent(new CustomEvent('google-auth-error', { detail: 'Failed to request permissions. Please try again.' }));
      }
    }
  },

  isReady: (): boolean => {
    return isAuthClientReady && tokenClient !== null;
  },

  logout: () => {
    const token = AuthService.getToken();
    if (token) {
      (window as any).google?.accounts?.oauth2.revoke(token, () => {
        localStorage.removeItem('google_drive_token');
        (window as any).dispatchEvent(new Event('google-auth-logout'));
      });
    } else {
      localStorage.removeItem('google_drive_token');
      (window as any).dispatchEvent(new Event('google-auth-logout'));
    }
  },

  isAuthenticated: (): boolean => {
    return AuthService.getToken() !== null;
  }
};

// Global callback for index.html script tag
if (typeof window !== 'undefined') {
  (window as any).onGsiInit = () => {
    console.log('Google GSI library loaded via onload handler.');
    AuthService.initialize(true);
  };
  
  // If it already loaded before this code run
  if ((window as any).googleLibraryLoaded) {
    (window as any).onGsiInit();
  }
}
