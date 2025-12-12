export type Callback<T extends unknown[]> = (...args: T) => void;

export interface IDisposable {
    Disconnect(): void;
}

export interface Snapshot {
    id: number;
    timestamp: number;
    entityStates: Map<EntityId, Map<Id, unknown>>;
    components?: Id[]; // Optional array of component IDs that were snapshotted
}

export type EntityId = number & { readonly __brand: unique symbol };
export type Id<T = unknown> = number & { readonly __type?: T };
