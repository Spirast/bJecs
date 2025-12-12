let nextId = 1;
export function generateId(): number {
    return nextId++;
}

export function deepClone<T>(obj: T): T {
    return game.GetService("HttpService").JSONDecode(
        game.GetService("HttpService").JSONEncode(obj)
    ) as T;
}
