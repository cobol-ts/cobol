import {findOccursClause,hasOccursClause} from "./cobol.occurs.clause";

describe("OCCURS clause lookup",()=>{
    const fixed={kind:"occurs" as const,count:3};
    const depending={kind:"occurs" as const,min:0,max:5,dependingOn:"ITEM-COUNT"};
    const usage={kind:"usage" as const,usage:"DISPLAY"};
    test("finds a fixed OCCURS without changing its identity",()=>{
        expect(findOccursClause([usage,fixed])).toBe(fixed);
        expect(hasOccursClause([usage,fixed])).toBe(true);
    });
    test("finds an ODO clause",()=>{
        expect(findOccursClause([usage,depending])).toBe(depending);
        expect(hasOccursClause([usage,depending])).toBe(true);
    });
    test("returns absence without creating a fallback clause",()=>{
        expect(findOccursClause([usage])).toBeUndefined();
        expect(hasOccursClause([usage])).toBe(false);
    });
});
