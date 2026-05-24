// ─── REQUIRED SETUP ──────────────────────────────────────────────────────────
//
// Step 1 — Google Cloud Console (console.cloud.google.com):
//   • Create a project (or reuse one)
//   • Enable "Google Sheets API"
//   • Go to APIs & Services → Credentials → Create OAuth 2.0 Client ID
//   • Type: Web application
//   • Authorized JavaScript origins: add your hosting URL
//     e.g. https://your-username.github.io  or  https://your-site.netlify.app
//     Also add http://localhost:8080 for local testing
//   • Copy the Client ID (looks like: 123456-abc.apps.googleusercontent.com)
//
// Step 2 — Your spreadsheet ID is in the Google Sheets URL:
//   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
//
// ─────────────────────────────────────────────────────────────────────────────

export const OAUTH_CLIENT_ID = '172684065497-8s7bic0oj764ebp61qmt8bufgkdv7mkt.apps.googleusercontent.com';
export const SPREADSHEET_ID  = '1G6t5rB3OXv3bOk7dTHM4mcUUxZC6rmS7tCqbk7o3LaQ';

// Full spreadsheets scope — needed for Add Expense and editing transactions
export const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

// Sheet tab names (must match exactly, including capitalisation)
export const SHEETS = {
  transactions:  'Transactions',
  budgets:       'Budgets',
  salaryPeriods: 'Salary Periods',
};
