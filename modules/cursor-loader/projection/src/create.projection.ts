import {
    type CanonicalProjection,
    type PhysicalRecordContext,
    type PhysicalRecordDebugRenderer,
    type ProjectionDefinition,
    type ProjectionFactory,
    type ProjectionField,
    type ProjectionPhysicalRecord,
    type ProjectionSupport
} from "@cobol-ts/cursor-loader-types";

import {canonicalProjection} from "./projection.definition";


const REPRESENTATION = Symbol("projectionRepresentation");
const PHYSICAL_RECORD = Symbol("projectionPhysicalRecord");


type ProjectionParser<TRepresentation,TParserDetails,TProjectionPath> =
    ProjectionSupport<TRepresentation,TParserDetails,TProjectionPath>
    & PhysicalRecordDebugRenderer;


interface BoundProjection<TRepresentation> {
    [REPRESENTATION]: TRepresentation | undefined;
    [PHYSICAL_RECORD]: ProjectionPhysicalRecord | undefined;
}


type ProjectionAccessor<TRepresentation> =
    (this: BoundProjection<TRepresentation>) => number | string;


type ProjectionAccessors<TRepresentation> =
    Readonly<Record<string,ProjectionAccessor<TRepresentation>>>;


/**
 * Define one application projection.
 *
 * The application-facing interface is authoritative:
 *
 *     interface Customer {
 *         age(): number;
 *         name(): string;
 *     }
 *
 * ProjectionDefinition<Customer> ensures that every member is present and that
 * its declared projection type is compatible with the accessor return type.
 *
 * The returned definition is canonical: every field has an explicit path.
 */
export function defineProjection<TProjection>(
    definition: ProjectionDefinition<TProjection>
): CanonicalProjection<ProjectionDefinition<TProjection>> {
    return canonicalProjection(definition);
}


/**
 * Create the runtime factory for one projection.
 *
 * Projection paths are compiled here, once for this prepared source.
 *
 * context identifies the physical record from which the source details were
 * prepared. It is supplied only while compiling projection paths so parsers can
 * attach useful source and record provenance to setup failures. It is not
 * retained by the resulting accessors.
 *
 * Parsers which do not prepare their source may receive undefined.
 *
 * One accessor function is created for each projected field here. Those
 * functions are immutable and are shared by every reusable projection object
 * subsequently created by this factory.
 *
 * create()
 *     Creates one reusable projection object and installs references to the
 *     already-created accessor functions.
 *
 * bind()
 *     Associates that existing projection object with one representation and
 *     physical record.
 *
 * clear()
 *     Removes those lease-specific references.
 *
 * Normal row-to-row reuse therefore performs no projection-path compilation
 * and allocates no accessor functions.
 */
export function createProjection<TProjection,TRepresentation,TParserDetails,TProjectionPath>(
    parser: ProjectionParser<TRepresentation,TParserDetails,TProjectionPath>,
    details: TParserDetails,
    context: PhysicalRecordContext | undefined,
    definition: CanonicalProjection<ProjectionDefinition<TProjection>>
): ProjectionFactory<TProjection,TRepresentation> {
    const accessors = createProjectionAccessors(
        parser,
        details,
        context,
        definition
    );

    return {
        create(): TProjection {
            return createProjectionObject<TProjection,TRepresentation>(
                accessors
            );
        },

        bind(
            projection: TProjection,
            representation: TRepresentation,
            physicalRecord: ProjectionPhysicalRecord
        ): void {
            const bound =
                projection as TProjection & BoundProjection<TRepresentation>;

            if (bound[PHYSICAL_RECORD] !== undefined) {
                throw new Error("Projection is already bound");
            }

            bound[REPRESENTATION] = representation;
            bound[PHYSICAL_RECORD] = physicalRecord;
        },

        clear(projection: TProjection): void {
            const bound =
                projection as TProjection & BoundProjection<TRepresentation>;

            bound[REPRESENTATION] = undefined;
            bound[PHYSICAL_RECORD] = undefined;
        }
    };
}


/**
 * Compile all projection fields once for this factory.
 *
 * context is used only while compiling those paths. It is deliberately not
 * captured by the generated accessors; runtime record provenance comes from the
 * physical record supplied to bind().
 *
 * Each resulting accessor captures only source/factory-lifetime state:
 *
 *     parser
 *     details
 *     compiled projection path
 *     immutable field definition
 *
 * It does not capture a representation, preparation context or physical record.
 */
function createProjectionAccessors<TProjection,TRepresentation,TParserDetails,TProjectionPath>(
    parser: ProjectionParser<TRepresentation,TParserDetails,TProjectionPath>,
    details: TParserDetails,
    context: PhysicalRecordContext | undefined,
    definition: CanonicalProjection<ProjectionDefinition<TProjection>>
): ProjectionAccessors<TRepresentation> {
    const accessors: Record<string,ProjectionAccessor<TRepresentation>> = {};

    for (const name in definition) {
        accessors[name] = createProjectionAccessor(
            parser,
            details,
            context,
            definition[name]
        );
    }

    return accessors;
}


/**
 * Create one reusable projection object.
 *
 * The projection object owns only its two mutable lease-specific bindings.
 *
 * Accessor functions themselves are not recreated here. References to the
 * factory's shared immutable accessor functions are installed instead.
 */
function createProjectionObject<TProjection,TRepresentation>(
    accessors: ProjectionAccessors<TRepresentation>
): TProjection {
    const projection = {
        [REPRESENTATION]: undefined,
        [PHYSICAL_RECORD]: undefined
    } as TProjection
        & BoundProjection<TRepresentation>
        & Record<string,ProjectionAccessor<TRepresentation>>;

    const writable: Record<string,ProjectionAccessor<TRepresentation>> =
        projection;

    for (const name in accessors) {
        writable[name] = accessors[name];
    }

    return projection;
}


/**
 * Compile one canonical field into its shared application-facing accessor.
 *
 * The authoring string path is converted here into the parser-specific runtime
 * path exactly once.
 *
 * The preparation context is supplied to compileProjectionPath() so failures
 * during source-dependent path compilation can identify the physical source and
 * preparation record. It is discarded immediately after compilation.
 *
 * Examples:
 *
 *     CSV
 *         ["age"] -> 2
 *
 *     JSON
 *         ["customer","age"] -> ["customer","age"]
 *
 * The resulting compiled path is captured by the accessor and used directly
 * whenever that field is requested.
 */
function createProjectionAccessor<TRepresentation,TParserDetails,TProjectionPath>(
    parser: ProjectionParser<TRepresentation,TParserDetails,TProjectionPath>,
    details: TParserDetails,
    context: PhysicalRecordContext | undefined,
    field: ProjectionField
): ProjectionAccessor<TRepresentation> {
    const path = parser.compileProjectionPath(
        details,
        context,
        field.path
    );

    switch (field.type) {
        case "integer":
            return function (
                this: BoundProjection<TRepresentation>
            ): number {
                const physicalRecord = requirePhysicalRecord(this);

                try {
                    return parser.integer(
                        this[REPRESENTATION] as TRepresentation,
                        details,
                        path
                    );
                } catch (error) {
                    throw projectionAccessError(
                        parser,
                        physicalRecord,
                        field,
                        error
                    );
                }
            };

        case "float":
            return function (
                this: BoundProjection<TRepresentation>
            ): number {
                const physicalRecord = requirePhysicalRecord(this);

                try {
                    return parser.float(
                        this[REPRESENTATION] as TRepresentation,
                        details,
                        path
                    );
                } catch (error) {
                    throw projectionAccessError(
                        parser,
                        physicalRecord,
                        field,
                        error
                    );
                }
            };

        case "character":
            return function (
                this: BoundProjection<TRepresentation>
            ): string {
                const physicalRecord = requirePhysicalRecord(this);

                try {
                    return parser.character(
                        this[REPRESENTATION] as TRepresentation,
                        details,
                        path
                    );
                } catch (error) {
                    throw projectionAccessError(
                        parser,
                        physicalRecord,
                        field,
                        error
                    );
                }
            };

        case "string":
            return function (
                this: BoundProjection<TRepresentation>
            ): string {
                const physicalRecord = requirePhysicalRecord(this);

                try {
                    return parser.string(
                        this[REPRESENTATION] as TRepresentation,
                        details,
                        path
                    );
                } catch (error) {
                    throw projectionAccessError(
                        parser,
                        physicalRecord,
                        field,
                        error
                    );
                }
            };
    }
}


/**
 * physicalRecord is the authoritative bound-state marker because every active
 * projection lease necessarily has one.
 *
 * representation may legitimately have a type which includes undefined, so it
 * is not suitable as the bound/unbound sentinel.
 */
function requirePhysicalRecord<TRepresentation>(
    projection: BoundProjection<TRepresentation>
): ProjectionPhysicalRecord {
    const physicalRecord = projection[PHYSICAL_RECORD];

    if (physicalRecord === undefined) {
        throw new Error("Projection is not bound to a record");
    }

    return physicalRecord;
}


/**
 * Add physical provenance and format-specific debug context to a lazy
 * projection failure.
 *
 * Runtime projection failures use the currently bound physical record rather
 * than the preparation context. This identifies the actual data record which
 * failed and permits parser-specific rendering of its bytes.
 *
 * The original authoring path is retained for diagnostics. The parser-specific
 * compiled path is an implementation detail and is not exposed in errors.
 *
 * Diagnostic strings and the Error object are created only on failure.
 */
function projectionAccessError(
    parser: PhysicalRecordDebugRenderer,
    physicalRecord: ProjectionPhysicalRecord,
    field: ProjectionField,
    error: unknown
): Error {
    const path =
        field.path.length === 0
            ? "<root>"
            : field.path.join(".");

    const reason =
        error instanceof Error
            ? error.message
            : String(error);

    const debug = parser.toDebugString(
        physicalRecord,
        physicalRecord.startByte,
        physicalRecord.endByte
    );

    return new Error(
        `${physicalRecord.source}: record ${physicalRecord.recordNumber}: `
        + `projection ${path}: ${reason}\n`
        + debug
    );
}