
import {ErrorsOr} from '@cobol-ts/errors'

export interface Graph<Node> {
    displayString(n: Node): string
    children(n: Node): Node[]
}

export interface TopologicalSortOptions {
    maxNodes?: number
}

export type Dependencies<Node> = Map<Node, Set<Node>>

export interface DependencyIndex<Node> {
    counts: Map<Node, number>
    dependents: Map<Node, Node[]>
}

export interface SortResult<Node> {
    generations: Node[][]
    remaining: Set<Node>
}

export interface CyclicComponents<Node> {
    components: Node[][]
    total: number
}

export function discoverDependencies<Node>(
    graph: Graph<Node>,
    roots: Node[],
    options: TopologicalSortOptions = {}
): ErrorsOr<Dependencies<Node>> {
    const maxNodes = options.maxNodes ?? 1_000_000

    if (!Number.isSafeInteger(maxNodes) || maxNodes < 0)
        return {errors: [`maxNodes must be a non-negative safe integer; received ${maxNodes}.`]}

    const dependencies: Dependencies<Node> = new Map()
    const pending: Node[] = []
    const errors: string[] = []

    function schedule(node: Node): boolean {
        if (dependencies.has(node)) return true
        if (dependencies.size >= maxNodes) return false
        dependencies.set(node, new Set())
        pending.push(node)
        return true
    }

    for (const root of roots) {
        if (root == null) {
            errors.push('A root node is null or undefined. Please provide a valid root node.')
        } else if (!schedule(root)) {
            return {errors: [
                    ...errors,
                    `Dependency graph exceeds maxNodes (${maxNodes}). Increase the optional maxNodes limit if this graph is expected.`
                ]}
        }
    }

    while (pending.length > 0) {
        const node = pending.pop()!
        const children = dependencies.get(node)!

        for (const child of graph.children(node)) {
            if (child == null) {
                errors.push(`Node "${graph.displayString(node)}" has a null or undefined dependency. Please correct its children list.`)
            } else {
                if (!schedule(child))
                    return {errors: [
                            ...errors,
                            `Dependency graph exceeds maxNodes (${maxNodes}). Increase the optional maxNodes limit if this graph is expected.`
                        ]}
                children.add(child)
            }
        }
    }

    return errors.length > 0 ? {errors} : {value: dependencies}
}

export function buildDependencyIndex<Node>(
    dependencies: Dependencies<Node>
): DependencyIndex<Node> {
    const counts = new Map<Node, number>()
    const dependents = new Map<Node, Node[]>()

    for (const [node, children] of dependencies) {
        counts.set(node, children.size)

        for (const child of children) {
            const parents = dependents.get(child) ?? []
            parents.push(node)
            dependents.set(child, parents)
        }
    }

    return {counts, dependents}
}

export function sortGenerations<Node>(
    index: DependencyIndex<Node>
): SortResult<Node> {
    const counts = new Map(index.counts)
    const generations: Node[][] = []
    let ready: Node[] = []

    for (const [node, count] of counts) {
        if (count === 0) ready.push(node)
    }

    while (ready.length > 0) {
        generations.push(ready)
        const next: Node[] = []

        for (const node of ready) {
            for (const parent of index.dependents.get(node) ?? []) {
                const count = counts.get(parent)! - 1
                counts.set(parent, count)
                if (count === 0) next.push(parent)
            }
        }

        ready = next
    }

    const remaining = new Set<Node>()

    for (const [node, count] of counts) {
        if (count > 0) remaining.add(node)
    }

    return {generations, remaining}
}


export function findCyclicComponents<Node>(
    dependencies: Dependencies<Node>,
    remaining: Set<Node>,
    maxComponents = 100
): CyclicComponents<Node> {
    const index = new Map<Node, number>()
    const low = new Map<Node, number>()
    const stack: Node[] = []
    const onStack = new Set<Node>()
    const components: Node[][] = []

    let nextIndex = 0
    let total = 0

    interface Frame {
        node: Node
        parent?: Node
        children: Iterator<Node>
    }

    function enter(node: Node, parent?: Node): Frame {
        index.set(node, nextIndex)
        low.set(node, nextIndex++)
        stack.push(node)
        onStack.add(node)

        return {
            node,
            parent,
            children: (dependencies.get(node) ?? new Set<Node>()).values()
        }
    }

    for (const root of remaining) {
        if (index.has(root)) continue

        const frames: Frame[] = [enter(root)]

        while (frames.length > 0) {
            const frame = frames[frames.length - 1]
            const next = frame.children.next()

            if (!next.done) {
                const child = next.value

                if (!remaining.has(child)) continue

                if (!index.has(child)) {
                    frames.push(enter(child, frame.node))
                } else if (onStack.has(child)) {
                    low.set(
                        frame.node,
                        Math.min(low.get(frame.node)!, index.get(child)!)
                    )
                }

                continue
            }

            frames.pop()

            if (frame.parent !== undefined) {
                low.set(
                    frame.parent,
                    Math.min(low.get(frame.parent)!, low.get(frame.node)!)
                )
            }

            if (low.get(frame.node) === index.get(frame.node)) {
                const retain = components.length < maxComponents
                const component: Node[] = []
                let size = 0
                let member: Node

                do {
                    member = stack.pop()!
                    onStack.delete(member)
                    size++
                    if (retain) component.push(member)
                } while (member !== frame.node)

                if (
                    size > 1 ||
                    dependencies.get(frame.node)!.has(frame.node)
                ) {
                    total++
                    if (retain) components.push(component)
                }
            }
        }
    }

    return {components, total}
}


export function findCyclePath<Node>(
    dependencies: Dependencies<Node>,
    component: Node[]
): Node[] {
    if (component.length === 0)
        throw new Error('Cannot find a cycle in an empty component')

    const start = component[0]
    const allowed = new Set(component)
    const visited = new Set<Node>([start])
    const parent = new Map<Node, Node>()

    interface Frame {
        node: Node
        children: Iterator<Node>
    }

    function frame(node: Node): Frame {
        return {
            node,
            children: (dependencies.get(node) ?? new Set<Node>()).values()
        }
    }

    const frames: Frame[] = [frame(start)]

    while (frames.length > 0) {
        const current = frames[frames.length - 1]
        const next = current.children.next()

        if (next.done) {
            frames.pop()
            continue
        }

        const child = next.value

        if (!allowed.has(child)) continue

        if (child === start) {
            const path: Node[] = [current.node]

            while (path[path.length - 1] !== start)
                path.push(parent.get(path[path.length - 1])!)

            return [...path.reverse(), start]
        }

        if (!visited.has(child)) {
            visited.add(child)
            parent.set(child, current.node)
            frames.push(frame(child))
        }
    }

    throw new Error('A cyclic component must contain a cycle through its starting node')
}

export function formatCycleErrors<Node>(
    graph: Graph<Node>,
    cycles: Node[][],
    total: number = cycles.length
): string[] {
    const limit = 100
    const visible = cycles.slice(0, limit)

    return [
        `Cannot sort the dependency graph: ${total} circular dependency group${total === 1 ? '' : 's'} found. Each group may require one or more dependencies to be removed or changed.`,
        ...visible.map((cycle, i) =>
            `Cycle ${i + 1}: ${cycle.map(node => graph.displayString(node)).join(' → ')}. These nodes depend on one another, so none can be calculated first.`
        ),
        ...(total > limit ? [
            `Showing the first ${limit} of ${total} circular dependency groups. Resolve these and run the sort again to see the remaining groups.`
        ] : [])
    ]
}

export function topologicalSort<Node>(
    graph: Graph<Node>,
    roots: Node[],
    options: TopologicalSortOptions = {}
): ErrorsOr<Node[][]> {
    const discovered = discoverDependencies(graph, roots, options)
    if ('errors' in discovered) return discovered

    const dependencies = discovered.value
    const index = buildDependencyIndex(dependencies)
    const result = sortGenerations(index)

    if (result.remaining.size === 0)
        return {value: result.generations}

    const {components, total} = findCyclicComponents(
        dependencies,
        result.remaining
    )

    const cycles = components.map(component =>
        findCyclePath(dependencies, component)
    )

    return {errors: formatCycleErrors(graph, cycles, total)}
}
