import {createSimpleRecordPool, createReferenceCountedRecordPool} from './record.pool';

test('reuses a released object without calling its allocator again', () => {
    const pool = createSimpleRecordPool<{id: number}>();
    let allocations = 0;
    const create = () => ({id: ++allocations});
    const first = pool.acquire(create);
    pool.release(first);
    expect(pool.acquire(create)).toBe(first);
    expect(allocations).toBe(1);
});

test('does not return objects still borrowed', () => {
    const pool = createSimpleRecordPool<{id:number}>();
    let id = 0;
    const create = () => ({id:++id});
    const first = pool.acquire(create);
    expect(pool.acquire(create)).not.toBe(first);
});

test('reference-counted adapter preserves acquisition and reuse', () => {
    const pool = createReferenceCountedRecordPool<{id:number}>();
    let id = 0;
    const create = () => ({id: ++id});
    const first = pool.acquire(create);
    pool.release(first);
    expect(pool.acquire(create)).toBe(first);
    expect(id).toBe(1);
});

test('simple pool reuses one object over a million leases', () => {
    const pool = createSimpleRecordPool<{id: number}>();

    let allocations = 0;

    function create() {
        allocations++;
        return {id: allocations};
    }

    for (let i = 0; i < 1_000_000; i++) {
        const record = pool.acquire(create);
        pool.release(record);
    }

    expect(allocations).toBe(1);
});