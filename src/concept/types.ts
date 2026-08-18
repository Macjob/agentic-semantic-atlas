/**
 * ASA/0 concept model.
 *
 * The identity-bearing object is intentionally minimal:
 *   - asa         : type tag, fixed to "concept/v0"
 *   - definition  : the semantic definition (natural language)
 *   - constraints : optional machine-readable constraints
 *   - relations   : optional typed references to other concepts (by CID)
 *
 * Everything else (publisher, signatures, timestamps, embeddings,
 * translations, UI/registry metadata, mutable aliases) is deliberately
 * excluded from canonical identity.
 */

export interface ConceptRelation {
  predicate: string
  target: string
}

export interface ConceptCore {
  asa: "concept/v0"
  definition: string
  constraints?: Record<string, unknown>
  relations?: ConceptRelation[]
}

/**
 * Inline fallback payload used when a peer cannot resolve a CID.
 * Carries exactly the identity-bearing fields so the receiver can
 * recompute and verify the CID.
 */
export interface FallbackCore {
  definition: string
  constraints?: Record<string, unknown>
  relations?: ConceptRelation[]
}

export class ConceptValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ConceptValidationError"
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Runtime validation of a ConceptCore coming from JSON or a decoder. */
export function assertConceptCore(value: unknown): asserts value is ConceptCore {
  if (!isPlainObject(value)) {
    throw new ConceptValidationError("concept must be a JSON object")
  }
  if (value.asa !== "concept/v0") {
    throw new ConceptValidationError(`expected asa === "concept/v0", got ${JSON.stringify(value.asa)}`)
  }
  if (typeof value.definition !== "string" || value.definition.length === 0) {
    throw new ConceptValidationError("definition must be a non-empty string")
  }
  if (value.constraints !== undefined) {
    if (!isPlainObject(value.constraints)) {
      throw new ConceptValidationError("constraints must be an object")
    }
    for (const [key, entry] of Object.entries(value.constraints)) {
      if (entry === undefined) {
        throw new ConceptValidationError(`constraints.${key} is undefined; unsupported in canonical form`)
      }
    }
  }
  if (value.relations !== undefined) {
    if (!Array.isArray(value.relations)) {
      throw new ConceptValidationError("relations must be an array")
    }
    for (const relation of value.relations) {
      if (!isPlainObject(relation)) {
        throw new ConceptValidationError("each relation must be an object")
      }
      if (typeof relation.predicate !== "string" || relation.predicate.length === 0) {
        throw new ConceptValidationError("relation.predicate must be a non-empty string")
      }
      if (typeof relation.target !== "string" || relation.target.length === 0) {
        throw new ConceptValidationError("relation.target must be a non-empty string")
      }
    }
  }
}
