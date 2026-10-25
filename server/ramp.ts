/**
 * Zisipay Ramp Backend
 * Proxies Yellow Card API calls with HMAC-SHA256 auth.
 * Set in .env:
 *   YC_API_KEY      = your Yellow Card API key
 *   YC_SECRET_KEY   = your Yellow Card secret key
 *   YC_SANDBOX      = 'true' (default) | 'false' for production
 *   VITE_ZISIPAY_VAULT = deployed vault address (read via import.meta.env on frontend)
 *
 * Endpoints:
 *   GET  /api/ramp/health
 *   GET  /api/ramp/rates
 *   GET  /api/ramp/channels
 *   GET  /api/ramp/banks
 *   POST /api/ramp/verify-account
 *   POST /api/ramp/send         (USDC → NGN offramp initiation)
 *   GET  /api/ramp/send/:id     (poll status)
 *   POST /api/ramp/receive      (NGN → USDC onramp initiation)
 *   GET  /api/ramp/receive/:id  (poll status)
 */

import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
app.use(cors());
app.use(express.json());

const YC_BASE = process.env.YC_SANDBOX === 'false'
  ? 'https://api.yellowcard.io/business'
  : 'https://sandbox.api.yellowcard.io/business';

const YC_API_KEY    = process.env.YC_API_KEY    ?? '';
const YC_SECRET_KEY = process.env.YC_SECRET_KEY ?? '';

// Platform wallet for USDC collection (offramp): users send USDC here, then YC pays NGN out
const PLATFORM_WALLET = process.env.VITE_ZISIPAY_VAULT ?? '';

// ── Yellow Card HMAC-SHA256 auth ──────────────────────────────────────────
function ycHeaders(method: string, path: string, body: string | null) {
  const timestamp = Date.now().toString();
  const bodyHash  = crypto
    .createHash('sha256')
    .update(body ?? '')
    .digest('hex');
  const message   = `${timestamp}${method.toUpperCase()}${path}${bodyHash}`;
  const signature = crypto
    .createHmac('sha256', YC_SECRET_KEY)
    .update(message)
    .digest('hex');
  return {
    Authorization:   `YcHmacV1 ${YC_API_KEY}:${signature}`,
    'X-YC-Timestamp': timestamp,
    'Content-Type':  'application/json',
  };
}

// ── Generic YC fetch ──────────────────────────────────────────────────────
async function ycFetch(method: string, path: string, body?: object) {
  const bodyStr = body ? JSON.stringify(body) : null;
  const headers = ycHeaders(method, path, bodyStr);
  const res = await fetch(`${YC_BASE}${path}`, {
    method,
    headers,
    ...(bodyStr ? { body: bodyStr } : {}),
  });
  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

// Estimated NGN/USDC rate used when no API key is configured
const MOCK_RATE = 1620;
const MOCK_BUY_RATE  = 1600;  // NGN paid per USDC (onramp — user gets slightly less)
const MOCK_SELL_RATE = 1640;  // NGN received per USDC (offramp — user receives slightly more)

// NGN p2p channel IDs (from YC docs)
const YC_NGN_DISBURSEMENT_CHANNEL = 'e8f4989-3bf6-41ca-9621-ffe2bc127569';
const YC_NGN_COLLECTION_CHANNEL   = 'af944f0c-ba70-47c7-86dc-1bad5a6ab4e4';

// ── Health ────────────────────────────────────────────────────────────────
app.get('/api/ramp/health', (_req, res) => {
  res.json({
    ok: true,
    hasCredentials: !!(YC_API_KEY && YC_SECRET_KEY),
    sandbox: process.env.YC_SANDBOX !== 'false',
    base: YC_BASE,
    platformWallet: PLATFORM_WALLET || '(not set)',
  });
});

// ── Rates ─────────────────────────────────────────────────────────────────
app.get('/api/ramp/rates', async (req, res) => {
  const currency = (req.query.currency as string | undefined) ?? 'NGN';
  if (!YC_API_KEY) {
    return res.json({ buy: MOCK_BUY_RATE, sell: MOCK_SELL_RATE, mid: MOCK_RATE, currency, source: 'estimate' });
  }
  try {
    const { status, data } = await ycFetch('GET', '/rates');
    return res.status(status).json(data);
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }
});

// ── Channels ──────────────────────────────────────────────────────────────
app.get('/api/ramp/channels', async (req, res) => {
  const country = (req.query.country as string | undefined) ?? 'NG';
  if (!YC_API_KEY) {
    return res.json({
      channels: [
        { id: YC_NGN_COLLECTION_CHANNEL,   name: 'Bank Transfer (NGN)', country, currency: 'NGN', channelType: 'p2p', rampType: 'collection',   status: 'active', min: 500, max: 5000000, settlementTime: 'Instant' },
        { id: YC_NGN_DISBURSEMENT_CHANNEL, name: 'Bank Transfer (NGN)', country, currency: 'NGN', channelType: 'p2p', rampType: 'disbursement', status: 'active', min: 500, max: 5000000, settlementTime: 'Instant' },
      ],
      source: 'mock',
    });
  }
  try {
    const { status, data } = await ycFetch('GET', `/channels?country=${country}`);
    return res.status(status).json(data);
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }
});

// ── Nigerian Banks ─────────────────────────────────────────────────────────
app.get('/api/ramp/banks', async (_req, res) => {
  if (!YC_API_KEY) {
    return res.json({
      banks: [
        { code: '044', name: 'Access Bank' },
        { code: '023', name: 'Citibank Nigeria' },
        { code: '050', name: 'Ecobank Nigeria' },
        { code: '011', name: 'First Bank of Nigeria' },
        { code: '214', name: 'First City Monument Bank (FCMB)' },
        { code: '070', name: 'Fidelity Bank' },
        { code: '058', name: 'GTBank (Guaranty Trust)' },
        { code: '030', name: 'Heritage Bank' },
        { code: '082', name: 'Keystone Bank' },
        { code: '526', name: 'Moniepoint MFB' },
        { code: '076', name: 'Polaris Bank' },
        { code: '221', name: 'Stanbic IBTC Bank' },
        { code: '232', name: 'Sterling Bank' },
        { code: '032', name: 'Union Bank of Nigeria' },
        { code: '033', name: 'United Bank for Africa (UBA)' },
        { code: '215', name: 'Unity Bank' },
        { code: '035', name: 'Wema Bank' },
        { code: '057', name: 'Zenith Bank' },
        { code: '090267', name: 'Kuda MFB' },
        { code: '090405', name: 'Opay' },
        { code: '090325', name: 'PalmPay' },
      ],
      source: 'mock',
    });
  }
  try {
    const { status, data } = await ycFetch('GET', `/networks?channelId=${YC_NGN_DISBURSEMENT_CHANNEL}`);
    return res.status(status).json(data);
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }
});

// ── Verify Bank Account ────────────────────────────────────────────────────
app.post('/api/ramp/verify-account', async (req, res) => {
  const { accountNumber, bankCode } = req.body as { accountNumber: string; bankCode: string };
  if (!YC_API_KEY) {
    // Sandbox: echo back a mock account name
    return res.json({ accountName: 'DEMO ACCOUNT HOLDER', accountNumber, bankCode, source: 'mock' });
  }
  try {
    const { status, data } = await ycFetch('POST', '/lookup/bank-account', { accountNumber, bankCode });
    return res.status(status).json(data);
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }
});

// ── Create Disbursement  (USDC → NGN offramp) ─────────────────────────────
// User transfers USDC to PLATFORM_WALLET; backend then tells YC to disburse NGN to bank.
app.post('/api/ramp/send', async (req, res) => {
  const {
    usdcAmount, bankCode, accountNumber, accountName, sequenceId,
  } = req.body as {
    usdcAmount: number;
    bankCode: string;
    accountNumber: string;
    accountName: string;
    sequenceId: string;
  };

  if (!YC_API_KEY) {
    return res.json({
      id: `mock-send-${Date.now().toString(36)}`,
      status: 'pending',
      sequenceId,
      usdcAmount,
      ngnAmount: Math.round(usdcAmount * MOCK_SELL_RATE),
      rate: MOCK_SELL_RATE,
      bankCode,
      accountNumber,
      accountName,
      createdAt: new Date().toISOString(),
      source: 'mock',
      platformWallet: PLATFORM_WALLET,
    });
  }

  try {
    const { status, data } = await ycFetch('POST', '/sends', {
      channelId: YC_NGN_DISBURSEMENT_CHANNEL,
      sequenceId,
      amount: usdcAmount,
      reason: 'Zisipay salary disbursement',
      destination: { accountNumber, accountName, networkId: bankCode, country: 'NG' },
      customerData: { name: accountName, country: 'NG' },
    });
    return res.status(status).json(data);
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }
});

// ── Poll Disbursement ──────────────────────────────────────────────────────
app.get('/api/ramp/send/:id', async (req, res) => {
  const { id } = req.params as { id: string };
  if (id.startsWith('mock-send-')) {
    const ts  = parseInt(id.replace('mock-send-', ''), 36);
    const age = Date.now() - ts;
    const status = age < 5000 ? 'pending' : age < 10000 ? 'processing' : 'completed';
    return res.json({ id, status, source: 'mock' });
  }
  if (!YC_API_KEY) return res.status(404).json({ error: 'No credentials' });
  try {
    const { status, data } = await ycFetch('GET', `/sends/${id}`);
    return res.status(status).json(data);
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }
});

// ── Create Collection (NGN → USDC onramp) ────────────────────────────────
app.post('/api/ramp/receive', async (req, res) => {
  const { ngnAmount, walletAddress, sequenceId } = req.body as {
    ngnAmount: number;
    walletAddress: string;
    sequenceId: string;
  };
  const usdcAmount = parseFloat((ngnAmount / MOCK_RATE).toFixed(2));

  if (!YC_API_KEY) {
    return res.json({
      id: `mock-receive-${Date.now().toString(36)}`,
      status: 'pending',
      sequenceId,
      ngnAmount,
      usdcAmount,
      rate: MOCK_RATE,
      walletAddress,
      createdAt: new Date().toISOString(),
      source: 'mock',
      paymentInstructions: {
        bankName:      'Yellow Card Payments (GTB)',
        accountName:   'YELLOW CARD FINANCIAL LTD',
        accountNumber: '0134567890',
        bankCode:      '058',
        amount:        ngnAmount,
        reference:     sequenceId.slice(0, 12).toUpperCase(),
        note:          `Transfer ₦${ngnAmount.toLocaleString()} to receive ${usdcAmount} USDC`,
      },
    });
  }

  try {
    const { status, data } = await ycFetch('POST', '/receives', {
      channelId: YC_NGN_COLLECTION_CHANNEL,
      sequenceId,
      amount: ngnAmount,
      reason: 'Zisipay salary deposit',
      destination: { walletAddress, cryptoCurrency: 'USDC', cryptoNetwork: 'ERC20' },
      customerData: { country: 'NG' },
    });
    return res.status(status).json(data);
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }
});

// ── Poll Collection ────────────────────────────────────────────────────────
app.get('/api/ramp/receive/:id', async (req, res) => {
  const { id } = req.params as { id: string };
  if (id.startsWith('mock-receive-')) {
    const ts  = parseInt(id.replace('mock-receive-', ''), 36);
    const age = Date.now() - ts;
    const status = age < 6000 ? 'pending' : age < 14000 ? 'processing' : 'completed';
    return res.json({ id, status, source: 'mock' });
  }
  if (!YC_API_KEY) return res.status(404).json({ error: 'No credentials' });
  try {
    const { status, data } = await ycFetch('GET', `/receives/${id}`);
    return res.status(status).json(data);
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }
});

const PORT = process.env.RAMP_PORT ?? 3001;
app.listen(PORT, () => console.log(`[ramp] server on :${PORT}`));
