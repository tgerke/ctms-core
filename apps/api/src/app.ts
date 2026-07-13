import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import {
  achieveMilestone,
  addStudySite,
  assignReview,
  assignSiteRole,
  auditEvents,
  bulkApproveVersions,
  bulkReturnVersions,
  BulkReviewError,
  createActionItem,
  createIssue,
  createMilestone,
  createDelegation,
  createOrganization,
  createPerson,
  createRequirementRule,
  createSite,
  delegationLog,
  documentAuditTrail,
  documentDetail,
  endDelegation,
  endSiteRole,
  expectedDocuments,
  filedVersions,
  recordTraining,
  siteEnrollment,
  siteOverview,
  trainingLog,
  grantAccess,
  linkVisitDocument,
  listOrganizations,
  listPeople,
  listSites,
  listStudies,
  listTmfArtifacts,
  portfolio,
  reportEnrollment,
  resolveActionItem,
  resolveIssue,
  returnDocumentVersion,
  reviewQueue,
  revokeAccess,
  searchDocuments,
  revokeWaiver,
  scheduleVisit,
  signDocumentVersion,
  siteStaff,
  studyEnrollment,
  studyIssues,
  studyMilestones,
  studyRequirementRules,
  studySites,
  studyVisits,
  syncExpectedDocuments,
  updateRequirementRule,
  updateStudySite,
  updateVisit,
  uploadDocument,
  verifyAuditChain,
  visitDetail,
  waiveExpectedDocument,
  permits,
  type DelegationStatus,
  type ExpectedStatus,
  type Grant,
  type IssueStatus,
  type QueueStatus,
  type TrainingStatus,
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
  AccessRoleSchema,
  ActionItemSchema,
  AuditEventSchema,
  DelegationSchema,
  DelegationStatusSchema,
  DocumentDetailSchema,
  ErrorSchema,
  ExpectedDocumentSchema,
  ExpectedStatusSchema,
  FiledVersionSchema,
  IssueCategorySchema,
  IssueSchema,
  IssueSeveritySchema,
  IssueStatusSchema,
  MeSchema,
  MilestoneSchema,
  MonitoringVisitSchema,
  OrganizationSchema,
  OrgKindSchema,
  PersonSchema,
  PortfolioEntrySchema,
  QueueEntrySchema,
  QueueStatusSchema,
  RequirementRuleSchema,
  SearchResultSchema,
  SiteCompletenessSchema,
  SiteDirectorySchema,
  SiteEnrollmentSchema,
  SiteOverviewSchema,
  StaffMemberSchema,
  StaffRoleSchema,
  StudySchema,
  TmfArtifactSchema,
  TrainingRecordSchema,
  TrainingStatusSchema,
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
  app.use("/portfolio", auth, requirePermission(sql, "read"));
  // Who am I: any authenticated, provisioned identity may ask (ADR-0023).
  app.use("/me", auth);
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
  // Site logs (ADR-0023): reads are ordinary reads; writes take 'log' — held
  // by site_staff and admin only. The wildcard middleware above also runs, so
  // a log write effectively needs upload ∧ log; that keeps monitors (who can
  // upload) from authoring a site's own log.
  const readOrLog = (c: { req: { method: string } }) =>
    c.req.method === "GET" ? ("read" as const) : ("log" as const);
  app.use(
    "/study-sites/:studySiteId/delegation-log",
    auth,
    requirePermission(sql, readOrLog, "studySiteId"),
  );
  app.use(
    "/study-sites/:studySiteId/training-log",
    auth,
    requirePermission(sql, readOrLog, "studySiteId"),
  );
  app.use(
    "/delegations/:delegationId",
    auth,
    requirePermission(sql, "log", "delegationId"),
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
  // Bulk review (ADR-0026): the selection arrives in the body, so the
  // middleware gates the operation and the handler completes the per-version
  // scope checks (the POST /documents pattern).
  app.use("/document-versions/bulk-approve", auth, requirePermission(sql, "approve"));
  app.use("/document-versions/bulk-return", auth, requirePermission(sql, "approve"));
  // Routing a review is review-owner authority, same as returning (ADR-0018).
  app.use(
    "/document-versions/:versionId/assign-review",
    auth,
    requirePermission(sql, "approve", "versionId"),
  );
  // Version content (ADR-0027): a read scoped to the version's study/site,
  // so a site-scoped seat can preview exactly the documents it can read —
  // unlike /files/:sha256, which is an unscoped read by content address.
  app.use(
    "/document-versions/:versionId/content",
    auth,
    requirePermission(sql, "read", "versionId"),
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
  // Administration (ADR-0016): directory reads are ordinary reads; mutations
  // take 'administer' (admin role only). Study-scoped paths resolve their
  // study so a study-scoped admin grant works; grant creation/revocation
  // carries its scope in the body or the grant row, so the handlers finish
  // those checks.
  const readOrAdminister = (c: { req: { method: string } }) =>
    c.req.method === "GET" ? ("read" as const) : ("administer" as const);
  app.use("/organizations", auth, requirePermission(sql, readOrAdminister));
  app.use("/sites", auth, requirePermission(sql, readOrAdminister));
  app.use("/people", auth, requirePermission(sql, readOrAdminister));
  app.use("/tmf-artifacts", auth, requirePermission(sql, "read"));
  app.use(
    "/studies/:studyId/sites",
    auth,
    requirePermission(sql, readOrAdminister, "studyId"),
  );
  app.use(
    "/studies/:studyId/requirement-rules",
    auth,
    requirePermission(sql, readOrAdminister, "studyId"),
  );
  // GET is the site seat's landing read (ADR-0023); mutations stay admin.
  app.use(
    "/study-sites/:studySiteId",
    auth,
    requirePermission(sql, readOrAdminister, "studySiteId"),
  );
  app.use(
    "/study-sites/:studySiteId/roles",
    auth,
    requirePermission(sql, "administer", "studySiteId"),
  );
  app.use(
    "/study-site-roles/:roleId",
    auth,
    requirePermission(sql, "administer", "roleId"),
  );
  app.use("/access-grants", auth, requirePermission(sql, "administer"));
  app.use(
    "/access-grants/:grantId/revoke",
    auth,
    requirePermission(sql, "administer", "grantId"),
  );
  app.use(
    "/requirement-rules/:ruleId",
    auth,
    requirePermission(sql, "administer", "ruleId"),
  );
  app.use(
    "/expected-documents/:expectedDocumentId/*",
    auth,
    requirePermission(sql, "administer", "expectedDocumentId"),
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
      path: "/portfolio",
      security,
      summary: "Cross-study rollup",
      description:
        "One row per study with the oversight numbers a portfolio needs — completeness, attention counts, open issues, overdue visits, review queue size, enrollment vs target — computed from the same views the per-study pages read (ADR-0021).",
      responses: {
        200: json(z.array(PortfolioEntrySchema), "Portfolio"),
        403: json(ErrorSchema, "Forbidden"),
      },
    }),
    async (c) => {
      // Cross-study by definition: a purely site-scoped seat (ADR-0023) has
      // no business reading every study's rollup.
      if (c.get("grants").every((g) => g.study_site_id)) {
        return c.json({ error: "requires access beyond a single site" }, 403);
      }
      return c.json((await portfolio(sql)) as never, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/me",
      security,
      summary: "The authenticated person and their active grants",
      description:
        "Lets a client decide what surface to render (ADR-0023): a person whose every grant is site-scoped gets the site seat, not the study-wide dashboard.",
      responses: {
        200: json(MeSchema, "Identity and grants"),
        403: json(ErrorSchema, "No person-linked identity"),
      },
    }),
    async (c) => {
      const actor = c.get("actor");
      if (!actor.personId) {
        return c.json({ error: "no person record for this identity" }, 403);
      }
      const [p] = await sql`
        SELECT given_name, family_name FROM person WHERE id = ${actor.personId}`;
      return c.json(
        {
          person_id: actor.personId,
          given_name: p?.given_name ?? "",
          family_name: p?.family_name ?? "",
          grants: c.get("grants"),
        } as never,
        200,
      );
    },
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

  // --- Site seat (ADR-0023): site-scoped reads and log workflows ------------

  app.openapi(
    createRoute({
      method: "get",
      path: "/study-sites/{studySiteId}",
      security,
      summary: "One site with study context and completeness rollup",
      description:
        "The site seat's landing read (ADR-0023): the same numbers the study's site list carries, reachable with a site-scoped grant.",
      request: { params: z.object({ studySiteId: z.string().uuid() }) },
      responses: {
        200: json(SiteOverviewSchema, "Site overview"),
        404: json(ErrorSchema, "Not found"),
      },
    }),
    async (c) => {
      const row = await siteOverview(sql, c.req.valid("param").studySiteId);
      if (!row) return c.json({ error: "study site not found" }, 404);
      return c.json(row as never, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/study-sites/{studySiteId}/expected-documents",
      security,
      summary: "Expected documents for one site, with derived status",
      request: {
        params: z.object({ studySiteId: z.string().uuid() }),
        query: z.object({ status: ExpectedStatusSchema.optional() }),
      },
      responses: {
        200: json(z.array(ExpectedDocumentSchema), "Expected documents"),
        404: json(ErrorSchema, "Not found"),
      },
    }),
    async (c) => {
      const studySiteId = c.req.valid("param").studySiteId;
      const [ss] = await sql`SELECT study_id FROM study_site WHERE id = ${studySiteId}`;
      if (!ss) return c.json({ error: "study site not found" }, 404);
      const rows = await expectedDocuments(sql, {
        studyId: ss.study_id as string,
        studySiteId,
        status: c.req.valid("query").status as ExpectedStatus | undefined,
      });
      return c.json(rows as never, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/study-sites/{studySiteId}/enrollment",
      security,
      summary: "Latest as-reported enrollment for one site",
      request: { params: z.object({ studySiteId: z.string().uuid() }) },
      responses: { 200: json(z.array(SiteEnrollmentSchema), "Enrollment") },
    }),
    async (c) =>
      c.json(
        (await siteEnrollment(sql, c.req.valid("param").studySiteId)) as never,
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/study-sites/{studySiteId}/delegation-log",
      security,
      summary: "Delegation-of-authority log with derived status",
      description:
        "Structured DoA entries (ADR-0023): who is delegated which tasks, from when, authorized by whom — with the derived cross-checks (did the authorizer hold an active PI role on the start date; does the delegate have open credential items). The signed DoA log document remains the authoritative Part 11 record.",
      request: {
        params: z.object({ studySiteId: z.string().uuid() }),
        query: z.object({ status: DelegationStatusSchema.optional() }),
      },
      responses: { 200: json(z.array(DelegationSchema), "Delegation log") },
    }),
    async (c) =>
      c.json(
        (await delegationLog(sql, {
          studySiteId: c.req.valid("param").studySiteId,
          status: c.req.valid("query").status as DelegationStatus | undefined,
        })) as never,
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/study-sites/{studySiteId}/delegation-log",
      security,
      summary: "Record a delegation of authority",
      description:
        "A dated fact: delegate, tasks, start date, authorizing PI. Requires the 'log' operation (site_staff or admin) — the log is the site's record of itself.",
      request: {
        params: z.object({ studySiteId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                person_id: z.string().uuid(),
                delegated_tasks: z.array(z.string().trim().min(1)).min(1),
                start_date: z.string().date(),
                authorized_by: z.string().uuid(),
              }),
            },
          },
        },
      },
      responses: {
        201: json(z.object({ id: z.string().uuid() }), "Recorded"),
        400: json(ErrorSchema, "Invalid input"),
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      try {
        const created = await createDelegation(db, c.get("actor"), {
          studySiteId: c.req.valid("param").studySiteId,
          personId: body.person_id,
          delegatedTasks: body.delegated_tasks,
          startDate: body.start_date,
          authorizedBy: body.authorized_by,
        });
        return c.json({ id: created.id }, 201);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "record failed" }, 400);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/delegations/{delegationId}",
      security,
      summary: "End a delegation",
      description: "Sets the end date — delegation entries are never deleted.",
      request: {
        params: z.object({ delegationId: z.string().uuid() }),
        body: {
          content: {
            "application/json": { schema: z.object({ end_date: z.string().date() }) },
          },
        },
      },
      responses: {
        200: json(z.object({ id: z.string().uuid() }), "Ended"),
        404: json(ErrorSchema, "Not found or already ended"),
      },
    }),
    async (c) => {
      try {
        const ended = await endDelegation(db, c.get("actor"), {
          delegationId: c.req.valid("param").delegationId,
          endDate: c.req.valid("json").end_date,
        });
        return c.json({ id: ended.id }, 200);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "not found" }, 404);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/study-sites/{studySiteId}/training-log",
      security,
      summary: "Training log with derived status",
      request: {
        params: z.object({ studySiteId: z.string().uuid() }),
        query: z.object({ status: TrainingStatusSchema.optional() }),
      },
      responses: { 200: json(z.array(TrainingRecordSchema), "Training log") },
    }),
    async (c) =>
      c.json(
        (await trainingLog(sql, {
          studySiteId: c.req.valid("param").studySiteId,
          status: c.req.valid("query").status as TrainingStatus | undefined,
        })) as never,
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/study-sites/{studySiteId}/training-log",
      security,
      summary: "Record a training completion",
      description:
        "A dated fact: person, topic, completion date, optional expiry and a link to the filed certificate document. Requires 'log' (site_staff or admin).",
      request: {
        params: z.object({ studySiteId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                person_id: z.string().uuid(),
                topic: z.string().trim().min(1).max(500),
                trained_on: z.string().date(),
                expires_at: z.string().date().optional(),
                document_id: z.string().uuid().optional(),
              }),
            },
          },
        },
      },
      responses: {
        201: json(z.object({ id: z.string().uuid() }), "Recorded"),
        400: json(ErrorSchema, "Invalid input"),
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      try {
        const created = await recordTraining(db, c.get("actor"), {
          studySiteId: c.req.valid("param").studySiteId,
          personId: body.person_id,
          topic: body.topic,
          trainedOn: body.trained_on,
          expiresAt: body.expires_at ?? null,
          documentId: body.document_id ?? null,
        });
        return c.json({ id: created.id }, 201);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "record failed" }, 400);
      }
    },
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
                // Always create a fresh document, even when a non-superseded
                // one with the same artifact + scope exists — a filing system
                // importing a partner's record must not merge it into a local
                // one (ADR-0025).
                force_new: z.enum(["true", "false"]).optional(),
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
        forceNew: form.force_new === "true",
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
      method: "post",
      path: "/documents/{documentId}/versions",
      security,
      summary: "Upload a new version of a specific document (multipart)",
      description:
        "Appends a version to exactly this document (ADR-0025) — no artifact/scope resolution, so a filing system can thread a partner record's iterations onto the document it created. The document goes back through review; a superseded document refuses.",
      request: {
        params: z.object({ documentId: z.string().uuid() }),
        body: {
          content: {
            "multipart/form-data": {
              schema: z.object({
                file: z.custom<File>((v) => v instanceof File, "file required"),
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
        404: json(ErrorSchema, "Not found"),
        409: json(ErrorSchema, "Document is superseded"),
      },
    }),
    async (c) => {
      const documentId = c.req.valid("param").documentId;
      const form = c.req.valid("form");
      const detail = await documentDetail(sql, documentId);
      if (!detail) return c.json({ error: "document not found" }, 404);
      const doc = detail.document as Record<string, unknown>;
      const bytes = new Uint8Array(await form.file.arrayBuffer());
      try {
        const result = await uploadDocument(db, c.get("actor"), {
          documentId,
          tmfArtifactId: doc.tmf_artifact_id as number,
          studyId: doc.study_id as string,
          studySiteId: (doc.study_site_id as string | null) ?? null,
          personId: (doc.person_id as string | null) ?? null,
          title: doc.title as string,
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
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "upload failed" }, 409);
      }
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
      path: "/document-versions/bulk-approve",
      security,
      summary: "Approve a selection of versions as one series of signings",
      description:
        "Bulk review (ADR-0026), built on §11.200(a)(1)(i): a series of signings during a single, continuous period of controlled system access — one verified re-authentication (reauth_token) opens the series, and each version still gains its own signature row bound to its own content hash (§11.70). All-or-nothing: every version must be the latest of a pending_review document inside the caller's approve scope, and every blocker across the selection is reported at once. Each approval promotes and supersedes exactly as the single-version ceremony does.",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                version_ids: z.array(z.string().uuid()).min(1).max(200),
                reauth_token: z.string().min(1),
                effective_date: z.string().date().optional(),
              }),
            },
          },
        },
      },
      responses: {
        201: json(
          z.object({
            signed: z.array(
              z.object({
                version_id: z.string().uuid(),
                signature_id: z.string().uuid(),
                signed_sha256: z.string(),
              }),
            ),
          }),
          "Signed",
        ),
        400: json(ErrorSchema, "Invalid input"),
        403: json(ErrorSchema, "Re-authentication failed"),
        409: json(
          ErrorSchema.extend({ problems: z.array(z.string()).optional() }),
          "Selection refused — every blocker listed, nothing signed",
        ),
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
        const signed = await bulkApproveVersions(db, actor, {
          versionIds: body.version_ids,
          signerPersonId: actor.personId,
          grants: c.get("grants"),
          reauthMethod: reauth.method,
          reauthAt: reauth.at,
          effectiveDate: body.effective_date,
        });
        return c.json(
          {
            signed: signed.map((s) => ({
              version_id: s.documentVersionId,
              signature_id: s.id,
              signed_sha256: s.signedSha256,
            })),
          },
          201,
        );
      } catch (e) {
        if (e instanceof BulkReviewError) {
          return c.json({ error: e.message, problems: e.problems }, 409);
        }
        return c.json({ error: e instanceof Error ? e.message : "bulk approve failed" }, 409);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/document-versions/bulk-return",
      security,
      summary: "Return a selection of versions for correction, one shared reason",
      description:
        "The other bulk review outcome (ADR-0026 over ADR-0015): every selected version goes back with the same documented, immutable reason. Same approve authority and all-or-nothing preflight as bulk approval; not a signature, so no re-authentication.",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                version_ids: z.array(z.string().uuid()).min(1).max(200),
                reason: z.string().min(1),
              }),
            },
          },
        },
      },
      responses: {
        201: json(
          z.object({
            returned: z.array(
              z.object({ version_id: z.string().uuid(), return_id: z.string().uuid() }),
            ),
          }),
          "Returned",
        ),
        400: json(ErrorSchema, "Invalid input"),
        409: json(
          ErrorSchema.extend({ problems: z.array(z.string()).optional() }),
          "Selection refused — every blocker listed, nothing returned",
        ),
      },
    }),
    async (c) => {
      const actor = c.get("actor");
      if (!actor.personId) {
        return c.json({ error: "returning requires a person-linked token" }, 400);
      }
      const body = c.req.valid("json");
      try {
        const returned = await bulkReturnVersions(db, actor, {
          versionIds: body.version_ids,
          returnedByPersonId: actor.personId,
          grants: c.get("grants"),
          reason: body.reason,
        });
        return c.json(
          {
            returned: returned.map((r) => ({
              version_id: r.documentVersionId,
              return_id: r.id,
            })),
          },
          201,
        );
      } catch (e) {
        if (e instanceof BulkReviewError) {
          return c.json({ error: e.message, problems: e.problems }, 409);
        }
        return c.json({ error: e instanceof Error ? e.message : "bulk return failed" }, 409);
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
      path: "/studies/{studyId}/document-search",
      security,
      summary: "Search documents by metadata and content",
      description:
        "Document search (ADR-0019, ADR-0022): every whitespace token in q must appear in the document's metadata (title, artifact taxonomy, site, person, uploader, file names, filing source, status) or in its versions' extracted text — 'raman license' finds Dr. Raman's medical license, a phrase from inside the protocol finds the protocol. Content matches carry a snippet of the surrounding text.",
      request: {
        params: z.object({ studyId: z.string().uuid() }),
        query: z.object({
          q: z.string().trim().min(2),
          status: z.string().optional(),
          limit: z.coerce.number().int().positive().max(200).optional(),
        }),
      },
      responses: {
        200: json(z.array(SearchResultSchema), "Matching documents"),
        400: json(ErrorSchema, "Query too short"),
      },
    }),
    async (c) => {
      const q = c.req.valid("query");
      const rows = await searchDocuments(sql, {
        studyId: c.req.valid("param").studyId,
        q: q.q,
        status: q.status,
        limit: q.limit,
      });
      return c.json(rows as never, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/studies/{studyId}/filings",
      security,
      summary: "Versions a source system already filed into this study",
      description:
        "The read half of idempotent filing (ADR-0025): a source system asks what it has filed — by source_system and the source_ref values it chose (ADR-0011) — before re-sending, so interim transfers and re-runs never duplicate. The eTMF-EMS importer reads this before executing a batch.",
      request: {
        params: z.object({ studyId: z.string().uuid() }),
        query: z.object({ source_system: z.string().trim().min(1) }),
      },
      responses: { 200: json(z.array(FiledVersionSchema), "Filed versions") },
    }),
    async (c) =>
      c.json(
        (await filedVersions(
          sql,
          c.req.valid("param").studyId,
          c.req.valid("query").source_system,
        )) as never,
        200,
      ),
  );

  // --- Review queue (ADR-0018) ---------------------------------------------

  app.openapi(
    createRoute({
      method: "post",
      path: "/document-versions/{versionId}/assign-review",
      security,
      summary: "Assign a pending version to a named reviewer",
      description:
        "Routes review work (ADR-0018): records who should review this version, set by whom, due when. The assignment finishes itself — an approval signature or a return resolves it, because the queue is derived from the documents. Reassigning inserts a new assignment; the latest one stands. The assignee must hold a grant that can approve this document.",
      request: {
        params: z.object({ versionId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                assignee_person_id: z.string().uuid(),
                due_date: z.string().date().optional(),
                note: z.string().trim().max(2000).optional(),
              }),
            },
          },
        },
      },
      responses: {
        201: json(z.object({ assignment_id: z.string().uuid() }), "Assigned"),
        400: json(ErrorSchema, "Invalid input"),
        409: json(ErrorSchema, "Not assignable (not pending review, not latest, or assignee cannot approve)"),
      },
    }),
    async (c) => {
      const actor = c.get("actor");
      if (!actor.personId) {
        return c.json({ error: "assigning requires a person-linked token" }, 400);
      }
      const body = c.req.valid("json");
      try {
        const assignment = await assignReview(db, actor, {
          documentVersionId: c.req.valid("param").versionId,
          assignedToPersonId: body.assignee_person_id,
          assignedByPersonId: actor.personId,
          dueDate: body.due_date ?? null,
          note: body.note ?? null,
        });
        return c.json({ assignment_id: assignment.id }, 201);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "assign failed" }, 409);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/studies/{studyId}/review-queue",
      security,
      summary: "The review queue: pending versions with derived assignment status",
      description:
        "Every document awaiting review, with its latest version's current assignment and a derived queue status (unassigned, assigned, overdue). Filter by assignee for a 'my work' view. Approval or return empties the queue — there is no completion flag to forget.",
      request: {
        params: z.object({ studyId: z.string().uuid() }),
        query: z.object({
          assigned_to: z.string().uuid().optional(),
          status: QueueStatusSchema.optional(),
        }),
      },
      responses: { 200: json(z.array(QueueEntrySchema), "Queue") },
    }),
    async (c) => {
      const q = c.req.valid("query");
      const rows = await reviewQueue(sql, {
        studyId: c.req.valid("param").studyId,
        assignedTo: q.assigned_to,
        status: q.status as QueueStatus | undefined,
      });
      return c.json(rows as never, 200);
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

  // --- Administration (ADR-0016): studies, sites, staff, rules, waivers -----

  // A grant that names no study or site applies everywhere, so creating or
  // revoking one takes an equally unscoped administer grant — a site-scoped
  // admin must not be able to mint global access.
  const permitsGrantScope = (
    grants: Grant[],
    scope: { studyId?: string; studySiteId?: string },
  ) =>
    scope.studyId || scope.studySiteId
      ? permits(grants, "administer", scope)
      : grants.some((g) => g.role === "admin" && !g.study_id && !g.study_site_id);

  app.openapi(
    createRoute({
      method: "get",
      path: "/organizations",
      security,
      summary: "List organizations",
      responses: { 200: json(z.array(OrganizationSchema), "Organizations") },
    }),
    async (c) => c.json((await listOrganizations(sql)) as never, 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/organizations",
      security,
      summary: "Create an organization",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({ name: z.string().trim().min(1), kind: OrgKindSchema }),
            },
          },
        },
      },
      responses: {
        201: json(z.object({ id: z.string().uuid() }), "Created"),
        400: json(ErrorSchema, "Invalid input"),
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const org = await createOrganization(db, c.get("actor"), {
        name: body.name,
        kind: body.kind,
      });
      return c.json({ id: org.id }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/sites",
      security,
      summary: "List sites (directory)",
      responses: { 200: json(z.array(SiteDirectorySchema), "Sites") },
    }),
    async (c) => c.json((await listSites(sql)) as never, 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/sites",
      security,
      summary: "Create a site",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                organization_id: z.string().uuid(),
                name: z.string().trim().min(1),
                city: z.string().optional(),
                state: z.string().optional(),
                country: z.string().regex(/^[A-Z]{3}$/, "ISO 3166-1 alpha-3").optional(),
              }),
            },
          },
        },
      },
      responses: {
        201: json(z.object({ id: z.string().uuid() }), "Created"),
        400: json(ErrorSchema, "Invalid input"),
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const created = await createSite(db, c.get("actor"), {
        organizationId: body.organization_id,
        name: body.name,
        city: body.city ?? null,
        state: body.state ?? null,
        country: body.country ?? null,
      });
      return c.json({ id: created.id }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/people",
      security,
      summary: "List people with their active access grants",
      responses: { 200: json(z.array(PersonSchema), "People") },
    }),
    async (c) => c.json((await listPeople(sql)) as never, 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/people",
      security,
      summary: "Create a person",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                given_name: z.string().trim().min(1),
                family_name: z.string().trim().min(1),
                email: z.string().email(),
                credentials: z.string().optional(),
              }),
            },
          },
        },
      },
      responses: {
        201: json(z.object({ id: z.string().uuid() }), "Created"),
        400: json(ErrorSchema, "Invalid input"),
        409: json(ErrorSchema, "Email already registered"),
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      try {
        const created = await createPerson(db, c.get("actor"), {
          givenName: body.given_name,
          familyName: body.family_name,
          email: body.email,
          credentials: body.credentials ?? null,
        });
        return c.json({ id: created.id }, 201);
      } catch {
        return c.json({ error: `a person with email ${body.email} already exists` }, 409);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/tmf-artifacts",
      security,
      summary: "List TMF artifacts (for requirement-rule setup)",
      responses: { 200: json(z.array(TmfArtifactSchema), "Artifacts") },
    }),
    async (c) => c.json((await listTmfArtifacts(sql)) as never, 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/studies/{studyId}/sites",
      security,
      summary: "Add a site to a study",
      description:
        "Creates the study-site link (status 'pending'). Activate it with PATCH /study-sites/{id}, then sync expected documents to materialize its requirements.",
      request: {
        params: z.object({ studyId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                site_id: z.string().uuid(),
                site_number: z.string().trim().min(1),
                target_enrollment: z.number().int().positive().optional(),
              }),
            },
          },
        },
      },
      responses: {
        201: json(z.object({ id: z.string().uuid() }), "Created"),
        400: json(ErrorSchema, "Invalid input"),
        409: json(ErrorSchema, "Site already on study, or site number taken"),
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      try {
        const created = await addStudySite(db, c.get("actor"), {
          studyId: c.req.valid("param").studyId,
          siteId: body.site_id,
          siteNumber: body.site_number,
          targetEnrollment: body.target_enrollment ?? null,
        });
        return c.json({ id: created.id }, 201);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "add site failed" }, 409);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/study-sites/{studySiteId}",
      security,
      summary: "Update study-site status or activation",
      request: {
        params: z.object({ studySiteId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                status: z.enum(["pending", "active", "closed"]).optional(),
                activated_at: z.string().date().nullable().optional(),
                target_enrollment: z.number().int().positive().nullable().optional(),
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
      try {
        const updated = await updateStudySite(db, c.get("actor"), {
          studySiteId: c.req.valid("param").studySiteId,
          status: body.status,
          activatedAt: body.activated_at,
          targetEnrollment: body.target_enrollment,
        });
        return c.json({ id: updated.id }, 200);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "not found" }, 404);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/study-sites/{studySiteId}/roles",
      security,
      summary: "Assign a person to a site role",
      description:
        "Site staffing is a dated fact (start/end), not a permission — access grants are separate. Sync expected documents afterwards to materialize person-scoped requirements.",
      request: {
        params: z.object({ studySiteId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                person_id: z.string().uuid(),
                role: StaffRoleSchema,
                start_date: z.string().date(),
              }),
            },
          },
        },
      },
      responses: {
        201: json(z.object({ id: z.string().uuid() }), "Assigned"),
        400: json(ErrorSchema, "Invalid input"),
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const created = await assignSiteRole(db, c.get("actor"), {
        studySiteId: c.req.valid("param").studySiteId,
        personId: body.person_id,
        role: body.role,
        startDate: body.start_date,
      });
      return c.json({ id: created.id }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/study-site-roles/{roleId}",
      security,
      summary: "End a site role assignment",
      description: "Sets the role's end date — assignments are never deleted.",
      request: {
        params: z.object({ roleId: z.string().uuid() }),
        body: {
          content: {
            "application/json": { schema: z.object({ end_date: z.string().date() }) },
          },
        },
      },
      responses: {
        200: json(z.object({ id: z.string().uuid() }), "Ended"),
        404: json(ErrorSchema, "Not found"),
      },
    }),
    async (c) => {
      try {
        const updated = await endSiteRole(db, c.get("actor"), {
          roleId: c.req.valid("param").roleId,
          endDate: c.req.valid("json").end_date,
        });
        return c.json({ id: updated.id }, 200);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "not found" }, 404);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/access-grants",
      security,
      summary: "Grant system access",
      description:
        "Grants a person an access role, optionally scoped to one study or one study-site. Creating an unscoped grant requires an unscoped administer grant.",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                person_id: z.string().uuid(),
                role: AccessRoleSchema,
                study_id: z.string().uuid().optional(),
                study_site_id: z.string().uuid().optional(),
              }),
            },
          },
        },
      },
      responses: {
        201: json(z.object({ id: z.string().uuid() }), "Granted"),
        400: json(ErrorSchema, "Invalid input"),
        403: json(ErrorSchema, "Forbidden"),
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      // Resolve the grant's own scope (the site's study included) and check
      // the actor may administer it — the route middleware could only gate
      // the operation, not the body's scope.
      let scope: { studyId?: string; studySiteId?: string } = {};
      if (body.study_site_id) {
        const [ss] = await sql`SELECT study_id FROM study_site WHERE id = ${body.study_site_id}`;
        if (!ss) return c.json({ error: "study site not found" }, 400);
        scope = { studyId: ss.study_id as string, studySiteId: body.study_site_id };
      } else if (body.study_id) {
        scope = { studyId: body.study_id };
      }
      if (!permitsGrantScope(c.get("grants"), scope)) {
        return c.json({ error: "requires 'administer' permission for this scope" }, 403);
      }
      const created = await grantAccess(db, c.get("actor"), {
        personId: body.person_id,
        role: body.role,
        studyId: body.study_id ?? null,
        studySiteId: body.study_site_id ?? null,
      });
      return c.json({ id: created.id }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/access-grants/{grantId}/revoke",
      security,
      summary: "Revoke an access grant",
      description: "Sets revoked_at — grants are never deleted (ADR-0008).",
      request: { params: z.object({ grantId: z.string().uuid() }) },
      responses: {
        200: json(z.object({ id: z.string().uuid() }), "Revoked"),
        403: json(ErrorSchema, "Forbidden"),
        404: json(ErrorSchema, "Not found or already revoked"),
      },
    }),
    async (c) => {
      const grantId = c.req.valid("param").grantId;
      const [row] = await sql`
        SELECT study_id, study_site_id FROM access_grant WHERE id = ${grantId}`;
      if (!row) return c.json({ error: "grant not found" }, 404);
      if (
        !permitsGrantScope(c.get("grants"), {
          studyId: (row.study_id as string | null) ?? undefined,
          studySiteId: (row.study_site_id as string | null) ?? undefined,
        })
      ) {
        return c.json({ error: "requires 'administer' permission for this scope" }, 403);
      }
      try {
        const revoked = await revokeAccess(db, c.get("actor"), { grantId });
        return c.json({ id: revoked.id }, 200);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "not found" }, 404);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/studies/{studyId}/requirement-rules",
      security,
      summary: "Requirement rules for a study",
      request: { params: z.object({ studyId: z.string().uuid() }) },
      responses: { 200: json(z.array(RequirementRuleSchema), "Rules") },
    }),
    async (c) =>
      c.json(
        (await studyRequirementRules(sql, c.req.valid("param").studyId)) as never,
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/studies/{studyId}/requirement-rules",
      security,
      summary: "Create a requirement rule",
      description:
        "Defines what the study expects on file. Sync expected documents afterwards to materialize placeholders; the rule's scope level and artifact are fixed — a different requirement is a new rule.",
      request: {
        params: z.object({ studyId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                tmf_artifact_id: z.number().int(),
                scope_level: z.enum(["study", "study_site", "person_role"]),
                name: z.string().trim().min(1),
                description: z.string().optional(),
                applies_to_roles: z.array(StaffRoleSchema).optional(),
                validity_months: z.number().int().positive().optional(),
                requires_signature: z.boolean().optional(),
              }),
            },
          },
        },
      },
      responses: {
        201: json(z.object({ id: z.string().uuid() }), "Created"),
        400: json(ErrorSchema, "Invalid input"),
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const created = await createRequirementRule(db, c.get("actor"), {
        studyId: c.req.valid("param").studyId,
        tmfArtifactId: body.tmf_artifact_id,
        scopeLevel: body.scope_level,
        name: body.name,
        description: body.description ?? null,
        appliesToRoles: body.applies_to_roles ?? null,
        validityMonths: body.validity_months ?? null,
        requiresSignature: body.requires_signature,
      });
      return c.json({ id: created.id }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/requirement-rules/{ruleId}",
      security,
      summary: "Update a requirement rule",
      request: {
        params: z.object({ ruleId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                name: z.string().trim().min(1).optional(),
                description: z.string().nullable().optional(),
                applies_to_roles: z.array(StaffRoleSchema).nullable().optional(),
                validity_months: z.number().int().positive().nullable().optional(),
                requires_signature: z.boolean().optional(),
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
      try {
        const updated = await updateRequirementRule(db, c.get("actor"), {
          ruleId: c.req.valid("param").ruleId,
          name: body.name,
          description: body.description,
          appliesToRoles: body.applies_to_roles,
          validityMonths: body.validity_months,
          requiresSignature: body.requires_signature,
        });
        return c.json({ id: updated.id }, 200);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "not found" }, 404);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/expected-documents/{expectedDocumentId}/waive",
      security,
      summary: "Waive an expected document",
      description:
        "Records why this expected document is not applicable (e.g. central IRB makes the local approval letter moot). The absence shows as 'waived' instead of 'missing' and leaves the completeness denominator. A filed document always wins over a waiver; lifting the waiver is a recorded fact, never a delete (ADR-0016).",
      request: {
        params: z.object({ expectedDocumentId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({ reason: z.string().trim().min(1).max(2000) }),
            },
          },
        },
      },
      responses: {
        201: json(z.object({ waiver_id: z.string().uuid() }), "Waived"),
        400: json(ErrorSchema, "Invalid input"),
        409: json(ErrorSchema, "Already waived, or expected document not found"),
      },
    }),
    async (c) => {
      const actor = c.get("actor");
      if (!actor.personId) {
        return c.json({ error: "waiving requires a person-linked token" }, 400);
      }
      try {
        const waiver = await waiveExpectedDocument(db, actor, {
          expectedDocumentId: c.req.valid("param").expectedDocumentId,
          waivedByPersonId: actor.personId,
          reason: c.req.valid("json").reason,
        });
        return c.json({ waiver_id: waiver.id }, 201);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "waive failed" }, 409);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/expected-documents/{expectedDocumentId}/revoke-waiver",
      security,
      summary: "Lift the active waiver on an expected document",
      request: {
        params: z.object({ expectedDocumentId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({ reason: z.string().trim().min(1).max(2000) }),
            },
          },
        },
      },
      responses: {
        200: json(z.object({ waiver_id: z.string().uuid() }), "Waiver lifted"),
        400: json(ErrorSchema, "Invalid input"),
        409: json(ErrorSchema, "No active waiver"),
      },
    }),
    async (c) => {
      const actor = c.get("actor");
      if (!actor.personId) {
        return c.json({ error: "revoking a waiver requires a person-linked token" }, 400);
      }
      try {
        const waiver = await revokeWaiver(db, actor, {
          expectedDocumentId: c.req.valid("param").expectedDocumentId,
          revokedByPersonId: actor.personId,
          reason: c.req.valid("json").reason,
        });
        return c.json({ waiver_id: waiver.id }, 200);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "no active waiver" }, 409);
      }
    },
  );

  // Content-addressed file download (documented informally; binary response).
  // The mime type and file name come from a version row carrying this hash;
  // identical bytes always share them closely enough to serve.
  app.get("/files/:sha256", async (c) => {
    const sha = c.req.param("sha256");
    const bytes = /^[0-9a-f]{64}$/.test(sha) ? await getBlob(sha) : null;
    if (!bytes) return c.json({ error: "file not found" }, 404);
    const [v] = await sql`
      SELECT file_name, mime_type FROM document_version
      WHERE sha256 = ${sha} ORDER BY uploaded_at LIMIT 1`;
    return c.body(new Uint8Array(bytes), 200, {
      "content-type": (v?.mime_type as string | undefined) ?? "application/octet-stream",
      "content-disposition": `inline; filename="${((v?.file_name as string | undefined) ?? sha).replace(/["\r\n]/g, "")}"`,
    });
  });

  // Version content for queue-side preview (ADR-0027; documented informally;
  // binary response). Serves the exact bytes every signature on this version
  // hashes (§11.70) — there is no derived "preview rendition" to drift from
  // the record — with the uploaded mime type, plus the hash in a header so a
  // client can verify what it received.
  app.get("/document-versions/:versionId/content", async (c) => {
    const versionId = c.req.param("versionId");
    if (!z.string().uuid().safeParse(versionId).success) {
      return c.json({ error: "version not found" }, 404);
    }
    const [v] = await sql`
      SELECT sha256, file_name, mime_type FROM document_version WHERE id = ${versionId}`;
    const bytes = v ? await getBlob(v.sha256) : null;
    if (!v || !bytes) return c.json({ error: "version not found" }, 404);
    return c.body(new Uint8Array(bytes), 200, {
      "content-type": v.mime_type as string,
      "content-disposition": `inline; filename="${(v.file_name as string).replace(/["\r\n]/g, "")}"`,
      "x-content-sha256": v.sha256 as string,
    });
  });

  return app;
}
