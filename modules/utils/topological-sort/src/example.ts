import {Graph, topologicalSort} from './topological.sort'

interface Calculation {
    name: string
    dependencies: Calculation[]
}

const graph: Graph<Calculation> = {
    displayString: calculation => calculation.name,
    children: calculation => calculation.dependencies
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

if ('errors' in result) {
    console.error(result.errors.join('\n'))
} else {
    for (const [index, generation] of result.value.entries()) {
        console.log(
            `Generation ${index + 1}: ${generation.map(n => n.name).join(', ')}`
        )
    }
}
