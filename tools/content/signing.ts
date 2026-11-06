import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';
import { canonicalJson } from '../../shared/canonicalJson';
import type { Manifest } from '../../shared/contract';

export interface ManifestBody {
  readonly version: number;
  readonly generatedAt: string;
  readonly packs: Manifest['packs'];
}

/** The exact fields covered by the signature; `signature` itself is not. */
export function manifestBody(manifest: Manifest): ManifestBody {
  return {
    version: manifest.version,
    generatedAt: manifest.generatedAt,
    packs: manifest.packs,
  };
}

/** Sign raw bytes, for callers that already built the canonical payload. */
export function signBytes(message: Uint8Array, privateKeyPem: string): string {
  return cryptoSign(null, message, createPrivateKey(privateKeyPem)).toString('base64');
}

/** Sign the canonical body (D-050). Returns base64 Ed25519. */
export function signManifestBody(body: ManifestBody, privateKeyPem: string): string {
  return signBytes(Buffer.from(canonicalJson(body), 'utf8'), privateKeyPem);
}

/** Verify a manifest against the public key pinned in the app. */
export function verifyManifest(manifest: Manifest, publicKeyPem: string): boolean {
  const message = Buffer.from(canonicalJson(manifestBody(manifest)), 'utf8');
  return cryptoVerify(
    null,
    message,
    createPublicKey(publicKeyPem),
    Buffer.from(manifest.signature, 'base64'),
  );
}

export interface SigningKeyPair {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
}

/** Generate a fresh Ed25519 pair; the private key must never be committed. */
export function generateSigningKeyPair(): SigningKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}
