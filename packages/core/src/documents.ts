import { createHash } from "node:crypto";
import {
  accessGrant,
  document,
  documentContentText,
  documentReturn,
  documentVersion,
  extractContentText,
  reviewAssignment,
  signature,
  putBlob,
  type Db,
} from "@ctms/db";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { withActor, type Actor } from "./actor.js";
import { permits, type Grant } from "./authz.js";

export interface UploadInput {
  tmfArtifactId: number;
  studyId: string;
  studySiteId?: string | null;
  personId?: string | null;
  // Append the version to exactly this document instead of resolving one by
  // artifact + scope (ADR-0025); the fields above are ignored in that case —
  // the document row already carries them.
  documentId?: string | null;
  title: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  // Always create a fresh document, even if a non-superseded one with the same
  // artifact + scope exists. Needed for per-visit records (trip reports): two
  // visits at one site share artifact and scope but are distinct documents.
  forceNew?: boolean;
  // Filing provenance (ADR-0011): the source system that filed this version
  // and its native reference. Absent for human uploads.
  sourceSystem?: string | null;
  sourceRef?: string | null;
}

/**
 * Create a document (or add a version to an existing non-superseded document
 * with the same artifact + scope) from uploaded bytes. New uploads always land
 * as pending_review; only an approval signature makes them effective.
 */
export async function uploadDocument(db: Db, actor: Actor, input: UploadInput) {
  const { sha256, sizeBytes } = await putBlob(input.bytes);
  // Content text (ADR-0022): derived search state, one row per content hash.
  // A failure here must never block the upload — the record is the bytes.
  try {
    const extracted = await extractContentText(input.bytes, input.mimeType);
    await db
      .insert(documentContentText)
      .values({
        sha256,
        status: extracted.status,
        content: extracted.content,
        extractor: extracted.extractor,
        charCount: extracted.content?.length ?? null,
      })
      .onConflictDoNothing();
  } catch {
    // leave it to pnpm db:extract-text to retry
  }
  return withActor(db, actor, async (tx) => {
    const scopeSite = input.studySiteId ?? null;
    const scopePerson = input.personId ?? null;
    const existing = input.documentId
      ? await tx.select().from(document).where(eq(document.id, input.documentId)).limit(1)
      : input.forceNew
        ? []
        : await tx
          .select()
          .from(document)
          .where(
            and(
              eq(document.tmfArtifactId, input.tmfArtifactId),
              eq(document.studyId, input.studyId),
              scopeSite ? eq(document.studySiteId, scopeSite) : isNull(document.studySiteId),
              scopePerson ? eq(document.personId, scopePerson) : isNull(document.personId),
              ne(document.status, "superseded"),
            ),
          )
          .limit(1);

    let doc = existing[0];
    if (input.documentId) {
      if (!doc) throw new Error("document not found");
      // A superseded document is closed history; its record never grows.
      if (doc.status === "superseded") {
        throw new Error("document is superseded; upload a new document instead");
      }
    }
    if (!doc) {
      const inserted = await tx
        .insert(document)
        .values({
          tmfArtifactId: input.tmfArtifactId,
          studyId: input.studyId,
          studySiteId: scopeSite,
          personId: scopePerson,
          title: input.title,
          status: "pending_review",
        })
        .returning();
      doc = inserted[0]!;
    } else if (doc.status === "effective" || doc.status === "returned") {
      // A new version of an effective document goes back through review; a
      // corrected version of a returned document does the same (ADR-0015).
      await tx
        .update(document)
        .set({ status: "pending_review" })
        .where(eq(document.id, doc.id));
    }

    const [{ next }] = (await tx.execute(sql`
      SELECT coalesce(max(version_number), 0) + 1 AS next
      FROM document_version WHERE document_id = ${doc.id}`)) as unknown as [
      { next: number },
    ];

    const versions = await tx
      .insert(documentVersion)
      .values({
        documentId: doc.id,
        versionNumber: Number(next),
        sha256,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes,
        uploadedBy: actor.personId ?? null,
        sourceSystem: input.sourceSystem ?? null,
        sourceRef: input.sourceRef ?? null,
      })
      .returning();
    return { document: doc, version: versions[0]!, sha256 };
  });
}

/**
 * Part 11 e-signature: records signer, meaning, timestamp, and a copy of the
 * version's content hash (§11.70 binding). An approval signature promotes the
 * document to effective and supersedes any sibling document of the same
 * artifact + scope.
 */
export async function signDocumentVersion(
  db: Db,
  actor: Actor,
  input: {
    documentVersionId: string;
    signerPersonId: string;
    meaning: "author" | "review" | "approval";
    // §11.200: how and when the signer re-authenticated. The API layer
    // verifies the ceremony; this layer records it (DB CHECK requires it).
    reauthMethod: "oidc_fresh_token" | "dev_token" | "seed_fixture";
    reauthAt: Date;
    effectiveDate?: string;
    expiresAt?: string;
  },
) {
  return withActor(db, actor, async (tx) => {
    const versions = await tx
      .select()
      .from(documentVersion)
      .where(eq(documentVersion.id, input.documentVersionId))
      .limit(1);
    const version = versions[0];
    if (!version) throw new Error("document version not found");

    // A returned version is never approvable: the fix is a corrected version
    // (ADR-0015). author/review attestations stay allowed.
    if (input.meaning === "approval") {
      const returns = await tx
        .select({ id: documentReturn.id })
        .from(documentReturn)
        .where(eq(documentReturn.documentVersionId, version.id))
        .limit(1);
      if (returns.length > 0) {
        throw new Error(
          "version was returned for correction; upload a corrected version instead",
        );
      }
    }

    const signatures = await tx
      .insert(signature)
      .values({
        documentVersionId: version.id,
        signerPersonId: input.signerPersonId,
        meaning: input.meaning,
        signedSha256: version.sha256,
        reauthMethod: input.reauthMethod,
        reauthAt: input.reauthAt,
      })
      .returning();

    if (input.meaning === "approval") {
      const docs = await tx
        .select()
        .from(document)
        .where(eq(document.id, version.documentId))
        .limit(1);
      const doc = docs[0]!;
      const effectiveDate =
        input.effectiveDate ?? new Date().toISOString().slice(0, 10);
      await tx
        .update(document)
        .set({
          status: "effective",
          effectiveDate,
          ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        })
        .where(eq(document.id, doc.id));
      // Supersede siblings covering the same requirement scope. Visit-linked
      // documents (trip reports etc.) are per-visit records, not competing
      // fulfillments: they neither supersede nor get superseded.
      const [{ visitLinked }] = (await tx.execute(sql`
        SELECT EXISTS (SELECT 1 FROM monitoring_visit_document mvd
                       WHERE mvd.document_id = ${doc.id}) AS "visitLinked"`)) as unknown as [
        { visitLinked: boolean },
      ];
      if (!visitLinked) {
        await tx
          .update(document)
          .set({ status: "superseded" })
          .where(
            and(
              eq(document.tmfArtifactId, doc.tmfArtifactId),
              eq(document.studyId, doc.studyId),
              doc.studySiteId
                ? eq(document.studySiteId, doc.studySiteId)
                : isNull(document.studySiteId),
              doc.personId
                ? eq(document.personId, doc.personId)
                : isNull(document.personId),
              eq(document.status, "effective"),
              ne(document.id, doc.id),
              sql`NOT EXISTS (SELECT 1 FROM monitoring_visit_document mvd
                              WHERE mvd.document_id = ${document.id})`,
            ),
          );
      }
    }
    return signatures[0]!;
  });
}

/**
 * Return-for-correction (ADR-0015): the review outcome besides approval. Only
 * the latest version of a pending_review document can be returned; the reason
 * is recorded as an immutable fact row and the document moves to 'returned'
 * until a corrected version arrives.
 */
export async function returnDocumentVersion(
  db: Db,
  actor: Actor,
  input: {
    documentVersionId: string;
    returnedByPersonId: string;
    reason: string;
  },
) {
  if (input.reason.trim().length === 0) {
    throw new Error("a return requires a documented reason");
  }
  return withActor(db, actor, async (tx) => {
    const versions = await tx
      .select()
      .from(documentVersion)
      .where(eq(documentVersion.id, input.documentVersionId))
      .limit(1);
    const version = versions[0];
    if (!version) throw new Error("document version not found");

    const docs = await tx
      .select()
      .from(document)
      .where(eq(document.id, version.documentId))
      .limit(1);
    const doc = docs[0]!;
    if (doc.status !== "pending_review") {
      throw new Error(`only a pending_review document can be returned (status: ${doc.status})`);
    }

    const [{ latest }] = (await tx.execute(sql`
      SELECT max(version_number) AS latest
      FROM document_version WHERE document_id = ${doc.id}`)) as unknown as [
      { latest: number },
    ];
    if (version.versionNumber !== Number(latest)) {
      throw new Error("only the latest version can be returned");
    }

    const returns = await tx
      .insert(documentReturn)
      .values({
        documentVersionId: version.id,
        returnedBy: input.returnedByPersonId,
        reason: input.reason.trim(),
      })
      .returning();

    await tx
      .update(document)
      .set({ status: "returned" })
      .where(eq(document.id, doc.id));

    return returns[0]!;
  });
}

/**
 * Assign a pending version to a named reviewer (ADR-0018). The assignment is
 * a fact row; it is finished the moment the version gains an approval
 * signature or a return — no completion flag exists. Reassignment inserts a
 * new row and the queue view reads the latest.
 */
export async function assignReview(
  db: Db,
  actor: Actor,
  input: {
    documentVersionId: string;
    assignedToPersonId: string;
    assignedByPersonId: string;
    dueDate?: string | null;
    note?: string | null;
  },
) {
  return withActor(db, actor, async (tx) => {
    const versions = await tx
      .select()
      .from(documentVersion)
      .where(eq(documentVersion.id, input.documentVersionId))
      .limit(1);
    const version = versions[0];
    if (!version) throw new Error("document version not found");

    const docs = await tx
      .select()
      .from(document)
      .where(eq(document.id, version.documentId))
      .limit(1);
    const doc = docs[0]!;
    if (doc.status !== "pending_review") {
      throw new Error(
        `only a pending_review document can be assigned for review (status: ${doc.status})`,
      );
    }
    const [{ latest }] = (await tx.execute(sql`
      SELECT max(version_number) AS latest
      FROM document_version WHERE document_id = ${doc.id}`)) as unknown as [
      { latest: number },
    ];
    if (version.versionNumber !== Number(latest)) {
      throw new Error("only the latest version can be assigned for review");
    }

    // The assignee must actually be able to finish the review: an active
    // grant permitting 'approve' on this document's scope.
    const grants = (await tx
      .select({
        role: accessGrant.role,
        study_id: accessGrant.studyId,
        study_site_id: accessGrant.studySiteId,
      })
      .from(accessGrant)
      .where(
        and(eq(accessGrant.personId, input.assignedToPersonId), isNull(accessGrant.revokedAt)),
      )) as Grant[];
    if (
      !permits(grants, "approve", {
        studyId: doc.studyId,
        studySiteId: doc.studySiteId ?? undefined,
      })
    ) {
      throw new Error("assignee cannot approve this document (no covering grant)");
    }

    const rows = await tx
      .insert(reviewAssignment)
      .values({
        documentVersionId: version.id,
        assignedTo: input.assignedToPersonId,
        assignedBy: input.assignedByPersonId,
        dueDate: input.dueDate ?? null,
        note: input.note ?? null,
      })
      .returning();
    return rows[0]!;
  });
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
