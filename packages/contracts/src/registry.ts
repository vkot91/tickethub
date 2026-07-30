import type { AuthRpcContracts } from './auth/wire';
import type { OrdersEventContracts, OrdersRpcContracts } from './orders/wire';
import type { OrganizerRpcContracts } from './organizer/wire';
import type { PaymentsEventContracts, PaymentsRpcContracts } from './payments/wire';
import type { ShowsEventContracts, ShowsRpcContracts } from './shows/wire';
import type { TicketsEventContracts, TicketsRpcContracts } from './tickets/wire';
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

/**
 * Every domain event in the system, keyed by its routing key. The RPC half of this file relates a
 * payload to a result; an event has no result, so an entry is just the payload type.
 *
 * `OutboxRepository.enqueue` reads this map, so a publish site names a routing key and the payload
 * is checked against it. Before this existed the outbox took
 * `Record<string, unknown> & { messageId: string }`, which accepted any object with a uuid in it —
 * a stray key, a missing field or a payload filed under the wrong routing key were all silent, and
 * only turned up as an undefined property inside a consumer in another service.
 *
 * **Adding an event**: add the routing key to its `*_ROUTING_KEYS` map, the payload schema to that
 * feature's `schema.ts`, and one line to its `*EventContracts` interface. All three are in the same
 * folder. Writing the key without the contract line is a compile error at the first publish site.
 */
export interface EventContracts
  extends
    ShowsEventContracts,
    OrdersEventContracts,
    PaymentsEventContracts,
    TicketsEventContracts {}

/** Every routing key that is a domain event — anything else cannot be published. */
export type EventKey = keyof EventContracts;

/**
 * What a *publisher* authors: domain fields only. `messageId` is deliberately absent — see
 * `EventEnvelope`.
 */
export type EventPayload<K extends EventKey> = EventContracts[K];

/**
 * What a *consumer* receives: the payload plus the id the transport stamped on it.
 *
 * `messageId` is an envelope concern, not a domain one. Every publisher used to mint it by hand —
 * three different uuid generators across five call sites — and every one of them could have
 * forgotten, because the field was just another key in the payload. Now `enqueue` stamps it, so a
 * publisher cannot omit it and a consumer can always dedupe on it. The bytes on the wire are
 * unchanged; only who is responsible for the field moved.
 */
export type EventEnvelope<K extends EventKey> = EventPayload<K> & { messageId: string };
