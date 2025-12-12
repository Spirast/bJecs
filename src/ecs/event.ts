import { Callback, IDisposable } from "./types";

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
