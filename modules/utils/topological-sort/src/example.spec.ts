
import {Graph, topologicalSort} from './topological.sort'
import {valueOrThrow} from "@cobol-ts/errors";

interface Calculation {
    name: string
    dependencies: Calculation[]
}

function normalise<Node>(generations: Node[][]): Set<Node>[] {
    return generations.map(generation => new Set(generation))
}

describe('example', () => {
    it('sorts a credit decision into dependency generations', () => {
        const graph: Graph<Calculation> = {
            displayString: n => n.name,
            children: n => n.dependencies
        }

        const customerData: Calculation = {
            name: 'Customer Data',
            dependencies: []
        }

        const accountData: Calculation = {
            name: 'Account Data',
            dependencies: []
        }

        const creditScore: Calculation = {
            name: 'Credit Score',
            dependencies: [customerData, accountData]
        }

        const affordability: Calculation = {
            name: 'Affordability',
            dependencies: [accountData]
        }

        const decision: Calculation = {
            name: 'Decision',
            dependencies: [creditScore, affordability]
        }

        const result = topologicalSort(graph, [decision])

        expect(normalise(valueOrThrow(result))).toEqual(normalise([
            [customerData, accountData],
            [creditScore, affordability],
            [decision]
        ]))
    })
})
