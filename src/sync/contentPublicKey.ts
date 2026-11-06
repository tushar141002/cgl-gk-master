/**
 * The Ed25519 public key pinned in the app (D-025, D-059).
 *
 * The matching private key lives outside this repository. Rotating the key
 * means shipping an app update, so it must be treated as part of the install
 * identity, not as configuration.
 */
export const CONTENT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEARNNXYn+6icoQhTC+fb03f8DDxOObJO7hhg4Gzu3OQVY=
-----END PUBLIC KEY-----
`;
