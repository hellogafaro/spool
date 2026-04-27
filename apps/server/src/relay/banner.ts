/**
 * Banner printed on the env console when running in relay-managed (SaaS)
 * mode. Replaces T3's headless `pairingUrl:` line with a branded block
 * that names the two values the user pastes into app.trunk.codes.
 */

const TRUNK_ASCII_LOGO = String.raw`
   _____ ___ _   _ _  _ _  __
  |_   _| _ \ | | | \| | |/ /
    | | |   / |_| | .\` | ' <
    |_| |_|_\\___/|_|\_|_|\_\
`;

export function formatPairBanner(input: {
  readonly environmentId: string;
  readonly token: string;
  readonly appUrl: string;
}): string {
  return [
    TRUNK_ASCII_LOGO,
    `Environment ID: ${input.environmentId}`,
    `Token: ${input.token}`,
    "",
    `Follow the instructions at ${input.appUrl} to add this environment.`,
    "",
  ].join("\n");
}
