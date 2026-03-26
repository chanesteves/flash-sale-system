import { webcrypto } from 'crypto';

// Make crypto global available for Jest test environment
global.crypto = webcrypto as Crypto;
