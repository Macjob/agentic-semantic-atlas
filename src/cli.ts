/**
 * ASA/0 command-line interface.
 *
 *   npm run asa -- concept build examples/concept.example.json
 *   npm run asa -- concept inspect bafy...
 *   npm run asa -- demo
 */

import { readFile } from "node:fs/promises"
import { conceptCID, verifyBytes } from "./concept/cid.js"
import { assertConceptCore, type ConceptCore } from "./concept/types.js"
import { decodeConcept } from "./concept/canonical.js"
import { LocalStore } from "./store/local-store.js"
import { LocalResolver } from "./store/resolver.js"

const USAGE = `Usage:
  asa concept build <file.json>    compute the CID and cache the concept locally
  asa concept inspect <cid>        resolve from the local cache and print the concept
  asa demo                         run the two-agent demonstration`

async function main(argv: string[]): Promise<number> {
  const [command, subcommand, ...args] = argv

  if (command === "demo") {
    const { runDemo } = await import("./demo.js")
    await runDemo()
    return 0
  }

  if (command === "concept" && subcommand === "build") {
    const file = args[0]
    if (!file) {
      console.error(USAGE)
      return 1
    }
    const json: unknown = JSON.parse(await readFile(file, "utf8"))
    assertConceptCore(json)
    const { cid, bytes } = await conceptCID(json as ConceptCore)
    await new LocalStore().put(cid, bytes)
    console.log("Concept CID:")
    console.log(cid)
    return 0
  }

  if (command === "concept" && subcommand === "inspect") {
    const cid = args[0]
    if (!cid) {
      console.error(USAGE)
      return 1
    }
    const bytes = await new LocalResolver(new LocalStore()).resolve(cid)
    if (bytes === null) {
      console.error(`Concept ${cid} not found in local store (.asa/objects/).`)
      return 1
    }
    const core = decodeConcept(bytes)
    const verified = await verifyBytes(bytes, cid)
    console.log(JSON.stringify(core, null, 2))
    console.log(`Verification: ${verified ? "OK" : "FAILED"} (CIDv1 / dag-cbor / sha2-256)`)
    return verified ? 0 : 1
  }

  console.error(USAGE)
  return command === "help" || command === "--help" ? 0 : 1
}

process.exitCode = await main(process.argv.slice(2))
