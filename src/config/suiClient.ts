import dotenv from 'dotenv';
import { JsonRpcHTTPTransport, SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

// Load environment variables from .env file
dotenv.config();

const rpcUrl = process.env.SUI_RPC_URL;
const apiKey = process.env.TATUM_API_KEY;
const network = (process.env.NETWORK || 'testnet') as 'mainnet' | 'testnet' | 'devnet' | 'localnet';

if (!rpcUrl) {
  throw new Error('SUI_RPC_URL is required in the environment variables (.env).');
}

/**
 * Configure the JsonRpcHTTPTransport instance.
 * Automatically appends the Tatum x-api-key header if it exists.
 */
const headers: Record<string, string> = {
  'Content-Type': 'application/json',
};

if (apiKey) {
  headers['x-api-key'] = apiKey;
}

const transport = new JsonRpcHTTPTransport({
  url: rpcUrl,
  rpc: {
    headers,
  },
});

/**
 * Singleton instance of the SuiJsonRpcClient connected to Sui Testnet via Tatum RPC.
 */
export const suiClient = new SuiJsonRpcClient({
  transport,
  network,
});

export default suiClient;
