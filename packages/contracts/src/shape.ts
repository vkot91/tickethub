/** What every entry in an RPC map states: what the caller sends, what it gets back. */
export interface RpcShape {
  payload: unknown;
  result: unknown;
}

/**
 * Names the two halves of an RPC at the point of declaration. It is an identity alias — the work
 * it does is the constraint: an entry that misspells `payload` or omits `result` fails on its own
 * line, instead of surfacing later as an unindexable `RpcContracts[K]` in another file.
 */
export type Rpc<Contract extends RpcShape> = Contract;
