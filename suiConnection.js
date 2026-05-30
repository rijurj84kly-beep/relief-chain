/**
 * ReliefChain Browser Connection Layer
 * Communicates directly with Tatum RPC and standard Sui Wallets in the browser.
 */

const RPC_URL = 'https://sui-testnet.gateway.tatum.io';
const API_KEY = 't-6a140233ac1249b94ca19bd2-0406e37327b248658be3ef78';

import { getWallets } from 'https://esm.sh/@mysten/wallet-standard@0.20.3';
import { Transaction } from 'https://esm.sh/@mysten/sui@2.17.0/transactions';

if (!window.registeredSuiWallets) {
  window.registeredSuiWallets = [];
}

try {
  const walletsApi = getWallets();
  
  // Get initial registered wallets
  window.registeredSuiWallets = walletsApi.get() || [];
  
  // Listen for newly registered wallets
  walletsApi.on('register', (...newWallets) => {
    newWallets.forEach(wallet => {
      if (wallet && wallet.name) {
        if (!window.registeredSuiWallets.find(w => w.name === wallet.name)) {
          window.registeredSuiWallets.push(wallet);
          window.dispatchEvent(new CustomEvent('reliefchain:wallet-registered', { detail: wallet }));
        }
      }
    });
  });
} catch (e) {
  console.error('Error initializing Mysten Wallet Standard API:', e);
}

/**
 * Sends a JSON-RPC request directly to the Tatum Sui Testnet endpoint.
 * 
 * @param {string} method - JSON-RPC method name
 * @param {Array} params - parameters array
 * @returns {Promise<any>} Response result field
 */
async function sendRpcRequest(method, params = []) {
  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (API_KEY) {
      headers['x-api-key'] = API_KEY;
    }

    const requestBody = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    });
    console.log(`[Sui RPC Request Body for ${method}]:`, requestBody);

    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers,
      body: requestBody,
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }

    return data.result;
  } catch (error) {
    console.error(`Sui RPC Request failed (${method}):`, error);
    throw error;
  }
}

/**
 * Fetches the total SUI balance for a given public address.
 * 
 * @param {string} address - public Sui address
 * @returns {Promise<number>} Balance formatted in SUI
 */
export async function getSuiBalance(address) {
  try {
    const result = await sendRpcRequest('suix_getBalance', [address, '0x2::sui::SUI']);
    const totalBalance = result?.totalBalance || '0';
    return Number(totalBalance) / 1_000_000_000;
  } catch (error) {
    console.warn('Failed to fetch real balance, returning 0 fallback.', error);
    return 0;
  }
}

/**
 * Fetches the latest checkpoint sequence number.
 * 
 * @returns {Promise<number>} Latest checkpoint sequence
 */
export async function getLatestCheckpoint() {
  try {
    const result = await sendRpcRequest('sui_getLatestCheckpointSequenceNumber', []);
    return Number(result);
  } catch (error) {
    console.warn('Failed to fetch checkpoint, returning fallback timestamp.', error);
    return Math.floor(Date.now() / 1000);
  }
}

/**
 * Discovers and returns standard-compliant browser Sui Wallet extensions.
 * 
 * @returns {Array<object>} List of discovered wallets
 */
export function getWalletsList() {
  const wallets = [];

  // 1. Dynamic standard wallet standard detections
  if (window.registeredSuiWallets && window.registeredSuiWallets.length > 0) {
    window.registeredSuiWallets.forEach(wallet => {
      wallets.push({
        id: 'standard-' + wallet.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        name: wallet.name,
        icon: wallet.icon || null,
        isStandard: true,
        suiWalletObject: wallet
      });
    });
  }

  // 2. Legacy / window property injection detections
  const legacyProviders = [
    { key: 'suiWallet', name: 'Sui Wallet', icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSI+PHBvbHlnb24gcG9pbnRzPSIxMiAyIDIyIDcgMjIgMTcgMTIgMjIgMiAxNyAyIDciIHN0cm9rZT0iIzIyYzU1ZSIgc3Ryb2tlLXdpZHRoPSIyLjUiIGZpbGw9InJnYmEoMzQsMTk3LDk0LDAuMSkiLz48cGF0aCBkPSJNMTIgN3YxME03IDEyaDEwIiBzdHJva2U9IiM0YWRlODAiIHN0cm9rZS13aWR0aD0iMi41IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L3N2Zz4=' },
    { key: 'slush', name: 'Slush Wallet', icon: null },
    { key: 'slushWallet', name: 'Slush Wallet', icon: null },
  ];

  legacyProviders.forEach(p => {
    if (window[p.key]) {
      if (!wallets.find(w => w.name.toLowerCase() === p.name.toLowerCase())) {
        wallets.push({
          id: 'legacy-' + p.key,
          name: p.name,
          icon: p.icon,
          isStandard: false,
          suiWalletObject: window[p.key]
        });
      }
    }
  });

  const providers = ['okxwallet', 'phantom', 'subwallet'];
  providers.forEach(p => {
    if (window[p] && window[p].sui) {
      const name = p.charAt(0).toUpperCase() + p.slice(1) + ' Wallet';
      if (!wallets.find(w => w.name.toLowerCase().includes(p.toLowerCase()))) {
        wallets.push({
          id: 'legacy-' + p,
          name: name,
          icon: null,
          isStandard: false,
          suiWalletObject: window[p].sui
        });
      }
    }
  });

  return wallets;
}

/**
 * Connects to the selected browser wallet extension.
 * 
 * @param {object} wallet - The wallet object from getWalletsList()
 * @returns {Promise<object>} Connection credentials
 */
export async function connectWallet(wallet) {
  if (!wallet || !wallet.suiWalletObject) {
    throw new Error('Wallet object is missing browser provider reference.');
  }

  let address = '';
  const walletObj = wallet.suiWalletObject;
  const isStandardCapable = !!(walletObj.features && walletObj.features['standard:connect']);

  if (isStandardCapable) {
    const connectFeature = walletObj.features['standard:connect'];
    let connectOutput;
    try {
      connectOutput = await connectFeature.connect();
    } catch (e) {
      console.warn('connect() failed without arguments, retrying with silent: false', e);
      try {
        connectOutput = await connectFeature.connect({ silent: false });
      } catch (err2) {
        throw err2;
      }
    }
    
    let account = connectOutput?.accounts?.[0];
    if (!account) {
      account = walletObj.accounts?.[0];
    }
    
    if (!account) {
      throw new Error('No active Sui account found. Please open your wallet extension and ensure a Sui account is created/active and Sui network is enabled.');
    }
    address = account.address;
    
    // Ensure isStandard matches reality so execution flow matches connection flow
    wallet.isStandard = true;
  } else {
    const provider = walletObj;
    if (typeof provider.requestPermissions === 'function') {
      await provider.requestPermissions();
    } else if (typeof provider.requestAccount === 'function') {
      const resp = await provider.requestAccount();
      if (resp && resp.address) {
        address = resp.address;
      }
    } else if (typeof provider.connect === 'function') {
      await provider.connect();
    }

    if (!address) {
      if (typeof provider.getAccounts === 'function') {
        const accounts = await provider.getAccounts();
        address = accounts?.[0] || '';
      } else if (provider.account) {
        address = provider.account.address || '';
      } else if (provider.selectedAddress) {
        address = provider.selectedAddress;
      }
    }
    
    // Ensure isStandard matches reality
    wallet.isStandard = false;
  }

  if (!address) {
    throw new Error('Could not retrieve address from wallet. Please make sure you have created/selected a Sui account inside the wallet extension.');
  }

  return {
    wallet,
    account: {
      address,
    },
  };
}

/**
 * Builds, signs, and executes a SUI transfer on-chain using standard browser wallets.
 * 
 * @param {object} wallet - Connected wallet object containing browser provider reference
 * @param {string} recipientAddress - Receiver public Sui address
 * @param {number} amountSui - Amount to transfer in SUI
 * @returns {Promise<object>} Transaction execution result
 */
export async function donateSuiOnChain(wallet, senderAddress, recipientAddress, amountSui) {
  if (!wallet || !wallet.suiWalletObject) {
    throw new Error('Wallet is not connected.');
  }

  // 1. Parameter Validation and Defensive Checks
  if (typeof amountSui !== 'number' || isNaN(amountSui) || amountSui <= 0) {
    throw new Error(`Invalid donation amount: ${amountSui}. Amount must be a positive number.`);
  }
  if (!senderAddress || typeof senderAddress !== 'string' || !senderAddress.startsWith('0x')) {
    throw new Error(`Invalid sender address: ${senderAddress}`);
  }
  if (!recipientAddress || typeof recipientAddress !== 'string' || !recipientAddress.startsWith('0x')) {
    throw new Error(`Invalid recipient address: ${recipientAddress}`);
  }

  // Proactive SUI Balance Check
  try {
    const balance = await getSuiBalance(senderAddress);
    // Standard gas buffer threshold: 0.02 SUI
    if (balance < amountSui + 0.02) {
      throw new Error(`Insufficient SUI balance. Your wallet has ${balance.toFixed(4)} SUI, but this donation requires at least ${(amountSui + 0.02).toFixed(4)} SUI (including transaction gas). Please obtain Testnet SUI from a faucet.`);
    }
  } catch (err) {
    if (err.message && err.message.includes('Insufficient SUI balance')) {
      throw err;
    }
    console.warn('Could not proactively verify SUI balance before signing:', err.message);
  }

  // 2. Construct standard Transaction Block
  const tx = new Transaction();
  const amountInMist = BigInt(Math.floor(amountSui * 1_000_000_000));
  
  // Split SUI from gas coin
  const [coin] = tx.splitCoins(tx.gas, [tx.pure('u64', amountInMist)]);
  
  // Transfer to target recipient
  tx.transferObjects([coin], tx.pure('address', recipientAddress));

  // 3. Request Wallet signature
  const walletObj = wallet.suiWalletObject;
  let signedResult;

  if (!walletObj.features) {
    // Audit Log for Legacy Wallet
    console.log('[Sui Donation Flow Audit - Legacy Wallet]:', {
      connectedWallet: wallet.name || 'Legacy Wallet',
      currentAccount: senderAddress,
      addressUsedForDonation: senderAddress,
      network: 'sui:testnet',
      transactionPayload: {
        sender: senderAddress,
        recipient: recipientAddress,
        amountSui: amountSui,
        amountMist: amountInMist.toString(),
        gasBudget: tx.blockData?.gasConfig?.budget || 'default',
        transactionData: tx.blockData
      }
    });

    try {
      // Legacy / direct injected provider fallback
      if (typeof walletObj.signTransactionBlock === 'function') {
        signedResult = await walletObj.signTransactionBlock({
          transactionBlock: tx,
          chain: 'sui:testnet',
        });
      } else if (typeof walletObj.signTransaction === 'function') {
        signedResult = await walletObj.signTransaction({
          transaction: tx,
          chain: 'sui:testnet',
        });
      } else {
        throw new Error('Connected legacy wallet extension does not support transaction signing methods.');
      }
    } catch (error) {
      console.error('=== Sui Legacy Wallet Transaction Signing Exception ===');
      console.error('Error Message:', error?.message);
      console.error('Error Stack:', error?.stack);
      if (error && typeof error === 'object') {
        console.dir(error);
      }
      console.error('===============================================');
      const cleanMessage = getCleanErrorMessage(error);
      throw new Error(cleanMessage);
    }
  } else {
    // Resolve standard WalletAccount defensively
    const activeAccount = walletObj.accounts?.find(acc => acc.address === senderAddress) || walletObj.accounts?.[0];

    if (!activeAccount) {
      throw new Error(`Could not resolve active wallet account for sender address: ${senderAddress}. Please ensure your wallet has an active account connected.`);
    }

    // Audit Log for Standard Wallet
    console.log('[Sui Donation Flow Audit - Standard Wallet]:', {
      connectedWallet: wallet.name || 'Standard Wallet',
      currentAccount: activeAccount.address,
      addressUsedForDonation: senderAddress,
      network: 'sui:testnet',
      transactionPayload: {
        sender: senderAddress,
        recipient: recipientAddress,
        amountSui: amountSui,
        amountMist: amountInMist.toString(),
        gasBudget: tx.blockData?.gasConfig?.budget || 'default',
        transactionData: tx.blockData
      }
    });

    try {
      if (walletObj.features['sui:signTransaction']) {
        signedResult = await walletObj.features['sui:signTransaction'].signTransaction({
          transaction: tx,
          account: activeAccount,
          chain: 'sui:testnet',
        });
      } else if (walletObj.features['sui:signTransactionBlock']) {
        signedResult = await walletObj.features['sui:signTransactionBlock'].signTransactionBlock({
          transactionBlock: tx,
          account: activeAccount,
          chain: 'sui:testnet',
        });
      } else {
        throw new Error('Connected wallet extension does not support transaction signing standard features.');
      }
    } catch (error) {
      console.error('=== Sui Wallet Transaction Signing Exception ===');
      console.error('Error Object Name:', error?.name);
      console.error('Error Message:', error?.message);
      console.error('Error Stack:', error?.stack);
      if (error && typeof error === 'object') {
        console.error('Error Object Keys:', Object.keys(error));
        try {
          console.error('Error Details:', error.details);
        } catch (e) {}
        try {
          console.error('Error Cause:', error.cause);
        } catch (e) {}
        try {
          console.error('Error Data:', error.data);
          console.error('Error Data Stringified:', JSON.stringify(error.data, null, 2));
        } catch (e) {}
        console.dir(error);
      }
      console.error('========================================');
      const cleanMessage = getCleanErrorMessage(error);
      throw new Error(cleanMessage);
    }
  }

  // 4. Broadcast the signed transaction directly via Tatum RPC
  try {
    console.log('[Sui Direct Broadcast]: Sending signed transaction bytes to Tatum RPC...');
    
    // Resolve transaction bytes defensively across modern/legacy wallet standards
    const txBytes = signedResult.transactionBytes || signedResult.transactionBlockBytes || signedResult.bytes;
    const signature = signedResult.signature;

    // Tasks 1, 2, 3: Log diagnostics
    console.log('[Sui Broadcast Diagnostics]: signedResult keys:', Object.keys(signedResult));
    console.log('[Sui Broadcast Diagnostics]: Resolving txBytes:', txBytes ? (txBytes.substring(0, 30) + '...') : 'undefined');
    console.log('[Sui Broadcast Diagnostics]: Resolving signature:', signature ? (signature.substring(0, 30) + '...') : 'undefined');

    if (!txBytes) {
      throw new Error('Transaction bytes are missing from the signed result returned by the wallet extension.');
    }
    if (!signature) {
      throw new Error('Signature is missing from the signed result returned by the wallet extension.');
    }

    const payload = [
      txBytes,
      [signature],
      {
        showInput: true,
        showEffects: true,
        showEvents: true
      },
      'WaitForLocalExecution'
    ];

    console.log('[Sui Broadcast Diagnostics]: Full JSON-RPC Payload:', JSON.stringify(payload, null, 2));

    const executeResult = await sendRpcRequest('sui_executeTransactionBlock', payload);
    
    // Check if execution failed on-chain
    const status = executeResult?.effects?.status?.status;
    if (status === 'failure') {
      const errorMsg = executeResult?.effects?.status?.error || 'Transaction execution failed on-chain.';
      throw new Error(errorMsg);
    }
    
    console.log('[Sui Direct Broadcast Success]:', executeResult);
    return executeResult;
  } catch (broadcastError) {
    console.error('=== Sui RPC Broadcast Exception ===');
    console.error('Error Message:', broadcastError?.message);
    console.error('Error Stack:', broadcastError?.stack);
    console.error('===================================');
    throw new Error(`Blockchain Broadcast Failed: ${broadcastError.message}`);
  }
}

/**
 * Extracted helper to resolve underlying blockchain, RPC, or wallet standard error details.
 * 
 * @param {any} err - The error object to clean
 * @returns {string} User-friendly detailed error message
 */
export function getCleanErrorMessage(err) {
  if (!err) return 'Unknown blockchain error.';
  
  if (typeof err === 'string') return err;
  
  // 1. Intercept "Incorrect password" Sui Wallet extension state bug and guide the user
  const errStr = err && typeof err === 'object' ? JSON.stringify(err).toLowerCase() : String(err).toLowerCase();
  if (errStr.includes('incorrect password') || (err.message && err.message.toLowerCase().includes('password'))) {
    return 'Transaction Failed: "Incorrect password". This is a known Sui Wallet extension session bug. To bypass this, please open the Sui Wallet extension from your browser toolbar, enter your password to unlock it first, and then submit the donation again while the wallet is active and unlocked.';
  }

  // 2. Extract nested message
  if (err.cause?.message) {
    return err.cause.message;
  }
  if (err.details) {
    return typeof err.details === 'string' ? err.details : JSON.stringify(err.details);
  }
  if (err.data) {
    if (err.data.message) {
      return err.data.message;
    }
    try {
      return JSON.stringify(err.data);
    } catch (e) {}
  }
  if (err.message) {
    return err.message;
  }

  try {
    return JSON.stringify(err);
  } catch (e) {
    return err.toString();
  }
}

