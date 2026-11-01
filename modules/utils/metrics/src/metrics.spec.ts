import {MemoryMetrics,NullMetrics,NULL_METRICS,METRIC} from './metrics';

test('null counter has no externally observable mutable state',()=>{
    const nullMetrics=new NullMetrics();
    for(let n=0;n<10000;n++) nullMetrics.put(METRIC.ARRAY_ELEMENT);
    expect(nullMetrics.put(METRIC.RECORD_BORROW)).toBeUndefined();
    expect(NULL_METRICS).toBeInstanceOf(NullMetrics);
});
test('memory counters increment independently and start at zero',()=>{
    const m=new MemoryMetrics();
    expect(m.get('none')).toBe(0);
    for(let i=0;i<1234;i++) m.put('a');
    m.put('b');m.put('b');
    expect(m.get('a')).toBe(1234);
    expect(m.get('b')).toBe(2);
});
test('snapshots are detached and resets do not change them',()=>{
    const m=new MemoryMetrics();m.put('x');
    const s=m.snapshot();
    m.put('x');m.put('y');
    expect(Array.from(s)).toEqual([['x',1]]);
    expect(Array.from(m.snapshot())).toEqual([['x',2],['y',1]]);
    m.reset();expect(m.get('x')).toBe(0);expect(m.snapshot().size).toBe(0);
    expect(s.get('x')).toBe(1);
});
test('two instances do not share counts',()=>{
    const a=new MemoryMetrics(),b=new MemoryMetrics();
    a.put('shared');expect(b.get('shared')).toBe(0);
});
