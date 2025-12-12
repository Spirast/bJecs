import { EntityId, Id } from "./types";

export interface Query<T extends unknown[]> {
    with<U extends unknown[]>(...components: { [K in keyof U]: Id<U[K]> }): Query<[...T, ...U]>;
    without(...components: Id[]): Query<T>;
    each(callback: (entity: EntityId, ...components: T) => void): void;
    collect(): Array<[EntityId, ...T]>;
    map<U>(fn: (entry: [EntityId, ...T]) => U): U[];
    filter(fn: (entry: [EntityId, ...T]) => boolean): Array<[EntityId, ...T]>;
}
