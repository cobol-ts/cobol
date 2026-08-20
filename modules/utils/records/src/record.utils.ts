export type NameAnd<T> = Record<string, T>

export type Env = NameAnd<string>

// for example
// Input {mygenius: ['training','mygenius'], jira: 'jira'}
//Output: {training: 'mygenius', mygenius: 'mygenius', jira: 'jira'}
export function invertObject<T>(obj: NameAnd<string | string[]>): NameAnd<string> {
    const inverted: NameAnd<string> = {};
    for (const key in obj) {
        const value = obj[key];
        if (Array.isArray(value))
            for (const item of value) inverted[item] = key;
        else inverted[value] = key;
    }
    return inverted;
}

