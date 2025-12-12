import { EntityId, Id } from "./types";
import { Event } from "./event";

export interface Group {
    readonly id: number;
    addEntity(entity: EntityId): void;
    removeEntity(entity: EntityId): void;
    hasEntity(entity: EntityId): boolean;
    getEntities(): EntityId[];
    set<T>(component: Id<T>, value: T): void;
    get<T>(component: Id<T>): T | undefined;
    has(component: Id): boolean;
    remove(component: Id): boolean;
    onEntityAdded: Event<[EntityId]>;
    onEntityRemoved: Event<[EntityId]>;
}

export class GroupImpl implements Group {
    private static nextId = 1;
    public readonly id: number;
    private entities = new Set<EntityId>();
    private components = new Map<Id, unknown>();

    public onEntityAdded = new Event<[EntityId]>();
    public onEntityRemoved = new Event<[EntityId]>();

    constructor() {
        this.id = GroupImpl.nextId++;
    }

    addEntity(entity: EntityId): void {
        if (!this.entities.has(entity)) {
            this.entities.add(entity);
            this.onEntityAdded.fire(entity);
        }
    }

    removeEntity(entity: EntityId): void {
        if (this.entities.delete(entity)) {
            this.onEntityRemoved.fire(entity);
        }
    }

    hasEntity(entity: EntityId): boolean {
        return this.entities.has(entity);
    }

    getEntities(): EntityId[] {
        return [...this.entities];
    }

    set<T>(component: Id<T>, value: T): void {
        this.components.set(component, value);
    }

    get<T>(component: Id<T>): T | undefined {
        return this.components.get(component) as T | undefined;
    }

    has(component: Id): boolean {
        return this.components.has(component);
    }

    remove(component: Id): boolean {
        return this.components.delete(component);
    }
}
