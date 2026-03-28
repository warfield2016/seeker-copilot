// Polyfills required for Solana Web3.js on React Native
import "react-native-get-random-values";
import { Buffer } from "buffer";

// Make Buffer available globally (required by @solana/web3.js)
global.Buffer = global.Buffer || Buffer;
