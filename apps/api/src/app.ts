import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import {
  achieveMilestone,
  auditEvents,
  createActionItem,
  createIssue,
  createMilestone,
  documentAuditTrail,
  documentDetail,
  expectedDocuments,
  linkVisitDocument,
  listStudies,
  reportEnrollment,
  resolveActionItem,
  resolveIssue,
  returnDocumentVersion,
  scheduleVisit,
  signDocumentVersion,
  siteStaff,
  studyEnrollment,
  studyIssues,
  studyMilestones,
  studySites,
  studyVisits,
  syncExpectedDocuments,
  updateVisit,
  uploadDocument,
  verifyAuditChain,
  visitDetail,
  permits,
  type ExpectedStatus,
  type IssueStatus,
  type VisitStage,
} from "@ctms/core";
import { getBlob, type Db, type Sql } from "@ctms/db";
import {
  authMiddleware,
  authMode,
  configureTokens,
  requirePermission,
  verifyReauth,
  type Env,
} from "./auth.js";
import {
  ActionItemSchema,
  AuditEventSchema,
  DocumentDetailSchema,
  ErrorSchema,
  ExpectedDocumentSchema,
  ExpectedStatusSchema,
  IssueCategorySchema,
  IssueSchema,
  IssueSeveritySchema,
  IssueStatusSchema,
  MilestoneSchema,
  MonitoringVisitSchema,
  SiteCompletenessSchema,
  SiteEnrollmentSchema,
  StaffMemberSchema,
  StudySchema,
  VisitDetailSchema,
  VisitDocumentLinkSchema,
  VisitStageSchema,
  VisitTypeSchema,
} from "./schemas.js";

const security = [{ bearerAuth: [] }];
const json = <T extends z.ZodTypeAny>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});

export function buildApp(db: Db, sql: Sql) {
  const mode = authMode();
  if (mode === "dev") configureTokens();
  const app = new OpenAPIHono<Env>();
  app.use("*", cors());

  app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    description:
      mode === "oidc"
        ? "OIDC access token from the configured identity provider (OIDC_ISSUER)."
        : "Dev tokens: see .env.example (API_TOKEN_ADMIN / API_TOKEN_MONITOR).",
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

  // Authentication resolves the credential to a person + active grants; the
  // permission gate then matches the operation (GET = read, mutation = upload,
  // with sign/approve/administer carved out) against the grant scopes, resolved
  // from the path parameter. ADR-0008.
  const auth = authMiddleware(sql);
  const readOrUpload = (c: { req: { method: string } }) =>
    c.req.method === "GET" ? ("read" as const) : ("upload" as const);

  app.use("/studies", auth, requirePermission(sql, "read"));
  app.use(
    "/studies/:studyId/sync-expected-documents",
    auth,
    requirePermission(sql, "administer", "studyId"),
  );
  app.use("/studies/:studyId/*", auth, requirePermission(sql, readOrUpload, "studyId"));
  app.use(
    "/study-sites/:studySiteId/*",
    auth,
    requirePermission(sql, readOrUpload, "studySiteId"),
  );
  // POST /documents carries its study/site scope in the multipart body; the
  // handler completes the scope check after parsing.
  app.use("/documents", auth, requirePermission(sql, "upload"));
  app.use("/documents/:documentId", auth, requirePermission(sql, readOrUpload, "documentId"));
  app.use(
    "/documents/:documentId/*",
    auth,
    requirePermission(sql, readOrUpload, "documentId"),
  );
  app.use(
    "/document-versions/:versionId/sign",
    auth,
    requirePermission(
      sql,
      async (c) => {
        try {
          const body = (await c.req.json()) as { meaning?: string };
          return body?.meaning === "approval" ? "approve" : "sign";
        } catch {
          return "sign"; // malformed body: the route validator answers with 400
        }
      },
      "versionId",
    ),
  );
  // Returning is the other review outcome: it takes the same authority that
  // could approve (ADR-0015).
  app.use(
    "/document-versions/:versionId/return",
    auth,
    requirePermission(sql, "approve", "versionId"),
  );
  app.use("/audit-events", auth, requirePermission(sql, "read"));
  app.use("/audit-chain/*", auth, requirePermission(sql, "read"));
  app.use("/files/*", auth, requirePermission(sql, "read"));
  app.use(
    "/monitoring-visits/:visitId",
    auth,
    requirePermission(sql, readOrUpload, "visitId"),
  );
  app.use(
    "/monitoring-visits/:visitId/*",
    auth,
    requirePermission(sql, readOrUpload, "visitId"),
  );
  app.use(
    "/action-items/:actionItemId",
    auth,
    requirePermission(sql, readOrUpload, "actionItemId"),
  );
  app.use("/issues/:issueId", auth, requirePermission(sql, readOrUpload, "issueId"));
  app.use(
    "/milestones/:milestoneId",
    auth,
    requirePermission(sql, readOrUpload, "milestoneId"),
  );

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
                // Filing provenance (ADR-0011): set by source systems (e.g. an
                // EDC's filing worker), omitted for human uploads.
                source_system: z.string().min(1).max(200).optional(),
                source_ref: z.string().min(1).max(500).optional(),
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
        403: json(ErrorSchema, "Forbidden"),
      },
    }),
    async (c) => {
      const form = c.req.valid("form");
      // Scope arrives in the body, so the route middleware could only gate the
      // operation; the scope half of the check happens here.
      const scope = { studyId: form.study_id, studySiteId: form.study_site_id };
      if (!permits(c.get("grants"), "upload", scope)) {
        return c.json({ error: "requires 'upload' permission for this resource" }, 403);
      }
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
        sourceSystem: form.source_system ?? null,
        sourceRef: form.source_ref ?? null,
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
        "Records signer, meaning, timestamp, and the version's content hash (§11.70 binding). meaning=approval promotes the document to effective and supersedes siblings of the same artifact + scope. §11.200: the request must carry proof of re-authentication (reauth_token) — in OIDC mode a freshly issued token for the same subject, in dev mode the bearer token restated.",
      request: {
        params: z.object({ versionId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                meaning: z.enum(["author", "review", "approval"]),
                reauth_token: z.string().min(1),
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
        403: json(ErrorSchema, "Re-authentication failed"),
        409: json(ErrorSchema, "Not signable (e.g. version was returned for correction)"),
      },
    }),
    async (c) => {
      const actor = c.get("actor");
      if (!actor.personId) {
        return c.json({ error: "signing requires a person-linked token" }, 400);
      }
      const body = c.req.valid("json");
      const reauth = await verifyReauth(c, body.reauth_token);
      if (!reauth.ok) return c.json({ error: reauth.error }, 403);
      try {
        const sig = await signDocumentVersion(db, actor, {
          documentVersionId: c.req.valid("param").versionId,
          signerPersonId: actor.personId,
          meaning: body.meaning,
          reauthMethod: reauth.method,
          reauthAt: reauth.at,
          effectiveDate: body.effective_date,
          expiresAt: body.expires_at,
        });
        return c.json({ signature_id: sig.id, signed_sha256: sig.signedSha256 }, 201);
      } catch (e) {
        // Domain refusals (e.g. approving a returned version) are the client's
        // to fix, not server faults.
        return c.json({ error: e instanceof Error ? e.message : "sign failed" }, 409);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/document-versions/{versionId}/return",
      security,
      summary: "Return a pending version for correction",
      description:
        "The review outcome besides approval (ADR-0015): records who returned the version, when, and why as an immutable fact, and moves the document to 'returned' until a corrected version is uploaded. A returned version can never be approved. Requires the same 'approve' permission as an approval signature; not a signature, so no re-authentication.",
      request: {
        params: z.object({ versionId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({ reason: z.string().trim().min(1).max(2000) }),
            },
          },
        },
      },
      responses: {
        201: json(
          z.object({ return_id: z.string().uuid(), returned_at: z.string() }),
          "Returned",
        ),
        400: json(ErrorSchema, "Invalid input"),
        409: json(ErrorSchema, "Not returnable (not latest, or not pending review)"),
      },
    }),
    async (c) => {
      const actor = c.get("actor");
      if (!actor.personId) {
        return c.json({ error: "returning requires a person-linked token" }, 400);
      }
      try {
        const ret = await returnDocumentVersion(db, actor, {
          documentVersionId: c.req.valid("param").versionId,
          returnedByPersonId: actor.personId,
          reason: c.req.valid("json").reason,
        });
        return c.json(
          { return_id: ret.id, returned_at: ret.returnedAt.toISOString() },
          201,
        );
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "return failed" }, 409);
      }
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

  // --- Operational layer (ADR-0006): monitoring visits ----------------------

  app.openapi(
    createRoute({
      method: "get",
      path: "/studies/{studyId}/monitoring-visits",
      security,
      summary: "Monitoring visits with derived lifecycle stage",
      description:
        "Stage is derived by v_monitoring_visit_status from dated facts, the linked trip report's document status, and open action items — never stored.",
      request: {
        params: z.object({ studyId: z.string().uuid() }),
        query: z.object({
          study_site_id: z.string().uuid().optional(),
          stage: VisitStageSchema.optional(),
        }),
      },
      responses: { 200: json(z.array(MonitoringVisitSchema), "Visits") },
    }),
    async (c) => {
      const q = c.req.valid("query");
      const rows = await studyVisits(sql, {
        studyId: c.req.valid("param").studyId,
        studySiteId: q.study_site_id,
        stage: q.stage as VisitStage | undefined,
      });
      return c.json(rows as never, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/studies/{studyId}/monitoring-visits",
      security,
      summary: "Schedule a monitoring visit",
      request: {
        params: z.object({ studyId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                study_site_id: z.string().uuid(),
                visit_type: VisitTypeSchema,
                scheduled_date: z.string().date(),
                monitor_person_id: z.string().uuid().optional(),
              }),
            },
          },
        },
      },
      responses: { 201: json(z.object({ id: z.string().uuid() }), "Scheduled") },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const visit = await scheduleVisit(db, c.get("actor"), {
        studySiteId: body.study_site_id,
        visitType: body.visit_type,
        scheduledDate: body.scheduled_date,
        monitorPersonId: body.monitor_person_id ?? null,
      });
      return c.json({ id: visit.id }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/monitoring-visits/{visitId}",
      security,
      summary: "Visit detail: stage, linked documents, action items, issues",
      request: { params: z.object({ visitId: z.string().uuid() }) },
      responses: {
        200: json(VisitDetailSchema, "Visit detail"),
        404: json(ErrorSchema, "Not found"),
      },
    }),
    async (c) => {
      const detail = await visitDetail(sql, c.req.valid("param").visitId);
      if (!detail) return c.json({ error: "monitoring visit not found" }, 404);
      return c.json(detail as never, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/monitoring-visits/{visitId}",
      security,
      summary: "Record visit facts (conducted date, monitor, summary)",
      description:
        "Setting visit_date marks the visit conducted; the stage advances by derivation, not by a status write.",
      request: {
        params: z.object({ visitId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                scheduled_date: z.string().date().optional(),
                visit_date: z.string().date().nullable().optional(),
                monitor_person_id: z.string().uuid().nullable().optional(),
                summary: z.string().nullable().optional(),
              }),
            },
          },
        },
      },
      responses: {
        200: json(z.object({ id: z.string().uuid() }), "Updated"),
        404: json(ErrorSchema, "Not found"),
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const visit = await updateVisit(db, c.get("actor"), {
        monitoringVisitId: c.req.valid("param").visitId,
        scheduledDate: body.scheduled_date,
        visitDate: body.visit_date,
        monitorPersonId: body.monitor_person_id,
        summary: body.summary,
      });
      return c.json({ id: visit.id }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/monitoring-visits/{visitId}/documents",
      security,
      summary: "Upload a visit document (trip report, letters) and link it",
      description:
        "Creates a fresh document scoped to the visit's site (each visit's report is its own record, never a version of another visit's) and links it with the given kind. Approval-signing a linked trip report advances the visit stage.",
      request: {
        params: z.object({ visitId: z.string().uuid() }),
        body: {
          content: {
            "multipart/form-data": {
              schema: z.object({
                file: z.custom<File>((v) => v instanceof File, "file required"),
                // Defaults to the Site Monitoring Visit Report artifact (01.03.01).
                tmf_artifact_id: z.coerce.number().int().optional(),
                title: z.string().min(1),
                link_kind: VisitDocumentLinkSchema,
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
            sha256: z.string().length(64),
          }),
          "Uploaded and linked",
        ),
        404: json(ErrorSchema, "Not found"),
      },
    }),
    async (c) => {
      const visitId = c.req.valid("param").visitId;
      const [visit] = await sql`
        SELECT mv.id, mv.study_site_id, ss.study_id
        FROM monitoring_visit mv
        JOIN study_site ss ON ss.id = mv.study_site_id
        WHERE mv.id = ${visitId}`;
      if (!visit) return c.json({ error: "monitoring visit not found" }, 404);
      const form = c.req.valid("form");
      const actor = c.get("actor");
      let artifactId = form.tmf_artifact_id;
      if (artifactId === undefined) {
        const [artifact] = await sql`
          SELECT id FROM tmf_artifact WHERE code = '01.03.01'`;
        if (!artifact) return c.json({ error: "monitoring report artifact not seeded" }, 404);
        artifactId = artifact.id as number;
      }
      const result = await uploadDocument(db, actor, {
        tmfArtifactId: artifactId,
        studyId: visit.study_id,
        studySiteId: visit.study_site_id,
        personId: null,
        title: form.title,
        fileName: form.file.name,
        mimeType: form.file.type || "application/octet-stream",
        bytes: new Uint8Array(await form.file.arrayBuffer()),
        forceNew: true,
      });
      await linkVisitDocument(db, actor, {
        monitoringVisitId: visitId,
        documentId: result.document.id,
        linkKind: form.link_kind,
      });
      return c.json(
        { document_id: result.document.id, version_id: result.version.id, sha256: result.sha256 },
        201,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/monitoring-visits/{visitId}/document-links",
      security,
      summary: "Link an existing document to a visit",
      request: {
        params: z.object({ visitId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                document_id: z.string().uuid(),
                link_kind: VisitDocumentLinkSchema,
              }),
            },
          },
        },
      },
      responses: { 201: json(z.object({ id: z.string().uuid() }), "Linked") },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const link = await linkVisitDocument(db, c.get("actor"), {
        monitoringVisitId: c.req.valid("param").visitId,
        documentId: body.document_id,
        linkKind: body.link_kind,
      });
      return c.json({ id: link.id }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/monitoring-visits/{visitId}/action-items",
      security,
      summary: "Raise a visit action item",
      request: {
        params: z.object({ visitId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                description: z.string().min(1),
                due_date: z.string().date().optional(),
              }),
            },
          },
        },
      },
      responses: { 201: json(z.object({ id: z.string().uuid() }), "Created") },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const item = await createActionItem(db, c.get("actor"), {
        monitoringVisitId: c.req.valid("param").visitId,
        description: body.description,
        dueDate: body.due_date ?? null,
      });
      return c.json({ id: item.id }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/action-items/{actionItemId}",
      security,
      summary: "Resolve an action item",
      request: {
        params: z.object({ actionItemId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                resolution_note: z.string().optional(),
                resolved_at: z.string().date().optional(),
              }),
            },
          },
        },
      },
      responses: {
        200: json(z.object({ id: z.string().uuid() }), "Resolved"),
        400: json(ErrorSchema, "Invalid input"),
      },
    }),
    async (c) => {
      const actor = c.get("actor");
      if (!actor.personId) {
        return c.json({ error: "resolving requires a person-linked token" }, 400);
      }
      const body = c.req.valid("json");
      const item = await resolveActionItem(db, actor, {
        actionItemId: c.req.valid("param").actionItemId,
        resolvedBy: actor.personId,
        resolvedAt: body.resolved_at,
        resolutionNote: body.resolution_note ?? null,
      });
      return c.json({ id: item.id }, 200);
    },
  );

  // --- Operational layer: issues --------------------------------------------

  app.openapi(
    createRoute({
      method: "get",
      path: "/studies/{studyId}/issues",
      security,
      summary: "Issues and deviations with derived status",
      request: {
        params: z.object({ studyId: z.string().uuid() }),
        query: z.object({
          study_site_id: z.string().uuid().optional(),
          status: IssueStatusSchema.optional(),
          category: IssueCategorySchema.optional(),
          severity: IssueSeveritySchema.optional(),
        }),
      },
      responses: { 200: json(z.array(IssueSchema), "Issues") },
    }),
    async (c) => {
      const q = c.req.valid("query");
      const rows = await studyIssues(sql, {
        studyId: c.req.valid("param").studyId,
        studySiteId: q.study_site_id,
        status: q.status as IssueStatus | undefined,
        category: q.category,
        severity: q.severity,
      });
      return c.json(rows as never, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/studies/{studyId}/issues",
      security,
      summary: "Record an issue or protocol deviation",
      request: {
        params: z.object({ studyId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                study_site_id: z.string().uuid().optional(),
                monitoring_visit_id: z.string().uuid().optional(),
                category: IssueCategorySchema,
                severity: IssueSeveritySchema,
                title: z.string().min(1),
                description: z.string().optional(),
                identified_date: z.string().date(),
                due_date: z.string().date().optional(),
              }),
            },
          },
        },
      },
      responses: { 201: json(z.object({ id: z.string().uuid() }), "Created") },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const actor = c.get("actor");
      const created = await createIssue(db, actor, {
        studyId: c.req.valid("param").studyId,
        studySiteId: body.study_site_id ?? null,
        monitoringVisitId: body.monitoring_visit_id ?? null,
        category: body.category,
        severity: body.severity,
        title: body.title,
        description: body.description ?? null,
        identifiedDate: body.identified_date,
        identifiedBy: actor.personId ?? null,
        dueDate: body.due_date ?? null,
      });
      return c.json({ id: created.id }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/issues/{issueId}",
      security,
      summary: "Resolve an issue",
      request: {
        params: z.object({ issueId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                resolution_note: z.string().optional(),
                resolved_at: z.string().date().optional(),
              }),
            },
          },
        },
      },
      responses: {
        200: json(z.object({ id: z.string().uuid() }), "Resolved"),
        400: json(ErrorSchema, "Invalid input"),
      },
    }),
    async (c) => {
      const actor = c.get("actor");
      if (!actor.personId) {
        return c.json({ error: "resolving requires a person-linked token" }, 400);
      }
      const body = c.req.valid("json");
      const resolved = await resolveIssue(db, actor, {
        issueId: c.req.valid("param").issueId,
        resolvedBy: actor.personId,
        resolvedAt: body.resolved_at,
        resolutionNote: body.resolution_note ?? null,
      });
      return c.json({ id: resolved.id }, 200);
    },
  );

  // --- Operational layer: enrollment and milestones --------------------------

  app.openapi(
    createRoute({
      method: "get",
      path: "/studies/{studyId}/enrollment",
      security,
      summary: "Latest as-reported enrollment per site vs target",
      description:
        "Operational aggregates as reported by sites — never subject-level clinical data (EDC owns that; ADR-0006).",
      request: { params: z.object({ studyId: z.string().uuid() }) },
      responses: { 200: json(z.array(SiteEnrollmentSchema), "Per-site enrollment") },
    }),
    async (c) =>
      c.json((await studyEnrollment(sql, c.req.valid("param").studyId)) as never, 200),
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/study-sites/{studySiteId}/enrollment",
      security,
      summary: "Report enrollment counts as of a date (upsert)",
      description:
        "One row per (site, as_of_date); re-submitting the same date is an audited correction with before/after row images.",
      request: {
        params: z.object({ studySiteId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                as_of_date: z.string().date(),
                screened: z.number().int().min(0),
                enrolled: z.number().int().min(0),
                withdrawn: z.number().int().min(0),
                completed: z.number().int().min(0),
              }),
            },
          },
        },
      },
      responses: { 200: json(z.object({ id: z.string().uuid() }), "Reported") },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const actor = c.get("actor");
      const row = await reportEnrollment(db, actor, {
        studySiteId: c.req.valid("param").studySiteId,
        asOfDate: body.as_of_date,
        screened: body.screened,
        enrolled: body.enrolled,
        withdrawn: body.withdrawn,
        completed: body.completed,
        reportedBy: actor.personId ?? null,
      });
      return c.json({ id: row.id }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/studies/{studyId}/milestones",
      security,
      summary: "Study and site milestones, planned vs actual",
      request: { params: z.object({ studyId: z.string().uuid() }) },
      responses: { 200: json(z.array(MilestoneSchema), "Milestones") },
    }),
    async (c) =>
      c.json((await studyMilestones(sql, c.req.valid("param").studyId)) as never, 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/studies/{studyId}/milestones",
      security,
      summary: "Create a milestone",
      request: {
        params: z.object({ studyId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                study_site_id: z.string().uuid().optional(),
                name: z.string().min(1),
                planned_date: z.string().date(),
              }),
            },
          },
        },
      },
      responses: { 201: json(z.object({ id: z.string().uuid() }), "Created") },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const created = await createMilestone(db, c.get("actor"), {
        studyId: c.req.valid("param").studyId,
        studySiteId: body.study_site_id ?? null,
        name: body.name,
        plannedDate: body.planned_date,
      });
      return c.json({ id: created.id }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/milestones/{milestoneId}",
      security,
      summary: "Record a milestone as achieved",
      request: {
        params: z.object({ milestoneId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({ actual_date: z.string().date().optional() }),
            },
          },
        },
      },
      responses: { 200: json(z.object({ id: z.string().uuid() }), "Achieved") },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const updated = await achieveMilestone(db, c.get("actor"), {
        milestoneId: c.req.valid("param").milestoneId,
        actualDate: body.actual_date,
      });
      return c.json({ id: updated.id }, 200);
    },
  );

  // Content-addressed file download (documented informally; binary response).
  app.get("/files/:sha256", async (c) => {
    const sha = c.req.param("sha256");
    const bytes = /^[0-9a-f]{64}$/.test(sha) ? await getBlob(sha) : null;
    if (!bytes) return c.json({ error: "file not found" }, 404);
    return c.body(new Uint8Array(bytes), 200, {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${sha}.pdf"`,
    });
  });

  return app;
}
