import axios from 'axios';
import { config as dotenvConfig } from 'dotenv';

// Ensure env vars from .env are available when this module loads
dotenvConfig();

const AUTH_BASE_URL = (process.env.BILLZ_AUTH_URL || 'https://api-admin.billz.ai/v1/auth').replace(/\/$/, '');

/**
 * Perform Billz login using a secret token from env or argument.
 *
 * Env vars:
 * - BILLZ_API_SECRET_KEY: secret token value
 * - BILLZ_AUTH_URL: base URL for auth (defaults to v1/auth)
 *
 * @param {Object} [opts]
 * @param {string} [opts.secretToken] Optional override for the secret token
 * @returns {Promise<any>} Billz auth response body
 */
export async function login(opts = {}) {
  const secretToken = opts.secretToken || "cdf6836165a9c897fc944e4f2f90d134cc1e343760286fee40484878ba275eb4ee2d2c7429533edc6ec677d01ae851dc8b0b38a98662aca5bade24d8febf43e66d7656fd50333e2371254dde35c75400fc34ca10a50e7a790abf2f0d20aed29fe25c981ccac0f9c0c919dc278165f7f1ded6cd7c8b31658f";

  if (!secretToken) {
    throw new Error('Missing Billz secret token. Set BILLZ_API_SECRET_KEY or pass { secretToken }');
  }

  const url = `${AUTH_BASE_URL}/login`;

  try {
    const res = await axios.post(
      url,
      { secret_token: secretToken },
      {
        headers: { 'Content-Type': 'application/json' }      }
    );
    console.log("Billz login successful:", res.data);
    return res.data;
  } catch (err) {
    const status = err?.response?.status;
    const data = err?.response?.data;
    const detail = typeof data === 'string' ? data : JSON.stringify(data);
    const message = `Billz login failed${status ? ` (${status})` : ''}: ${detail || err.message}`;
    throw new Error(message);
  }
}


