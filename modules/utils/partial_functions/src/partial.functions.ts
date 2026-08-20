export interface PartialFunction<From, To> {
    isDefinedAt: ( from: From ) => boolean
    apply: ( from: From ) => To
}


export const chainOfResponsibility = <From, To> ( defaultFn: ( from: From ) => To, ...fns: PartialFunction<From, To>[] ) =>
    ( from: From ): To => {
        for ( let fn of fns )
            if ( fn.isDefinedAt ( from ) ) return fn.apply ( from )
        return defaultFn ( from )
    }