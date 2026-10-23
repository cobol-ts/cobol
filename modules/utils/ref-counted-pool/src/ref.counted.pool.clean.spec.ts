import {createRefCountedPool} from "./ref.counted.pool";

describe("RefCountedPool final-release cleanup", () => {
    test("does not clean while a reference remains", () => {
        const cleaned: number[] = [];
        const pool = createRefCountedPool(() => ({value: 1}), value => {
            cleaned.push(value.value);
            value.value = 0;
        });
        const first = pool.acquire();
        pool.reuse(first);
        pool.release(first);
        expect(cleaned).toEqual([]);
        const second = pool.acquire();
        expect(second).not.toBe(first);
        pool.release(first);
        expect(cleaned).toEqual([1]);
        expect(first.value).toBe(0);
        pool.release(second);
    });

    test("cleans before the final-released object becomes available again", () => {
        const events: string[] = [];
        const pool = createRefCountedPool(
            () => ({count: 0, entries: [12, 24]}),
            value => {
                events.push("clean");
                value.count = 0;
            }
        );
        const first = pool.acquire();
        const backing = first.entries;
        first.count = 2;
        pool.release(first);
        expect(events).toEqual(["clean"]);
        const second = pool.acquire();
        expect(second).toBe(first);
        expect(second.count).toBe(0);
        expect(second.entries).toBe(backing);
        expect(second.entries).toEqual([12, 24]);
        pool.release(second);
        expect(events).toEqual(["clean", "clean"]);
    });

    test("the optional callback does not change existing no-clean reuse", () => {
        const pool = createRefCountedPool(() => ({state: "old"}));
        const first = pool.acquire();
        pool.release(first);
        const reused = pool.acquire();
        expect(reused).toBe(first);
        expect(reused.state).toBe("old");
        pool.release(reused);
    });

    test("a cleaner failure never puts a dirty object back into the pool", () => {
        let created = 0;
        const pool = createRefCountedPool(
            () => ({id: ++created}),
            value => { if (value.id === 1) throw new Error("clean failed"); }
        );
        const first = pool.acquire();
        expect(() => pool.release(first)).toThrow("clean failed");
        expect(() => pool.release(first)).toThrow(/already been fully released/);
        const second = pool.acquire();
        expect(second).not.toBe(first);
        expect(created).toBe(2);
        pool.release(second);
    });

    test("a cleaner cannot resurrect an object during final release", () => {
        let callbackResult = "";
        let pool: ReturnType<typeof createRefCountedPool<{id: number}>>;
        pool = createRefCountedPool(
            () => ({id: 1}),
            value => {
                try { pool.reuse(value); }
                catch (error) { callbackResult = (error as Error).message; }
            }
        );
        const first = pool.acquire();
        pool.release(first);
        expect(callbackResult).toMatch(/already been fully released/);
    });
});
