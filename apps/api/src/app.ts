import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import {
  auditEvents,
  documentAuditTrail,
  documentDetail,
  expectedDocuments,
  listStudies,
  signDocumentVersion,
  siteStaff,
  studySites,
  syncExpectedDocuments,
  uploadDocument,
  verifyAuditChain,
  type Actor,
  type ExpectedStatus,
} from "@ctms/core";
import { blobPath, hasBlob, type Db, type Sql } from "@ctms/db";
import { readFile } from "node:fs/promises";
import { authMiddleware, configureTokens } from "./auth.js";
import {
  AuditEventSchema,
  DocumentDetailSchema,
  ErrorSchema,
  ExpectedDocumentSchema,
  ExpectedStatusSchema,
  SiteCompletenessSchema,
  StaffMemberSchema,
  StudySchema,
} from "./schemas.js";

type Env = { Variables: { actor: Actor } };

const security = [{ bearerAuth: [] }];
const json = <T extends z.ZodTypeAny>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});

export function buildApp(db: Db, sql: Sql) {
  configureTokens();
  const app = new OpenAPIHono<Env>();
  app.use("*", cors());

  app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    description: "Dev tokens: see .env.example (API_TOKEN_ADMIN / API_TOKEN_MONITOR).",
  });

  // Public: spec + interactive reference.
  app.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "ctms-core API",
      version: "0.1.0",
      description:
        "Regulatory-document backbone for clinical trials. Expected-vs-actual document state, immutable versions, Part 11-style signatures, and a hash-chained audit trail — all queryable. The web dashboard consumes exactly this API.",
    },
  });
  app.get("/docs", (c) =>
    c.html(`<!doctype html><html><head><title>ctms-core API</title></head><body>
<script id="api-reference" data-url="/openapi.json"></script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body></html>`),
  );

  app.use("/studies/*", authMiddleware(sql));
  app.use("/study-sites/*", authMiddleware(sql));
  app.use("/documents/*", authMiddleware(sql));
  app.use("/document-versions/*", authMiddleware(sql));
  app.use("/audit-events", authMiddleware(sql));
  app.use("/audit-chain/*", authMiddleware(sql));
  app.use("/files/*", authMiddleware(sql));

  app.openapi(
    createRoute({
      method: "get",
      path: "/studies",
      security,
      summary: "List studies",
      responses: { 200: json(z.array(StudySchema), "Studies") },
    }),
    async (c) => c.json((await listStudies(sql)) as never, 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/studies/{studyId}/sites",
      security,
      summary: "Sites with completeness rollups",
      request: { params: z.object({ studyId: z.string().uuid() }) },
      responses: { 200: json(z.array(SiteCompletenessSchema), "Per-site completeness") },
    }),
    async (c) =>
      c.json((await studySites(sql, c.req.valid("param").studyId)) as never, 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/studies/{studyId}/expected-documents",
      security,
      summary: "Expected documents with derived status",
      description:
        "The heart of the system: every expected document for the study with its derived status (missing, pending_review, current, expiring_soon, expired, superseded). Filter by site, person, or status.",
      request: {
        params: z.object({ studyId: z.string().uuid() }),
        query: z.object({
          study_site_id: z.string().uuid().optional(),
          person_id: z.string().uuid().optional(),
          status: ExpectedStatusSchema.optional(),
        }),
      },
      responses: { 200: json(z.array(ExpectedDocumentSchema), "Expected documents") },
    }),
    async (c) => {
      const q = c.req.valid("query");
      const rows = await expectedDocuments(sql, {
        studyId: c.req.valid("param").studyId,
        studySiteId: q.study_site_id,
        personId: q.person_id,
        status: q.status as ExpectedStatus | undefined,
      });
      return c.json(rows as never, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/studies/{studyId}/sync-expected-documents",
      security,
      summary: "Re-materialize expected documents from requirement rules",
      request: { params: z.object({ studyId: z.string().uuid() }) },
      responses: { 200: json(z.object({ inserted: z.number().int() }), "Sync result") },
    }),
    async (c) =>
      c.json(
        { inserted: await syncExpectedDocuments(sql, c.req.valid("param").studyId) },
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/study-sites/{studySiteId}/staff",
      security,
      summary: "Site staff roster with open-item counts",
      request: { params: z.object({ studySiteId: z.string().uuid() }) },
      responses: { 200: json(z.array(StaffMemberSchema), "Staff") },
    }),
    async (c) =>
      c.json((await siteStaff(sql, c.req.valid("param").studySiteId)) as never, 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/documents",
      security,
      summary: "Upload a document (multipart)",
      description:
        "Creates a document — or a new version of the non-superseded document with the same artifact and scope — from the uploaded file. Uploads always land as pending_review; an approval signature makes them effective.",
      request: {
        body: {
          content: {
            "multipart/form-data": {
              schema: z.object({
                file: z.custom<File>((v) => v instanceof File, "file required"),
                tmf_artifact_id: z.coerce.number().int(),
                study_id: z.string().uuid(),
                study_site_id: z.string().uuid().optional(),
                person_id: z.string().uuid().optional(),
                title: z.string().min(1),
              }),
            },
          },
        },
      },
      responses: {
        201: json(
          z.object({
            document_id: z.string().uuid(),
            version_id: z.string().uuid(),
            version_number: z.number().int(),
            sha256: z.string().length(64),
          }),
          "Created",
        ),
        400: json(ErrorSchema, "Invalid input"),
      },
    }),
    async (c) => {
      const form = c.req.valid("form");
      const bytes = new Uint8Array(await form.file.arrayBuffer());
      const result = await uploadDocument(db, c.get("actor"), {
        tmfArtifactId: form.tmf_artifact_id,
        studyId: form.study_id,
        studySiteId: form.study_site_id ?? null,
        personId: form.person_id ?? null,
        title: form.title,
        fileName: form.file.name,
        mimeType: form.file.type || "application/octet-stream",
        bytes,
      });
      return c.json(
        {
          document_id: result.document.id,
          version_id: result.version.id,
          version_number: result.version.versionNumber,
          sha256: result.sha256,
        },
        201,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/documents/{documentId}",
      security,
      summary: "Document detail: versions and signatures",
      request: { params: z.object({ documentId: z.string().uuid() }) },
      responses: {
        200: json(DocumentDetailSchema, "Document detail"),
        404: json(ErrorSchema, "Not found"),
      },
    }),
    async (c) => {
      const detail = await documentDetail(sql, c.req.valid("param").documentId);
      if (!detail) return c.json({ error: "document not found" }, 404);
      return c.json(detail as never, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/documents/{documentId}/audit",
      security,
      summary: "Full audit trail for a document, its versions, and signatures",
      request: { params: z.object({ documentId: z.string().uuid() }) },
      responses: { 200: json(z.array(AuditEventSchema), "Audit events") },
    }),
    async (c) =>
      c.json(
        (await documentAuditTrail(sql, c.req.valid("param").documentId)) as never,
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/document-versions/{versionId}/sign",
      security,
      summary: "Apply a Part 11 e-signature to a document version",
      description:
        "Records signer, meaning, timestamp, and the version's content hash (§11.70 binding). meaning=approval promotes the document to effective and supersedes siblings of the same artifact + scope.",
      request: {
        params: z.object({ versionId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                meaning: z.enum(["author", "review", "approval"]),
                effective_date: z.string().date().optional(),
                expires_at: z.string().date().optional(),
              }),
            },
          },
        },
      },
      responses: {
        201: json(
          z.object({ signature_id: z.string().uuid(), signed_sha256: z.string() }),
          "Signed",
        ),
        400: json(ErrorSchema, "Invalid input"),
      },
    }),
    async (c) => {
      const actor = c.get("actor");
      if (!actor.personId) {
        return c.json({ error: "signing requires a person-linked token" }, 400);
      }
      const body = c.req.valid("json");
      const sig = await signDocumentVersion(db, actor, {
        documentVersionId: c.req.valid("param").versionId,
        signerPersonId: actor.personId,
        meaning: body.meaning,
        effectiveDate: body.effective_date,
        expiresAt: body.expires_at,
      });
      return c.json({ signature_id: sig.id, signed_sha256: sig.signedSha256 }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/audit-events",
      security,
      summary: "Query the audit trail",
      request: {
        query: z.object({
          entity_type: z.string().optional(),
          entity_id: z.string().optional(),
          limit: z.coerce.number().int().max(500).optional(),
        }),
      },
      responses: { 200: json(z.array(AuditEventSchema), "Audit events") },
    }),
    async (c) => {
      const q = c.req.valid("query");
      return c.json(
        (await auditEvents(sql, {
          entityType: q.entity_type,
          entityId: q.entity_id,
          limit: q.limit,
        })) as never,
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/audit-chain/verify",
      security,
      summary: "Recompute and verify the audit-trail hash chain",
      responses: {
        200: json(
          z.object({
            events: z.number().int(),
            valid: z.boolean(),
            problems: z.array(z.record(z.any())),
          }),
          "Verification result",
        ),
      },
    }),
    async (c) => {
      const { events, problems } = await verifyAuditChain(sql);
      return c.json(
        { events, valid: problems.length === 0, problems: [...problems] },
        200,
      );
    },
  );

  // Content-addressed file download (documented informally; binary response).
  app.get("/files/:sha256", async (c) => {
    const sha = c.req.param("sha256");
    if (!/^[0-9a-f]{64}$/.test(sha) || !hasBlob(sha)) {
      return c.json({ error: "file not found" }, 404);
    }
    const bytes = await readFile(blobPath(sha));
    return c.body(new Uint8Array(bytes), 200, {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${sha}.pdf"`,
    });
  });

  return app;
}
