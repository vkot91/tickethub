import type { AuthRpcContracts } from './auth/wire';
import type { OrdersRpcContracts } from './orders/wire';
import type { OrganizerRpcContracts } from './organizer/wire';
import type { PaymentsRpcContracts } from './payments/wire';
import type { ShowsRpcContracts } from './shows/wire';
import type { TicketsRpcContracts } from './tickets/wire';
import type { VenuesRpcContracts } from './venues/wire';

/**
 * Every RPC in the system, keyed by its routing key — the single place where a caller's payload
 * and a handler's return type are stated together.
 *
 * `rpcRequest` reads this map, so a call site names a key and nothing else: the payload is checked
 * against the handler's expectation and the result comes back typed. Before this existed the
 * caller passed `unknown` and asserted the result itself, which meant every gateway call was a
 * promise made to itself across a wire the compiler could not see.
 *
 * **Adding an RPC**: add the routing key to its `*_MESSAGE_PATTERNS` map and a line to the
 * `*RpcContracts` interface directly below it — both live in that feature's `wire.ts`, so the
 * key and its two halves are three lines apart. The keys are computed from the map, so a typo is
 * a compile error, and the two halves should mirror the `@RabbitRPC` handler's parameter and
 * return type. That mirroring is by hand: handler and caller live in different services, so
 * nothing but this map can relate them.
 *
 * **Payload shapes**: request *envelopes* (`{ userId, dto }`) are structural types, not schemas —
 * they are assembled by the gateway from an already-validated DTO plus the caller's JWT, so a
 * schema would re-validate what the edge just proved. Anything that is itself a wire shape is a
 * Zod-inferred type from the feature's `schema.ts` — that stays the source of truth.
 *
 * Extension and not a union of the parts: routing keys are globally unique, so the flat result is
 * what `RpcKey` should be. It also catches the mistake that matters — the same key claimed by two
 * services with *different* shapes is a TS2320 here, rather than a silent `never` at the call site.
 */
export interface RpcContracts
  extends
    AuthRpcContracts,
    ShowsRpcContracts,
    OrganizerRpcContracts,
    VenuesRpcContracts,
    OrdersRpcContracts,
    TicketsRpcContracts,
    PaymentsRpcContracts {}

/** Every routing key that is an RPC — anything else is not callable via `rpcRequest`. */
export type RpcKey = keyof RpcContracts;

export type RpcPayload<K extends RpcKey> = RpcContracts[K]['payload'];
export type RpcResult<K extends RpcKey> = RpcContracts[K]['result'];
