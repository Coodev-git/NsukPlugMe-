'use strict';

const https  = require('https');
const logger = require('../utils/logger');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const PRICE_KOBO      = parseInt(process.env.UNLOCK_PRICE_KOBO || '9900', 10); // ₦99

/**
 * Initialise a Paystack transaction
 * @returns { authorizationUrl, reference, accessCode }
 */
const initializePayment = ({ email, amount = PRICE_KOBO, metadata = {} }) => {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ email, amount, metadata });

    const options = {
      hostname: 'api.paystack.co',
      port:     443,
      path:     '/transaction/initialize',
      method:   'POST',
      headers:  {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.status) return reject(new Error(parsed.message || 'Paystack error'));
          resolve(parsed.data);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
};

/**
 * Verify a Paystack transaction by reference
 * @returns { status, amount, email, metadata, gatewayResponse }
 */
const verifyPayment = (reference) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.paystack.co',
      port:     443,
      path:     `/transaction/verify/${encodeURIComponent(reference)}`,
      method:   'GET',
      headers:  { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.status) return reject(new Error(parsed.message || 'Paystack verify error'));
          const tx = parsed.data;
          resolve({
            status:          tx.status,          // 'success' | 'failed' | 'abandoned'
            amount:          tx.amount,
            email:           tx.customer?.email,
            metadata:        tx.metadata,
            gatewayResponse: tx.gateway_response,
          });
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
};

/**
 * Simulate payment for development (no Paystack key needed)
 */
const simulatePayment = async (reference) => {
  logger.warn(`[DEV] Simulating payment success for ref: ${reference}`);
  return {
    status:          'success',
    amount:          PRICE_KOBO,
    email:           'dev@nsuk.edu.ng',
    metadata:        { simulated: true },
    gatewayResponse: 'Simulated success',
  };
};

const verify = async (reference) => {
  if (!PAYSTACK_SECRET || PAYSTACK_SECRET.startsWith('sk_test_XXXXX')) {
    return simulatePayment(reference);
  }
  return verifyPayment(reference);
};

const initialize = async (params) => {
  if (!PAYSTACK_SECRET || PAYSTACK_SECRET.startsWith('sk_test_XXXXX')) {
    const reference = `plugme_dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return {
      authorization_url: `https://checkout.paystack.com/dev_test`,
      reference,
      access_code:       'dev_access',
    };
  }
  return initializePayment(params);
};

module.exports = { initialize, verify, PRICE_KOBO };
