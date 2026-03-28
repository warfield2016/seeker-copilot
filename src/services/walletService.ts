import {
  transact,
  Web3MobileWallet,
} from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { SOLANA_RPC_ENDPOINT, SOLANA_CLUSTER } from "../config/constants";

const APP_IDENTITY = {
  name: "Seeker AI Copilot",
  uri: "https://warfield2016.github.io/seeker-copilot/",
  icon: "favicon.ico",
};

class WalletService {
  private connection: Connection;
  private authorizedAddress: string | null = null;
  private authToken: string | null = null;

  constructor() {
    this.connection = new Connection(SOLANA_RPC_ENDPOINT, "confirmed");
  }

  getConnection(): Connection {
    return this.connection;
  }

  getAddress(): string | null {
    return this.authorizedAddress;
  }

  async connect(): Promise<string> {
    const authResult = await transact(async (wallet: Web3MobileWallet) => {
      const auth = await wallet.authorize({
        cluster: SOLANA_CLUSTER,
        identity: APP_IDENTITY,
      });
      return {
        address: auth.accounts[0].address,
        authToken: auth.auth_token,
      };
    });

    this.authorizedAddress = authResult.address;
    this.authToken = authResult.authToken;
    return authResult.address;
  }

  async disconnect(): Promise<void> {
    if (this.authToken) {
      try {
        await transact(async (wallet: Web3MobileWallet) => {
          await wallet.deauthorize({ auth_token: this.authToken! });
        });
      } catch {
        // Deauth failure is not critical
      }
    }
    this.authorizedAddress = null;
    this.authToken = null;
  }

  async getBalance(): Promise<number> {
    if (!this.authorizedAddress) throw new Error("Wallet not connected");
    const pubkey = new PublicKey(this.authorizedAddress);
    const lamports = await this.connection.getBalance(pubkey);
    return lamports / 1e9; // Convert to SOL
  }

  isConnected(): boolean {
    return this.authorizedAddress !== null;
  }
}

export const walletService = new WalletService();
export default walletService;
