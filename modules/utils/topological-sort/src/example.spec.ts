
import {ErrorsOr} from '@cobol-ts/errors'
import {Graph, topologicalSort} from './topological.sort'

interface Calculation {
    name: string
    dependencies: Calculation[]
}

function normalise<Node>(
    result: ErrorsOr<Node[][]>
): ErrorsOr<Set<Node>[]> {
    return 'errors' in result
        ? result
        : {value: result.value.map(generation => new Set(generation))}
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

        expect(normalise(topologicalSort(graph, [decision]))).toEqual({
            value: [
                new Set([customerData, accountData]),
                new Set([creditScore, affordability]),
                new Set([decision])
            ]
        })
    })
})
