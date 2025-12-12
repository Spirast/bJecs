import { Id, EntityId } from "./types";
import { World } from "./world";

export class Prefab {
    private components: Array<[Id, unknown]>;
    private world: World;

    constructor(world: World, components: Array<[Id, unknown]>) {
        this.world = world;
        this.components = components;
    }

    spawn(overrides: Array<[Id, unknown]> = []): EntityId {
        const entity = this.world.spawn();
        for (const [component, value] of this.components) {
            this.world.set(entity, component, value);
        }
        for (const [component, value] of overrides) {
            this.world.set(entity, component, value);
        }
        return entity;
    }

    extend(components: Array<[Id, unknown]>): Prefab {
        return new Prefab(this.world, [...this.components, ...components]);
    }
}
