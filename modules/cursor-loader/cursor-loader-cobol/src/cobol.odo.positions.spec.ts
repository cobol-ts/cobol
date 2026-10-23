import {createDefaultPhysicalRecordConfig,createPhysicalRecord} from "@cobol-ts/cursor-record";
import {createCobolRecordState,cleanCobolRecordState} from "./cobol.parser";
import {occurrenceBoundary,positionBranch} from "./cobol.odo.positions";
import {parseCopybook} from "@cobol-ts/copybook";
import {compileCobolLayout} from "@cobol-ts/layout";
import {valueOrThrow} from "@cobol-ts/errors";

const compiled=valueOrThrow(compileCobolLayout(valueOrThrow(parseCopybook([
    "01 ROW.",
    "  05 COUNT PIC 9.",
    "  05 OUTERS OCCURS 0 TO 3 TIMES DEPENDING ON COUNT.",
    "    10 ITEMS OCCURS 0 TO 2 TIMES DEPENDING ON COUNT.",
    "      15 VALUE PIC X."
].join("\n"))),"odo-position-cache.cpy"));
const outer=compiled[0].kind==="group"?compiled[0].children.find(x=>x.kind==="group" && x.source.name.kind==="named" && x.source.name.name==="OUTERS"):undefined;
if(!outer || outer.kind!=="group") throw new Error("Missing OUTERS");
const inner=outer.children.find(x=>x.kind==="group" && x.source.name.kind==="named" && x.source.name.name==="ITEMS");
if(!inner || inner.kind!=="group") throw new Error("Missing ITEMS");

describe("record-owned ODO occurrence boundaries",()=>{
    test("calculates only missing starts and remembers the largest requested prefix",()=>{
        const state=createCobolRecordState(), positions=positionBranch(state.odoPositions,outer,[]);
        const calls:number[]=[];
        const extent=(i:number)=>{calls.push(i);return [8,24,16,32][i];};
        expect(occurrenceBoundary(positions,8,3,extent)).toBe(56);
        expect(calls).toEqual([0,1,2]);
        expect(occurrenceBoundary(positions,8,1,extent)).toBe(16);
        expect(calls).toEqual([0,1,2]);
        expect(occurrenceBoundary(positions,8,4,extent)).toBe(88);
        expect(calls).toEqual([0,1,2,3]);
        expect(positions.starts.size).toBe(5);
    });

    test("separates enclosing occurrence indices while reusing the jagged slots",()=>{
        const state=createCobolRecordState();
        const first=positionBranch(state.odoPositions,inner,[0]);
        const second=positionBranch(state.odoPositions,inner,[1]);
        expect(first).not.toBe(second);
        expect(occurrenceBoundary(first,16,1,()=>8)).toBe(24);
        expect(occurrenceBoundary(second,56,1,()=>16)).toBe(72);
        cleanCobolRecordState(state);
        expect(first.starts.size).toBe(0);
        expect(second.starts.size).toBe(0);
        expect(positionBranch(state.odoPositions,inner,[0])).toBe(first);
        expect(first.starts.values[1]).toBe(24); // high-water storage survives
        expect(occurrenceBoundary(first,100,1,()=>24)).toBe(124);
        expect(second.starts.size).toBe(0);
    });

    test("releasing a pooled physical record resets positions but retains storage and projection views",()=>{
        const config=createDefaultPhysicalRecordConfig({
            file:{},source:"leased-odo.fb",bufferSize:16,fillFileBuffer:async()=>0,
            createRecordState:createCobolRecordState,cleanRecordState:cleanCobolRecordState
        });
        const first=createPhysicalRecord(config);
        const cache=positionBranch(first.recordState.odoPositions,outer,[]);
        const projectionIdentity={};
        first.recordState.projectionViews.set(outer,projectionIdentity);
        expect(occurrenceBoundary(cache,24,2,()=>16)).toBe(56);
        first.close();
        expect(cache.starts.size).toBe(0);
        expect(cache.starts.values).toHaveLength(3);
        const second=createPhysicalRecord(config);
        expect(second).toBe(first);
        expect(positionBranch(second.recordState.odoPositions,outer,[])).toBe(cache);
        expect(second.recordState.projectionViews.get(outer)).toBe(projectionIdentity);
        expect(occurrenceBoundary(cache,72,1,()=>8)).toBe(80);
        second.close();
    });

    test("simultaneously leased pooled records have independent caches",()=>{
        const config=createDefaultPhysicalRecordConfig({
            file:{},source:"parallel-odo.fb",bufferSize:16,fillFileBuffer:async()=>0,
            createRecordState:createCobolRecordState,cleanRecordState:cleanCobolRecordState
        });
        const a=createPhysicalRecord(config),b=createPhysicalRecord(config);
        const aCache=positionBranch(a.recordState.odoPositions,outer,[]);
        const bCache=positionBranch(b.recordState.odoPositions,outer,[]);
        expect(occurrenceBoundary(aCache,8,2,()=>8)).toBe(24);
        expect(occurrenceBoundary(bCache,48,2,()=>16)).toBe(80);
        a.close();
        expect(bCache.starts.size).toBe(3);
        expect(occurrenceBoundary(bCache,48,2,()=>{throw new Error("should be cached");})).toBe(80);
        b.close();
    });
});
