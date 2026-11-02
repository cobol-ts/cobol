/** Deterministic, ASCII DISPLAY, fixed-capacity 200-byte ODO benchmark records. */
import {checkedNonNegativeInteger,flags,RECORD_BYTES,type Counters,emptyCounters} from './benchmark.fixture';

export const ODO_MAX = 8;
export const ODO_CYCLE = 9;
export const ODO_ITEM_BYTES = 9;

export function odoValue(pattern:number,index:number):number {
    return 100_000 + pattern * 1_000 + index * 37;
}

/** Active item count cycles through 0..8, including both boundaries. */
export function odoCount(pattern:number):number {return pattern;}

export function makeOdoRecord(pattern:number):Buffer {
    if(!Number.isInteger(pattern) || pattern<0 || pattern>=ODO_CYCLE)
        throw new RangeError('ODO pattern must be an integer from 0 to 8');
    const {status,region,category,approved}=flags(pattern);
    const output=Buffer.alloc(RECORD_BYTES,0x20);
    output.write(String(odoCount(pattern)),0,1,'ascii');
    output.write(status+region+category+approved,1,4,'ascii');
    // Eight capacity slots are written, even when only the first COUNT are active.
    // The benchmark exercises fixed 200-byte physical framing, not variable framing.
    for(let index=0;index<ODO_MAX;index++)
        output.write(String(odoValue(pattern,index)).padStart(ODO_ITEM_BYTES,'0'),5+index*ODO_ITEM_BYTES,ODO_ITEM_BYTES,'ascii');
    return output;
}
export const ODO_PATTERN:Buffer=Buffer.concat(Array.from({length:ODO_CYCLE},(_,i)=>makeOdoRecord(i)));

/** Calculated from the independent generator formula, not the COBOL layout resolver. */
export function expectedOdoCounters(records:number):Counters {
    checkedNonNegativeInteger(records,'records');
    const result=emptyCounters();
    result.records=records;
    const cycles=Math.floor(records/ODO_CYCLE),remainder=records%ODO_CYCLE;
    for(let pattern=0;pattern<ODO_CYCLE;pattern++) {
        const multiplicity=cycles+(pattern<remainder?1:0);
        const count=odoCount(pattern);
        const sum=(count>0?odoValue(pattern,0):0)+(count>1?odoValue(pattern,1):0);
        const {status,region,category,approved}=flags(pattern);
        result.totalSum+=multiplicity*sum;
        if(status==='A' && region==='N') {
            result.activeNorthCount+=multiplicity;
            result.activeNorthSum+=multiplicity*sum;
        }
        if(category==='P' && approved==='Y') {
            result.approvedPremiumCount+=multiplicity;
            result.approvedPremiumSum+=multiplicity*sum;
        }
    }
    return result;
}
