
import {ErrorsOr} from '@cobol-ts/errors'
import {
    Graph,
    Dependencies,
    discoverDependencies,
    buildDependencyIndex,
    sortGenerations,
    findCyclicComponents,
    findCyclePath,
    topologicalSort
} from './topological.sort'

interface TestNode {
    name: string
    dependencies: TestNode[]
}

function node(name: string, dependencies: TestNode[] = []): TestNode {
    return {name, dependencies}
}

const graph: Graph<TestNode> = {
    displayString: n => n.name,
    children: n => n.dependencies
}

function dependencyMap(...nodes: TestNode[]): Dependencies<TestNode> {
    return new Map(nodes.map(n => [n, new Set(n.dependencies)]))
}

function normalise<Node>(
    result: ErrorsOr<Node[][]>
): ErrorsOr<Set<Node>[]> {
    return 'errors' in result
        ? result
        : {value: result.value.map(generation => new Set(generation))}
}

function summary(count: number): string {
    return `Cannot sort the dependency graph: ${count} circular dependency group${count === 1 ? '' : 's'} found. Each group may require one or more dependencies to be removed or changed.`
}

function cycleMessage(number: number, path: string): string {
    return `Cycle ${number}: ${path}. These nodes depend on one another, so none can be calculated first.`
}

describe('topologicalSort', () => {
    it('sorts an empty graph', () => {
        expect(topologicalSort(graph, [])).toEqual({value: []})
    })

    it('sorts a single node', () => {
        const a = node('A')

        expect(normalise(topologicalSort(graph, [a]))).toEqual({
            value: [new Set([a])]
        })
    })

    it('sorts independent roots into one generation', () => {
        const a = node('A')
        const b = node('B')
        const c = node('C')

        expect(normalise(topologicalSort(graph, [a, b, c]))).toEqual({
            value: [new Set([a, b, c])]
        })
    })

    it('sorts a linear dependency chain', () => {
        const a = node('A')
        const b = node('B', [a])
        const c = node('C', [b])
        const d = node('D', [c])

        expect(normalise(topologicalSort(graph, [d]))).toEqual({
            value: [
                new Set([a]),
                new Set([b]),
                new Set([c]),
                new Set([d])
            ]
        })
    })

    it('sorts a diamond dependency graph', () => {
        const a = node('A')
        const b = node('B', [a])
        const c = node('C', [a])
        const d = node('D', [b, c])

        expect(normalise(topologicalSort(graph, [d]))).toEqual({
            value: [
                new Set([a]),
                new Set([b, c]),
                new Set([d])
            ]
        })
    })

    it('handles shared dependencies', () => {
        const shared = node('Shared')
        const a = node('A', [shared])
        const b = node('B', [shared])
        const c = node('C', [a, b])

        expect(normalise(topologicalSort(graph, [c]))).toEqual({
            value: [
                new Set([shared]),
                new Set([a, b]),
                new Set([c])
            ]
        })
    })

    it('deduplicates repeated dependencies', () => {
        const a = node('A')
        const b = node('B', [a, a, a])

        expect(normalise(topologicalSort(graph, [b]))).toEqual({
            value: [
                new Set([a]),
                new Set([b])
            ]
        })
    })

    it('uses node identity rather than display strings', () => {
        const a = node('Same')
        const b = node('Same')
        const c = node('Root', [a, b])

        expect(normalise(topologicalSort(graph, [c]))).toEqual({
            value: [
                new Set([a, b]),
                new Set([c])
            ]
        })
    })

    it('does not call displayString on a valid graph', () => {
        const a = node('A')
        const b = node('B', [a])

        const noDisplayGraph: Graph<TestNode> = {
            displayString: () => {
                throw new Error('displayString must not be called')
            },
            children: n => n.dependencies
        }

        expect(normalise(topologicalSort(noDisplayGraph, [b]))).toEqual({
            value: [
                new Set([a]),
                new Set([b])
            ]
        })
    })

    it('handles a deep dependency chain without recursion', () => {
        const first = node('0')
        let current = first

        for (let i = 1; i < 20_000; i++) {
            current = node(String(i), [current])
        }

        const result = topologicalSort(graph, [current])

        expect('value' in result ? result.value.length : result).toEqual(20_000)

        if ('value' in result) {
            expect(result.value[0]).toEqual([first])
            expect(result.value[19_999]).toEqual([current])
        }
    })
})

describe('discoverDependencies', () => {
    it('discovers all dependencies from the roots', () => {
        const a = node('A')
        const b = node('B', [a])
        const c = node('C', [a, b])

        expect(discoverDependencies(graph, [c])).toEqual({
            value: dependencyMap(c, a, b)
        })
    })

    it('calls children once for each distinct node', () => {
        const shared = node('Shared')
        const a = node('A', [shared])
        const b = node('B', [shared])
        const c = node('C', [shared])

        const calls = new Map<TestNode, number>()

        const countedGraph: Graph<TestNode> = {
            displayString: n => n.name,
            children: n => {
                calls.set(n, (calls.get(n) ?? 0) + 1)
                return n.dependencies
            }
        }

        const result = discoverDependencies(countedGraph, [a, b, c])

        expect('value' in result).toEqual(true)
        expect(calls.get(shared)).toEqual(1)
        expect(calls.get(a)).toEqual(1)
        expect(calls.get(b)).toEqual(1)
        expect(calls.get(c)).toEqual(1)
    })

    it('reports a null root', () => {
        expect(discoverDependencies(graph, [null as unknown as TestNode])).toEqual({
            errors: [
                'A root node is null or undefined. Please provide a valid root node.'
            ]
        })
    })

    it('reports an undefined root', () => {
        expect(discoverDependencies(graph, [undefined as unknown as TestNode])).toEqual({
            errors: [
                'A root node is null or undefined. Please provide a valid root node.'
            ]
        })
    })

    it('reports a null dependency', () => {
        const a = node('A', [null as unknown as TestNode])

        expect(discoverDependencies(graph, [a])).toEqual({
            errors: [
                'Node "A" has a null or undefined dependency. Please correct its children list.'
            ]
        })
    })

    it('reports an undefined dependency', () => {
        const a = node('A', [undefined as unknown as TestNode])

        expect(discoverDependencies(graph, [a])).toEqual({
            errors: [
                'Node "A" has a null or undefined dependency. Please correct its children list.'
            ]
        })
    })

    it('allows exactly maxNodes distinct nodes', () => {
        const a = node('A')
        const b = node('B', [a])

        expect(normalise(topologicalSort(graph, [b], {maxNodes: 2}))).toEqual({
            value: [
                new Set([a]),
                new Set([b])
            ]
        })
    })

    it('rejects graphs exceeding maxNodes', () => {
        const a = node('A')
        const b = node('B', [a])

        expect(topologicalSort(graph, [b], {maxNodes: 1})).toEqual({
            errors: [
                'Dependency graph exceeds maxNodes (1). Increase the optional maxNodes limit if this graph is expected.'
            ]
        })
    })

    it('enforces maxNodes during high-fan-out discovery', () => {
        const children = Array.from(
            {length: 10_000},
            (_, i) => node(String(i))
        )
        const root = node('Root', children)
        let processed = 0

        const countedGraph: Graph<TestNode> = {
            displayString: n => n.name,
            children: n => {
                processed++
                return n.dependencies
            }
        }

        expect(discoverDependencies(countedGraph, [root], {maxNodes: 10})).toEqual({
            errors: [
                'Dependency graph exceeds maxNodes (10). Increase the optional maxNodes limit if this graph is expected.'
            ]
        })

        expect(processed).toEqual(1)
    })

    it('allows an empty graph with maxNodes zero', () => {
        expect(topologicalSort(graph, [], {maxNodes: 0})).toEqual({
            value: []
        })
    })

    it('rejects a node when maxNodes is zero', () => {
        const a = node('A')

        expect(topologicalSort(graph, [a], {maxNodes: 0})).toEqual({
            errors: [
                'Dependency graph exceeds maxNodes (0). Increase the optional maxNodes limit if this graph is expected.'
            ]
        })
    })

    it('rejects a negative maxNodes', () => {
        expect(topologicalSort(graph, [], {maxNodes: -1})).toEqual({
            errors: [
                'maxNodes must be a non-negative safe integer; received -1.'
            ]
        })
    })

    it('rejects a fractional maxNodes', () => {
        expect(topologicalSort(graph, [], {maxNodes: 1.5})).toEqual({
            errors: [
                'maxNodes must be a non-negative safe integer; received 1.5.'
            ]
        })
    })

    it('rejects an unsafe maxNodes', () => {
        const limit = Number.MAX_SAFE_INTEGER + 1

        expect(topologicalSort(graph, [], {maxNodes: limit})).toEqual({
            errors: [
                `maxNodes must be a non-negative safe integer; received ${limit}.`
            ]
        })
    })
})

describe('sortGenerations', () => {
    it('groups independent dependencies into generations', () => {
        const a = node('A')
        const b = node('B')
        const c = node('C', [a, b])
        const d = node('D', [c])

        const index = buildDependencyIndex(dependencyMap(a, b, c, d))
        const result = sortGenerations(index)

        expect(result.generations.map(g => new Set(g))).toEqual([
            new Set([a, b]),
            new Set([c]),
            new Set([d])
        ])
        expect(result.remaining).toEqual(new Set())
    })

    it('leaves cyclic and blocked nodes unresolved', () => {
        const a = node('A')
        const b = node('B', [a])
        a.dependencies = [b]

        const blocked = node('Blocked', [a])
        const independent = node('Independent')

        const index = buildDependencyIndex(
            dependencyMap(a, b, blocked, independent)
        )
        const result = sortGenerations(index)

        expect(result.generations.map(g => new Set(g))).toEqual([
            new Set([independent])
        ])
        expect(result.remaining).toEqual(new Set([a, b, blocked]))
    })
})

describe('circular dependencies', () => {
    it('detects a self-dependency', () => {
        const a = node('A')
        a.dependencies = [a]

        expect(topologicalSort(graph, [a])).toEqual({
            errors: [
                summary(1),
                cycleMessage(1, 'A → A')
            ]
        })
    })

    it('detects a two-node cycle', () => {
        const a = node('A')
        const b = node('B', [a])
        a.dependencies = [b]

        const result = topologicalSort(graph, [a])

        expect('errors' in result).toEqual(true)

        if ('errors' in result) {
            expect(result.errors[0]).toEqual(summary(1))
            expect(result.errors.length).toEqual(2)
        }
    })

    it('detects a longer cycle', () => {
        const a = node('A')
        const b = node('B', [a])
        const c = node('C', [b])
        a.dependencies = [c]

        const result = topologicalSort(graph, [a])

        expect('errors' in result).toEqual(true)

        if ('errors' in result) {
            expect(result.errors[0]).toEqual(summary(1))
            expect(result.errors.length).toEqual(2)
        }
    })

    it('reports independent cycles separately', () => {
        const a = node('A')
        const b = node('B', [a])
        a.dependencies = [b]

        const c = node('C')
        const d = node('D', [c])
        c.dependencies = [d]

        const result = topologicalSort(graph, [a, c])

        expect('errors' in result).toEqual(true)

        if ('errors' in result) {
            expect(result.errors[0]).toEqual(summary(2))
            expect(result.errors.length).toEqual(3)
        }
    })

    it('does not report blocked nodes as cyclic', () => {
        const a = node('A')
        const b = node('B', [a])
        a.dependencies = [b]

        const blocked = node('Blocked', [a])

        const result = findCyclicComponents(
            dependencyMap(a, b, blocked),
            new Set([a, b, blocked])
        )

        expect(result.total).toEqual(1)
        expect(result.components.map(c => new Set(c))).toEqual([
            new Set([a, b])
        ])
    })

    it('reports one component containing multiple cycles', () => {
        const a = node('A')
        const b = node('B', [a])
        const c = node('C', [a])
        a.dependencies = [b, c]

        const result = findCyclicComponents(
            dependencyMap(a, b, c),
            new Set([a, b, c])
        )

        expect(result.total).toEqual(1)
        expect(result.components.map(c => new Set(c))).toEqual([
            new Set([a, b, c])
        ])
    })

    it('constructs a valid representative cycle path', () => {
        const a = node('A')
        const b = node('B', [a])
        const c = node('C', [b])
        a.dependencies = [c]

        expect(findCyclePath(
            dependencyMap(a, b, c),
            [a, b, c]
        )).toEqual([a, c, b, a])
    })

    it('does not use display strings to select a cycle path', () => {
        const a = node('Z')
        const b = node('A', [a])
        const c = node('M', [b])
        a.dependencies = [c]

        expect(findCyclePath(
            dependencyMap(a, b, c),
            [a, b, c]
        )).toEqual([a, c, b, a])
    })

    it('handles a deep cyclic graph without recursion', () => {
        const nodes = Array.from(
            {length: 20_000},
            (_, i) => node(String(i))
        )

        for (let i = 0; i < nodes.length; i++) {
            nodes[i].dependencies = [
                nodes[(i + 1) % nodes.length]
            ]
        }

        const dependencies = dependencyMap(...nodes)
        const result = findCyclicComponents(
            dependencies,
            new Set(nodes)
        )

        expect(result.total).toEqual(1)
        expect(result.components.length).toEqual(1)
        expect(new Set(result.components[0])).toEqual(new Set(nodes))
    })
})

describe('bounded cycle diagnostics', () => {
    it('counts all cycles while retaining only the requested number', () => {
        const nodes = Array.from({length: 1000}, (_, i) => {
            const n = node(String(i))
            n.dependencies = [n]
            return n
        })

        const result = findCyclicComponents(
            dependencyMap(...nodes),
            new Set(nodes),
            10
        )

        expect(result.total).toEqual(1000)
        expect(result.components).toEqual(
            nodes.slice(0, 10).map(n => [n])
        )
    })

    it('does not count non-cyclic components against the cap', () => {
        const independent = node('Independent')
        const a = node('A')
        const b = node('B')

        a.dependencies = [a]
        b.dependencies = [b]

        const result = findCyclicComponents(
            dependencyMap(independent, a, b),
            new Set([independent, a, b]),
            1
        )

        expect(result.total).toEqual(2)
        expect(result.components).toEqual([[a]])
    })

    it('supports a zero retention cap', () => {
        const a = node('A')
        const b = node('B')

        a.dependencies = [a]
        b.dependencies = [b]

        expect(findCyclicComponents(
            dependencyMap(a, b),
            new Set([a, b]),
            0
        )).toEqual({
            components: [],
            total: 2
        })
    })

    it('retains only the first large cyclic component', () => {
        const first = Array.from(
            {length: 1000},
            (_, i) => node(`A${i}`)
        )
        const second = Array.from(
            {length: 1000},
            (_, i) => node(`B${i}`)
        )

        for (let i = 0; i < first.length; i++) {
            first[i].dependencies = [
                first[(i + 1) % first.length]
            ]
        }

        for (let i = 0; i < second.length; i++) {
            second[i].dependencies = [
                second[(i + 1) % second.length]
            ]
        }

        const nodes = [...first, ...second]

        const result = findCyclicComponents(
            dependencyMap(...nodes),
            new Set(nodes),
            1
        )

        expect(result.total).toEqual(2)
        expect(result.components.length).toEqual(1)
        expect(new Set(result.components[0])).toEqual(new Set(first))
    })

    it('reports the total while displaying only 100 cycles', () => {
        const roots = Array.from({length: 101}, (_, i) => {
            const n = node(`N${String(i).padStart(3, '0')}`)
            n.dependencies = [n]
            return n
        })

        expect(topologicalSort(graph, roots)).toEqual({
            errors: [
                summary(101),
                ...roots.slice(0, 100).map(
                    (n, i) => cycleMessage(
                        i + 1,
                        `${n.name} → ${n.name}`
                    )
                ),
                'Showing the first 100 of 101 circular dependency groups. Resolve these and run the sort again to see the remaining groups.'
            ]
        })
    })
})
