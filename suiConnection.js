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

    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
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

  if (wallet.isStandard) {
    const walletObj = wallet.suiWalletObject;
    const connectFeature = walletObj.features['standard:connect'];
    if (!connectFeature) {
      throw new Error('Selected wallet does not support connect standard.');
    }
    
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
    
    let account = connectOutput && connectOutput.accounts && connectOutput.accounts[0];
    if (!account) {
      account = walletObj.accounts && walletObj.accounts[0];
    }
    
    if (!account) {
      throw new Error('No active Sui account found. Please open your wallet extension and ensure a Sui account is created/active and Sui network is enabled.');
    }
    address = account.address;
  } else {
    const provider = wallet.suiWalletObject;
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
        address = accounts[0] || '';
      } else if (provider.account) {
        address = provider.account.address || '';
      } else if (provider.selectedAddress) {
        address = provider.selectedAddress;
      }
    }
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
export async function donateSuiOnChain(wallet, recipientAddress, amountSui) {
  if (!wallet || !wallet.suiWalletObject) {
    throw new Error('Wallet is not connected.');
  }

  // 1. Construct standard Transaction Block
  const tx = new Transaction();
  const amountInMist = BigInt(Math.floor(amountSui * 1_000_000_000));
  
  // Split SUI from gas coin
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountInMist)]);
  
  // Transfer to target recipient
  tx.transferObjects([coin], tx.pure.address(recipientAddress));

  // 2. Request Wallet Standard signature and execution
  const walletObj = wallet.suiWalletObject;
  
  // Try sui:signAndExecuteTransaction first (newest standard)
  const signAndExecute = walletObj.features['sui:signAndExecuteTransaction'] || 
                         walletObj.features['sui:signAndExecuteTransactionBlock'];
                         
  if (!signAndExecute) {
    throw new Error('Connected wallet extension does not support transaction signing features.');
  }

  if (walletObj.features['sui:signAndExecuteTransaction']) {
    const result = await walletObj.features['sui:signAndExecuteTransaction'].signAndExecuteTransaction({
      transaction: tx,
    });
    return result;
  } else {
    const result = await walletObj.features['sui:signAndExecuteTransactionBlock'].signAndExecuteTransactionBlock({
      transactionBlock: tx,
    });
    return result;
  }
}

