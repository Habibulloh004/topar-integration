import axios from 'axios';
import { config as dotenvConfig } from 'dotenv';

// Ensure env vars from .env are available when this module loads
dotenvConfig();

const AUTH_BASE_URL = (process.env.BILLZ_AUTH_URL || 'https://api-admin.billz.ai/v1/auth').replace(/\/$/, '');
const BILLZ_SECRET = process.env.BILLZ_API_SECRET_KEY || '9f6ad7159637e4f65dc9a8ad6b619545c41eadfeaaba32fea554b30f8c842b0983982fc680f59cd58536f954d3c137998deea90385d8987088a58cb52f13dbac5c34f9d5ca1f4d2085b774a6ab7f1f5cc9e4f7b65cd061486c66507a4644219d5825fb8f622fba0053233666611afb9c6a298ea196e4c03c';

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
  const secretToken = BILLZ_SECRET || "9f6ad7159637e4f65dc9a8ad6b619545c41eadfeaaba32fea554b30f8c842b0983982fc680f59cd58536f954d3c137998deea90385d8987088a58cb52f13dbac5c34f9d5ca1f4d2085b774a6ab7f1f5cc9e4f7b65cd061486c66507a4644219d5825fb8f622fba0053233666611afb9c6a298ea196e4c03c";

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


