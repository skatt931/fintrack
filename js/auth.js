import { OAUTH_CLIENT_ID, SCOPES } from './config.js';

const TOKEN_KEY  = 'finance_token';
const EXPIRY_KEY = 'finance_token_exp';

let tokenClient = null;

function getOrCreateClient() {
  if (tokenClient) return tokenClient;
  if (!window.google?.accounts?.oauth2) throw new Error('Google Identity Services not loaded yet.');
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: OAUTH_CLIENT_ID,
    scope: SCOPES,
    callback: () => {},  // overridden per request
  });
  return tokenClient;
}

export function getToken() {
  const token  = sessionStorage.getItem(TOKEN_KEY);
  const expiry = parseInt(sessionStorage.getItem(EXPIRY_KEY) || '0');
  return token && Date.now() < expiry ? token : null;
}

function saveToken(token, expiresIn) {
  sessionStorage.setItem(TOKEN_KEY,  token);
  // Subtract 60 s so we refresh slightly before actual expiry
  sessionStorage.setItem(EXPIRY_KEY, String(Date.now() + (expiresIn - 60) * 1000));
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(EXPIRY_KEY);
}

export function requestToken(prompt = 'select_account') {
  return new Promise((resolve, reject) => {
    const client = getOrCreateClient();
    client.callback = (resp) => {
      if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
      saveToken(resp.access_token, parseInt(resp.expires_in));
      resolve(resp.access_token);
    };
    client.requestAccessToken({ prompt });
  });
}
