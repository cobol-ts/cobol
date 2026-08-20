export interface VariableDefn {
    regex: RegExp
    removeStartEnd: (s: string) => string
}

export const dollarsBracesVarDefn: VariableDefn = {
    regex: /(\$\{[^}]*\})/g,
    removeStartEnd: ref => ref.slice(2, ref.length - 1)
}
export const fulltextVariableDefn: VariableDefn = {
    regex: /(.*^)/g,
    removeStartEnd: ref => ref
}
export const mustachesVariableDefn: VariableDefn = {
    regex: /{{(.*)}}/g,
    removeStartEnd: ref => ref.slice(2, ref.length - 2)
}
export const colonPrefixedVarDefn: VariableDefn = {
    regex: /(:[a-zA-Z0-9._]+)/g,
    removeStartEnd: ref => ref.slice(1)
};
export const doubleXmlVariableDefn: VariableDefn = {
    regex: /<<([^>]*)>>/g,
    removeStartEnd: ref => ref.slice(2, ref.length - 2)
}