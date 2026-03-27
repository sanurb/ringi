/**
 * Atom utilities — placeholder for @effect-atom integration.
 * @effect-atom/atom-react is incompatible with Effect v4.
 * This module preserves the interface for when a v4-compatible version is released.
 */

export interface TypedSerializable<A, I> {
  readonly _serializableKey: string;
  readonly encode: (value: A) => I;
  readonly decode: (value: I) => A;
}
