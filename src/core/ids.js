// Derived identifiers.
import { sha256Hex, normaliseCode } from './hash.js';

/** Only the digest of a person's withdrawal code is stored; the code itself stays with the person. */
export const codeDigest = (code) => sha256Hex('withdrawal-code:' + normaliseCode(code));
/** A fresh pseudonym per release, so two recipients cannot join their datasets on a shared ID. */
export const recordIdFor = async (releaseId, subjectRef) => 'r_' + (await sha256Hex(`${releaseId}:${subjectRef}`)).slice(0, 16);
