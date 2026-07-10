import { createHash } from "node:crypto";
import {
  document,
  documentVersion,
  signature,
  putBlob,
  type Db,
} from "@ctms/db";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { withActor, type Actor } from "./actor.js";

export interface UploadInput {
  tmfArtifactId: number;
  studyId: string;
  studySiteId?: string | null;
  personId?: string | null;
  title: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

/**
 * Create a document (or add a version to an existing non-superseded document
 * with the same artifact + scope) from uploaded bytes. New uploads always land
 * as pending_review; only an approval signature makes them effective.
 */
export async function uploadDocument(db: Db, actor: Actor, input: UploadInput) {
  const { sha256, sizeBytes } = putBlob(input.bytes);
  return withActor(db, actor, async (tx) => {
    const scopeSite = input.studySiteId ?? null;
    const scopePerson = input.personId ?? null;
    const existing = await tx
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
    } else if (doc.status === "effective") {
      // New version of an effective document goes back through review.
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

    const signatures = await tx
      .insert(signature)
      .values({
        documentVersionId: version.id,
        signerPersonId: input.signerPersonId,
        meaning: input.meaning,
        signedSha256: version.sha256,
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
      // Supersede siblings covering the same requirement scope.
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
          ),
        );
    }
    return signatures[0]!;
  });
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
