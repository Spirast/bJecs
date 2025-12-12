import { Id } from "./types";

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
