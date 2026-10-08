import {
    type CanonicalProjection,
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


type ProjectionParser<TRepresentation> =
    ProjectionSupport<TRepresentation>
    & PhysicalRecordDebugRenderer;

interface BoundProjection<TRepresentation> {
    [REPRESENTATION]: TRepresentation | undefined;
    [PHYSICAL_RECORD]: ProjectionPhysicalRecord | undefined;
}

type ProjectionAccessor<TRepresentation> =
    (this: BoundProjection<TRepresentation>) => number | string;


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
 * ProjectionDefinition<Customer> ensures that every member is present and
 * that its declared projection type is compatible with the accessor return
 * type.
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
 * create()
 *     Creates one reusable projection object with its complete runtime shape.
 *
 * bind()
 *     Associates that existing object with one parser representation and one
 *     physical record. No object or accessor is allocated by bind().
 *
 * clear()
 *     Removes both lease-specific references so the projection may safely be
 *     retained and reused by a pool.
 *
 * The projection object never changes shape after create() returns.
 */
export function createProjection<TProjection,TRepresentation>(
    parser: ProjectionParser<TRepresentation>,
    definition: CanonicalProjection<ProjectionDefinition<TProjection>>
): ProjectionFactory<TProjection,TRepresentation> {
    return {
        create(): TProjection {
            return createProjectionObject(parser, definition);
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
 * Create one reusable projection object.
 *
 * This is an ordinary object. No prototype object is constructed and
 * Object.create() is not used.
 *
 * Accessor functions are own properties and are allocated only when this
 * reusable projection object itself is created.
 *
 * The hidden state slots are also installed immediately, so the runtime object
 * shape is complete before it is returned.
 */
function createProjectionObject<
    TProjection,
    TRepresentation
>(
    parser:
    ProjectionParser<TRepresentation>,
    definition:
    CanonicalProjection<
        ProjectionDefinition<TProjection>
    >
): TProjection {

    const projection:
        BoundProjection<TRepresentation>
        & Record<
        string,
        ProjectionAccessor<TRepresentation>
    > = {
        [REPRESENTATION]:
        undefined,

        [PHYSICAL_RECORD]:
        undefined
    };


    for (const name in definition) {
        projection[name] =
            createProjectionAccessor(
                parser,
                definition[name]
            );
    }


    return projection as TProjection;
}


/**
 * Compile one canonical field into its application-facing accessor.
 *
 * The parser and immutable field definition are captured for the lifetime of
 * the reusable projection object.
 *
 * No representation or physical record is captured by this closure. Those
 * lease-specific references live only in the two mutable Symbol slots and are
 * removed by clear().
 */
function createProjectionAccessor<TRepresentation>(
    parser: ProjectionParser<TRepresentation>,
    field: ProjectionField
): ProjectionAccessor<TRepresentation> {
    switch (field.type) {
        case "integer":
            return function (
                this: BoundProjection<TRepresentation>
            ): number {
                const physicalRecord = requirePhysicalRecord(this);

                try {
                    return parser.integer(
                        this[REPRESENTATION] as TRepresentation,
                        field.path
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
                        field.path
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
                        field.path
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
                        field.path
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
 * This check allocates nothing on the successful accessor path.
 *
 * representation may legitimately have a type which includes undefined, so it
 * is not used as the bound/unbound sentinel.
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
 * Diagnostic rendering happens only after projection access has failed.
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

    const debug =
        parser.toDebugString(
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
