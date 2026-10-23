import type {CompiledCobolGroup} from "@cobol-ts/layout";

/** The source AST is retained by the compiled layout. Scanning its clauses
 * needs no callback allocation, including on a hot projected-array read. */
type Clause = CompiledCobolGroup["source"]["clauses"][number];
type OccursClause = Extract<Clause,{kind:"occurs"}>;

export function findOccursClause(clauses:readonly Clause[]):OccursClause|undefined {
    for(const clause of clauses) if(clause.kind==="occurs") return clause;
    return undefined;
}

export function hasOccursClause(clauses:readonly Clause[]):boolean {
    return findOccursClause(clauses)!==undefined;
}
