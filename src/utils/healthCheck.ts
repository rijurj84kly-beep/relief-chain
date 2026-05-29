import suiClient from '../config/suiClient.js';
import { handleRpcError } from '../services/blockchainService.js';

/**
 * Pings the Sui Mainnet RPC node by requesting the latest checkpoint.
 * If successful, logs "Sui Mainnet connected ✅" and prints the checkpoint number.
 * If the connection fails, throws a descriptive error with details.
 * 
 * @returns A promise that resolves to true if connected, or throws an error if disconnected.
 * @throws An Error describing the connection failure.
 */
export async function checkSuiConnection(): Promise<boolean> {
  try {
    const checkpoint = await suiClient.getLatestCheckpointSequenceNumber();
    console.log(`\nSui Mainnet connected ✅ (Latest Checkpoint: ${checkpoint})\n`);
    return true;
  } catch (err: any) {
    const structuredError = handleRpcError(err);
    const errorDetails = `Sui Mainnet connection failed ❌. Error details: ${structuredError.error}`;
    console.error(`\n${errorDetails}\n`);
    throw new Error(errorDetails);
  }
}
