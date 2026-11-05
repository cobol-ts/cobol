import {
    Graph,
    Dependencies,
    discoverDependencies,
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

function summary(count: number): string {
    return `Cannot sort the dependency graph: ${count} circular dependency group${count === 1 ? '' : 's'} found. Each group may require one or more dependencies to be removed or changed.`
}

function cycleMessage(number: number, path: string): string {
    return `Cycle ${number}: ${path}. These nodes depend on one another, so none can be calculated first.`
}
describe('discovery limits and identity', () => {
    it('stops at maxNodes even for a high-fan-out root', () => {
        const children = Array.from({length: 10_000}, (_, i) => node(String(i)))
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

    it('does not process shared dependencies repeatedly', () => {
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

    it('allows exactly maxNodes distinct nodes', () => {
        const a = node('A')
        const b = node('B', [a])

        expect(topologicalSort(graph, [b], {maxNodes: 2})).toEqual({
            value: [[a], [b]]
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

        expect(topologicalSort(noDisplayGraph, [b])).toEqual({
            value: [[a], [b]]
        })
    })
})

describe('bounded cycle computation', () => {
    it('counts all cycles but retains only the requested number', () => {
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
        expect(result.components.length).toEqual(10)
        expect(result.components.flat()).toEqual(nodes.slice(0, 10))
    })

    it('does not retain blocked non-cyclic nodes', () => {
        const a = node('A')
        const b = node('B', [a])
        a.dependencies = [b]

        const blocked = node('Blocked', [a])

        const result = findCyclicComponents(
            dependencyMap(a, b, blocked),
            new Set([a, b, blocked]),
            10
        )

        expect(result.total).toEqual(1)
        expect(result.components.map(c => new Set(c))).toEqual([
            new Set([a, b])
        ])
    })

    it('does not use displayString to select cycle paths', () => {
        const a = node('Z')
        const b = node('A', [a])
        const c = node('M', [b])
        a.dependencies = [c]

        expect(findCyclePath(
            dependencyMap(a, b, c),
            [a, b, c]
        )).toEqual([a, c, b, a])
    })

    it('reports the total number of cycles while displaying only 100', () => {
        const roots = Array.from({length: 101}, (_, i) => {
            const n = node(`N${String(i).padStart(3, '0')}`)
            n.dependencies = [n]
            return n
        })

        expect(topologicalSort(graph, roots)).toEqual({
            errors: [
                summary(101),
                ...roots.slice(0, 100).map((n, i) =>
                    cycleMessage(i + 1, `${n.name} → ${n.name}`)
                ),
                'Showing the first 100 of 101 circular dependency groups. Resolve these and run the sort again to see the remaining groups.'
            ]
        })
    })
})
