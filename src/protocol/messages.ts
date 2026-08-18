/**
 * ASA/0 wire messages (JSON envelopes).
 *
 * Every envelope carries `asa: "0"`. `concept-ref` is the application
 * message: before negotiation it carries a full CID (optionally with an
 * inline fallback), after negotiation just the session alias integer.
 */

import type { FallbackCore } from "../concept/types.js"

export interface CapabilityAdvert {
  versions: string[]
  codecs: string[]
  hashes: string[]
  features: string[]
}

export type Envelope =
  | { asa: "0"; kind: "hello"; capabilities: CapabilityAdvert }
  | { asa: "0"; kind: "propose"; concepts: string[] }
  | { asa: "0"; kind: "unknown-concept"; cid: string }
  | { asa: "0"; kind: "provide"; cid: string; fallback: FallbackCore }
  | { asa: "0"; kind: "bind"; alias: number; cid: string }
  | { asa: "0"; kind: "refuse"; cid: string; reason: string }
  | { asa: "0"; kind: "unknown-alias"; alias: number }
  | { asa: "0"; kind: "concept-ref"; concept: string | number; fallback?: FallbackCore }

export function encodeEnvelope(envelope: Envelope): string {
  return JSON.stringify(envelope)
}

export function envelopeBytes(envelope: Envelope): number {
  return Buffer.byteLength(encodeEnvelope(envelope), "utf8")
}

export function decodeEnvelope(text: string): Envelope {
  const value: unknown = JSON.parse(text)
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { asa?: unknown }).asa !== "0" ||
    typeof (value as { kind?: unknown }).kind !== "string"
  ) {
    throw new Error("invalid ASA/0 envelope")
  }
  return value as Envelope
}
