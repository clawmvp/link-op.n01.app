// On-chain configuration for the Chainlink operator-revenue dashboard.

// The payments contract that emits EarmarkSet events (operator reward ledger).
export const PAYMENTS_CONTRACT =
  "0x5680681ED3767B96914CE741a308155C7fB9171d".toLowerCase() as `0x${string}`;

// EarmarkSet(address indexed operator, uint256 indexed id, int96 amount, bytes data)
export const EARMARK_SET_TOPIC =
  "0xf24f6f3d9e328a37bdcf1649fb88df005eea7a5e1fc9721a064a0aa04d4828f9";

// First block the contract emitted events at (found by scanning). Used as the
// lower bound so we never scan the whole chain.
export const DEPLOY_BLOCK = 23_540_000;

// LINK token (mainnet). Its Transfer event carries the direct treasury payouts.
export const LINK_TOKEN =
  "0x514910771AF9Ca656af840dff83E8264EcF986CA".toLowerCase() as `0x${string}`;
export const LINK_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Treasury / paymaster Safe that also pays operators directly in LINK (a second
// revenue source, on top of the EarmarkSet ledger). It funds the earmark
// contract too — those transfers are ignored (recipient isn't an operator).
export const SAFE_CONTRACT =
  "0x77dD1A9b170E2F8976c20c10c8d9c27886181077".toLowerCase() as `0x${string}`;

// First block the Safe started paying out (found by scanning).
export const SAFE_DEPLOY_BLOCK = 22_480_000;

// Our own operator, highlighted in the table.
export const SELF_OPERATOR =
  "0x7a30e4b6307c0db7aef247a656b44d888b23a2dc".toLowerCase() as `0x${string}`;

// Public RPCs used for log pagination + ENS reverse resolution (fallback chain).
export const RPCS = [
  "https://eth.llamarpc.com",
  "https://ethereum-rpc.publicnode.com",
  "https://eth.drpc.org",
  "https://rpc.mevblocker.io",
];

// Max block span per eth_getLogs call on public RPCs.
export const LOG_WINDOW = 50_000;
