# @cobol-ts/topological-sort

A generic TypeScript topological sort that groups nodes into **generations of independent work**. Each node can be processed only after its dependencies have been processed.

The library discovers reachable dependencies, handles shared nodes, detects circular dependencies, and returns either generations or descriptive errors using `ErrorsOr<T>` from `@cobol-ts/errors`.

## Installation

```bash
npm install @cobol-ts/topological-sort
```

## Usage

```typescript
import {Graph, topologicalSort} from '@cobol-ts/topological-sort'

interface Calculation {
    name: string
    dependencies: Calculation[]
}

const graph: Graph<Calculation> = {
    displayString: n => n.name,
    children: n => n.dependencies
}

const a: Calculation = {name: 'A', dependencies: []}
const b: Calculation = {name: 'B', dependencies: []}
const c: Calculation = {name: 'C', dependencies: [a, b]}
const d: Calculation = {name: 'D', dependencies: [c]}

const result = topologicalSort(graph, [d])
```

On success, `result` is:

```typescript
{value: [[a, b], [c], [d]]}
```

`A` and `B` can be processed independently. `C` must wait for both, and `D` must wait for `C`. Ordering **within** a generation is not significant.

## API

### `Graph<Node>`

```typescript
export interface Graph<Node> {
    displayString(n: Node): string
    children(n: Node): Node[]
}
```

`children` returns a node's **dependencies**, not its dependents. Node identity uses JavaScript `Map` and `Set` equality; object nodes use reference identity.

`displayString` is used **only to format errors**. It is never used for node identity, traversal, generation ordering, or cycle detection.

### `topologicalSort`

```typescript
export function topologicalSort<Node>(
    graph: Graph<Node>,
    roots: Node[],
    options?: TopologicalSortOptions
): ErrorsOr<Node[][]>
```

The sort discovers every node reachable from the supplied roots. It returns `{value: Node[][]}` on success or `{errors: string[]}` on failure. An empty graph returns `{value: []}`.

### `TopologicalSortOptions`

```typescript
export interface TopologicalSortOptions {
    maxNodes?: number
}
```

`maxNodes` is optional and defaults to **1,000,000 distinct nodes**. Override it if needed:

```typescript
const result = topologicalSort(graph, [d], {maxNodes: 2_000_000})
```

The limit is checked before scheduling a newly discovered node. Shared dependencies count once. `maxNodes` must be a non-negative safe integer; zero permits an empty graph. It limits nodes, **not** dependency edges or total memory use.

## Circular dependencies

For a graph with `A → B → C → A` (arrows mean “depends on”), the sort cannot produce generations. It returns an error identifying a representative cycle, such as:

```text
Cannot sort the dependency graph: 1 circular dependency group found. Each group may require one or more dependencies to be removed or changed.
Cycle 1: A → B → C → A. These nodes depend on one another, so none can be calculated first.
```

The library identifies cyclic **strongly connected components**. It reports one representative cycle per component, not every possible cycle. A node that depends on a cycle but is not itself cyclic is excluded from cycle diagnostics.

At most **100** cyclic components are retained for diagnostics. The algorithm still counts all cyclic components, and reports the total. Once the cap is reached, subsequent components are counted without retaining their members. Representative paths are constructed only for retained components. The reported cycles follow graph traversal order, not alphabetical order.

## Invalid graphs

The library reports:

- Null or undefined roots or dependencies.
- Self-dependencies and multi-node cycles.
- Multiple independent circular dependency groups.
- Exceeding `maxNodes` or supplying an invalid `maxNodes` value.

Invalid dependency entries found during discovery are accumulated. Sorting and cycle detection proceed only if discovery succeeds. Exceeding the node limit stops discovery immediately.

The supplied `Graph` implementation must honour its TypeScript contract. Exceptions from `children` or `displayString`, or an invalid return value from `children`, are programming errors and are not converted to `ErrorsOr` results.

## Performance

Let **V** be the number of distinct reachable nodes and **E** the number of distinct dependency edges.

| Operation | Time complexity |
|---|---|
| Dependency discovery | O(V + E) |
| Building the reverse dependency index | O(V + E) |
| Sorting into generations | O(V + E) |
| Identifying cyclic components, when needed | O(V + E) |

All traversal is iterative, avoiding recursion-related call-stack overflow on deep graphs.

The implementation uses dependency discovery, Kahn's algorithm for generation sorting, iterative Tarjan strongly connected component detection, and iterative depth-first search to construct representative cycle paths. Cycle detection runs only when unresolved nodes remain after sorting.

Memory usage depends on the graph, its edges, and the output generations. A long chain necessarily produces many one-node generation arrays.

## Source and tests

- `src/topological.sort.ts` — discovery, generation sorting, cycle detection, and diagnostics.
- `src/topological.sort.spec.ts` — tests covering ordering, shared dependencies, node limits, deep graphs, and bounded cycle reporting.

The package uses `@cobol-ts/errors` for result handling and no external graph-processing library.
