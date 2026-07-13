// Regenerates the app screenshots embedded in the docs site (docs-site/images/).
// Drives headless Chrome over the DevTools protocol; needs no dependencies
// beyond Node 22+ (built-in WebSocket) and Chrome at the macOS path below.
//
// The stack must be running with seeded data:  pnpm db:up && pnpm db:seed && pnpm dev
// Then:  node docs-site/screenshots.mjs
//
// Entities are looked up via the API at runtime (seeding regenerates UUIDs, so
// ids can never be hardcoded): the gappiest site, a visit in follow_up, a
// scheduled visit, a current signed document, and a pending_review document.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// Override when the default ports are taken (e.g. a sibling repo's dev
// server on 5173): WEB=http://localhost:5199 node docs-site/screenshots.mjs
const WEB = process.env.WEB ?? "http://localhost:5173";
const API = process.env.API ?? "http://localhost:8787";
const TOKEN = "dev-admin-token";
const outdir = join(dirname(fileURLToPath(import.meta.url)), "images");
mkdirSync(outdir, { recursive: true });

// which dashboard cards to keep, by heading prefix → filename
const DASHBOARD_SECTIONS = {
  "Milestones": "milestones.png",
  "Enrollment vs target": "enrollment.png",
  "Monitoring visits": "monitoring-visits.png",
  "Issues & deviations": "issues.png",
  "Site document matrix": "site-document-matrix.png",
};

// --- pick subjects from the seeded data ---------------------------------
const api = async (path) => {
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
};

const studies = await api("/studies");
const study = studies[0].id;

const sites = await api(`/studies/${study}/sites`);
const gappySite = sites.reduce((a, b) => (+a.pct_current <= +b.pct_current ? a : b));

const visits = await api(`/studies/${study}/monitoring-visits`);
const visit =
  visits.find((v) => v.stage === "follow_up") ??
  visits.find((v) => v.stage === "report_pending_review") ??
  visits.find((v) => v.visit_date);
if (!visit) throw new Error("no conducted visit in seed data");

const scheduledVisit = visits.find((v) => v.stage === "scheduled");
if (!scheduledVisit) throw new Error("no scheduled visit in seed data");

const expected = await api(`/studies/${study}/expected-documents`);
const doc =
  expected.find((e) => e.artifact_name === "Protocol" && e.document_id) ??
  expected.find((e) => e.status === "current" && e.document_id);
if (!doc) throw new Error("no fulfilled document in seed data");

const pendingDoc = expected.find(
  (e) => e.status === "pending_review" && e.document_id,
);
if (!pendingDoc) throw new Error("no pending_review document in seed data");

const returnedDoc = expected.find((e) => e.status === "returned" && e.document_id);
if (!returnedDoc) throw new Error("no returned document in seed data");

console.log("subjects:", {
  site: `${gappySite.site_number} (${gappySite.pct_current}% current)`,
  visit: `${visit.visit_type} @ ${visit.site_number} (${visit.stage})`,
  scheduledVisit: `${scheduledVisit.visit_type} @ ${scheduledVisit.site_number}`,
  document: doc.artifact_name,
  pendingDocument: pendingDoc.artifact_name,
  returnedDocument: returnedDoc.artifact_name,
});

// --- CDP plumbing --------------------------------------------------------
const chrome = spawn(CHROME, [
  "--headless=new",
  "--remote-debugging-port=0",
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "ctms-docs-shots-"))}`,
  "--no-first-run",
  "--hide-scrollbars",
  "--force-color-profile=srgb",
  "--window-size=1440,900",
]);
const wsUrl = await new Promise((resolve, reject) => {
  let buf = "";
  chrome.stderr.on("data", (d) => {
    buf += d;
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) resolve(m[1]);
  });
  chrome.on("exit", () => reject(new Error("chrome exited\n" + buf)));
  setTimeout(() => reject(new Error("no devtools url\n" + buf)), 15000);
});
const ws = new WebSocket(wsUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

let msgId = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const page = (method, params) => send(method, params, sessionId);

await page("Page.enable");
await page("Runtime.enable");
await page("Emulation.setDeviceMetricsOverride", {
  width: 1440, height: 900, deviceScaleFactor: 2, mobile: false,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(expression) {
  const { result, exceptionDetails } = await page("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails));
  return result.value;
}

async function navigate(url, settleMs = 2500) {
  await page("Page.navigate", { url });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await sleep(300);
    if (await evaluate("document.readyState === 'complete'")) break;
  }
  await sleep(settleMs); // let React fetch + render
}

async function shoot(name, clip) {
  const { data } = await page("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: !!clip,
    ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
  });
  writeFileSync(join(outdir, name), Buffer.from(data, "base64"));
  console.log("saved", name);
}

// clip each section.card on the current page whose heading matches map
async function shootSections(map) {
  const sections = await evaluate(
    `[...document.querySelectorAll('section.card')].map((s) => {
       const r = s.getBoundingClientRect();
       return { title: (s.querySelector('h1,h2,h3')?.textContent ?? '').trim(),
                x: Math.max(0, r.x + scrollX - 8), y: Math.max(0, r.y + scrollY - 8),
                width: Math.min(1440, r.width + 16), height: r.height + 16 };
     })`
  );
  for (const s of sections) {
    const file = Object.entries(map).find(([prefix]) => s.title.startsWith(prefix))?.[1];
    if (!file) continue;
    await shoot(file, { x: s.x, y: s.y, width: s.width, height: Math.min(s.height, 1400) });
  }
}

// --- capture -------------------------------------------------------------
// docs screenshots are light-theme; set before the app boots
await navigate(WEB + "/", 500);
await evaluate("localStorage.setItem('ctms_theme', 'light'); true");

await navigate(WEB + "/");
await shoot("dashboard.png");
await shootSections(DASHBOARD_SECTIONS);

await navigate(`${WEB}/sites/${gappySite.study_site_id}`);
await shoot("site-detail.png");
await shootSections({ "Issues & deviations": "site-issues-form.png" });

// The site seat (ADR-0023): the seeded coordinator persona lands on site 001,
// whose delegation and training logs carry the seeded cross-check stories.
await evaluate("localStorage.setItem('ctms_token', 'dev-site-token'); true");
await navigate(WEB + "/");
await shoot("site-seat.png");
await shootSections({
  "Delegation of authority": "delegation-log.png",
  "Training log": "training-log.png",
});
await evaluate("localStorage.setItem('ctms_token', 'dev-admin-token'); true");

await navigate(`${WEB}/visits/${visit.monitoring_visit_id}`);
await shoot("visit-page.png");

await navigate(`${WEB}/visits/${scheduledVisit.monitoring_visit_id}`);
await shoot("visit-scheduled.png");

await navigate(`${WEB}/documents/${doc.document_id}`);
await shoot("document-page.png");
await shootSections({ Versions: "document-new-version.png" });

// live §11.70 verification (ADR-0028): the hash recomputed in the browser,
// compared against the record and its signatures — a read, nothing mutates
await evaluate(
  `[...document.querySelectorAll('button')]
     .find((b) => b.textContent.includes('Verify bytes')).click(); true`
);
await sleep(1500);
await shootSections({ Versions: "verify-bytes.png" });

// the signing confirmation panel, opened but never confirmed (no mutation)
await navigate(`${WEB}/documents/${pendingDoc.document_id}`);
await evaluate(
  `[...document.querySelectorAll('button')]
     .find((b) => b.textContent.includes('Approve & make effective')).click(); true`
);
await sleep(400);
await shootSections({ Versions: "document-approve.png" });

// the returned document: reason banner in the versions card, no approve button
await navigate(`${WEB}/documents/${returnedDoc.document_id}`);
await shootSections({ Versions: "document-returned.png" });

// bulk review (ADR-0026): a selection with the series-signing confirmation
// open — never confirmed, so nothing mutates
await navigate(`${WEB}/queue`);
await evaluate(
  `[...document.querySelectorAll('input[type=checkbox][aria-label^="Select "]')]
     .filter((c) => c.getAttribute('aria-label') !== 'Select all listed')
     .slice(0, 2).forEach((c) => c.click()); true`
);
await sleep(300);
await evaluate(
  `[...document.querySelectorAll('button')]
     .find((b) => b.textContent.startsWith('Approve ')).click(); true`
);
await sleep(300);
await shootSections({ "Pending review": "queue-bulk-review.png" });

// the TMF binder (ADR-0028), read as the auditor persona so the header
// shows the read-only seat's surface
await evaluate("localStorage.setItem('ctms_token', 'dev-auditor-token'); true");
await navigate(`${WEB}/binder`);
await shoot("binder.png");
await evaluate("localStorage.setItem('ctms_token', 'dev-admin-token'); true");

await navigate(`${WEB}/audit`);
await shoot("audit-page.png");

await navigate(`${API}/docs`, 3500);
await shoot("api-docs.png");

ws.close();
chrome.kill();
console.log("done →", outdir);
