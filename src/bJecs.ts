/**
 * bootlegJecs - A lightweight ECS (Entity Component System) for roblox-ts
 * @spirast
 */

// ==============================================
// Core Types and Interfaces
// ==============================================

type Callback<T extends unknown[]> = (...args: T) => void;

export interface IDisposable {
    Disconnect(): void;
}

export interface Snapshot {
    id: number;
    timestamp: number;
    entityStates: Map<EntityId, Map<Id, unknown>>;
}

export type EntityId = number & { readonly __brand: unique symbol };
export type Id<T = unknown> = number & { readonly __type?: T };

// ==============================================
// Helpers
// ==============================================

let nextId = 1;
function generateId(): number {
    return nextId++;
}

function deepClone<T>(obj: T): T {
    // returns deep copy by just decoding the encode instead of iterating thru everything
    return game.GetService("HttpService").JSONDecode(
        game.GetService("HttpService").JSONEncode(obj)
    ) as T;
}

export interface Query<T extends unknown[]> {
    with<U extends unknown[]>(...components: { [K in keyof U]: Id<U[K]> }): Query<[...T, ...U]>;
    without(...components: Id[]): Query<T>;
    each(callback: (entity: EntityId, ...components: T) => void): void;
    collect(): Array<[EntityId, ...T]>;
    map<U>(fn: (entry: [EntityId, ...T]) => U): U[];
    filter(fn: (entry: [EntityId, ...T]) => boolean): Array<[EntityId, ...T]>;
}

export interface World {
    spawn(): EntityId;
    despawn(entity: EntityId): boolean;
    valid(entity: EntityId): boolean;

    set<T>(entity: EntityId, component: Id<T>, value: T): void;
    get<T>(entity: EntityId, component: Id<T>): T | undefined;
    has(entity: EntityId, component: Id): boolean;
    remove(entity: EntityId, component: Id): boolean;

    query<T extends unknown[]>(...components: { [K in keyof T]: Id<T[K]> }): Query<T>;

    snapshot(): Snapshot;
    revert(snapshot: Snapshot): void;

    // SPIRASTS CUSTOM EVENTS
    onEntitySpawned: Event<[EntityId]>;
    onEntityDespawned: Event<[EntityId]>;
    onComponentAdded: Event<[EntityId, Id]>;
    onComponentRemoved: Event<[EntityId, Id]>;
}

// ==============================================
// Component Registry
// ==============================================

const componentRegistry = new Map<string, Id>();
let nextComponentId = 1;

export function component<T = void>(name: string): Id<T> {
    if (componentRegistry.has(name)) {
        error(`Component '${name}' is already registered`);
    }
    const id = nextComponentId++ as Id<T>;
    componentRegistry.set(name, id);
    return id;
}

// ==============================================
// World Implementation
// ==============================================

class WorldImpl implements World {
    private nextEntityId = 1;
    private entities = new Set<EntityId>();
    private components = new Map<EntityId, Map<Id, unknown>>();

    public onEntitySpawned = new Event<[EntityId]>();
    public onEntityDespawned = new Event<[EntityId]>();
    public onComponentAdded = new Event<[EntityId, Id]>();
    public onComponentRemoved = new Event<[EntityId, Id]>();

    spawn(): EntityId {
        const entity = this.nextEntityId++ as EntityId;
        this.entities.add(entity);
        this.components.set(entity, new Map());
        this.onEntitySpawned.fire(entity);
        return entity;
    }

    despawn(entity: EntityId): boolean {
        if (!this.valid(entity)) return false;
        const comps = this.components.get(entity)!;
        for (const [comp] of comps) {
            this.onComponentRemoved.fire(entity, comp);
        }
        this.entities.delete(entity);
        this.components.delete(entity);
        this.onEntityDespawned.fire(entity);
        return true;
    }

    valid(entity: EntityId): boolean {
        return this.entities.has(entity);
    }

    set<T>(entity: EntityId, component: Id<T>, value: T): void {
        if (!this.valid(entity)) error(`Entity ${entity} does not exist`);
        const comps = this.components.get(entity)!;
        const had = comps.has(component);
        comps.set(component, value);
        if (!had) this.onComponentAdded.fire(entity, component);
    }

    get<T>(entity: EntityId, component: Id<T>): T | undefined {
        if (!this.valid(entity)) return undefined;
        return this.components.get(entity)?.get(component) as T | undefined;
    }

    has(entity: EntityId, component: Id): boolean {
        if (!this.valid(entity)) return false;
        return this.components.get(entity)?.has(component) ?? false;
    }

    remove(entity: EntityId, component: Id): boolean {
        if (!this.valid(entity)) return false;
        const comps = this.components.get(entity)!;
        const had = comps.delete(component);
        if (had) this.onComponentRemoved.fire(entity, component);
        return had;
    }

    query<T extends unknown[]>(...components: { [K in keyof T]: Id<T[K]> }): Query<T> {
        const required: Id[] = [];
        const excluded: Id[] = [];

        for (const c of components) {
            required.push(c);
        }

        const shit = this;

        const query: Query<T> = {
            with<U extends unknown[]>(...newComps: { [K in keyof U]: Id<U[K]> }): Query<[...T, ...U]> {
                for (const comp of newComps) {
                    required.push(comp);
                }
                return query as unknown as Query<[...T, ...U]>;
            },

            without(...ex: Id[]): Query<T> {
                for (const comp of ex) {
                    excluded.push(comp);
                }
                return query;
            },

            each(cb: (entity: EntityId, ...components: T) => void): void {
                for (const entity of shit.entities) {
                    const comps = shit.components.get(entity)!;
                    const hasAll = required.every((c) => comps.has(c));
                    const hasEx = excluded.some((c) => comps.has(c));
                    if (hasAll && !hasEx) {
                        const values = required.map(c => comps.get(c)) as T;
                        cb(entity, ...values);
                    }
                }
            },

            collect(): Array<[EntityId, ...T]> {
                const results: Array<[EntityId, ...T]> = [];
                query.each((entity: EntityId, ...vals: T) => {
                    results.push([entity, ...vals] as [EntityId, ...T]);
                });
                return results;
            },

            map<U>(fn: (entry: [EntityId, ...T]) => U): U[] {
                return query.collect().map(fn);
            },
            filter(fn: (entry: [EntityId, ...T]) => boolean): Array<[EntityId, ...T]> {
                return query.collect().filter(fn);
            }
        };

        return query;
    }

    snapshot(): Snapshot {
        const entityStates = new Map<EntityId, Map<Id, unknown>>();
        for (const entity of this.entities) {
            const comps = this.components.get(entity)!;
            const cloned = new Map<Id, unknown>();
            for (const [id, val] of comps) cloned.set(id, deepClone(val));
            entityStates.set(entity, cloned);
        }
        return { id: generateId(), timestamp: os.clock(), entityStates };
    }

    revert(snapshot: Snapshot): void {
        for (const entity of [...this.entities]) {
            if (!snapshot.entityStates.has(entity)) this.despawn(entity);
        }
        for (const [entity, comps] of snapshot.entityStates) {
            if (!this.entities.has(entity)) {
                this.entities.add(entity);
                this.components.set(entity, new Map());
                this.onEntitySpawned.fire(entity);
            }
            const current = this.components.get(entity)!;
            for (const [id] of current) {
                if (!comps.has(id)) {
                    current.delete(id);
                    this.onComponentRemoved.fire(entity, id);
                }
            }
            for (const [id, val] of comps) {
                current.set(id, deepClone(val));
                this.onComponentAdded.fire(entity, id);
            }
        }
    }
}

// ==============================================
// Public API
// ==============================================

export function createWorld(): World {
    return new WorldImpl();
}

// default components
export const Position = component<{ x: number; y: number; z: number }>("position");
export const Velocity = component<{ x: number; y: number; z: number }>("velocity");
export const Health = component<{ current: number; max: number }>("health");
export const Name = component<string>("name");

// ==============================================
// Utility Types and Functions
// ==============================================

// NOT DONE YET 
// TODO: DO IT 

export type ComponentType<T> = T extends Id<infer U> ? U : never;
export type System<Args extends unknown[] = []> = (world: World, ...args: Args) => void;

/**
 * @deprecated Do not use this, it is not done yet
 */
export function createSystem<T extends unknown[]>(
    query: Query<T>,
    callback: (entity: EntityId, ...components: T) => void
): System {
    return (_world: World) => {
        query.each(callback);
    };
}


/**
 * @deprecated Do not use this, it is not done yet
 */
export function runSystems(world: World, ...systems: System[]): () => void {
    return () => {
        for (const sys of systems) sys(world);
    };
}

// ==============================================
// Event System
// ==============================================

export class Event<T extends unknown[] = []> {
    private connections: Map<number, Callback<T>> = new Map();
    private nextId = 0;

    public connect(callback: Callback<T>): IDisposable {
        const id = this.nextId++;
        this.connections.set(id, callback);
        const connections = this.connections;
        return {
            Disconnect() {
                connections.delete(id);
            },
        };
    }

    public fire(...args: T): this {
        this.connections.forEach((cb) => cb(...args));
        return this;
    }

    public wait(): Promise<T> {
        return new Promise((resolve) => {
            const conn = this.connect((...args: T) => {
                conn.Disconnect();
                resolve(args);
            });
        });
    }

    public disconnectAll(): void {
        this.connections.clear();
    }

    public getConnectionCount(): number {
        return this.connections.size();
    }
}