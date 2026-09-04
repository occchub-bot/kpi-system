// Test agent for kpi-system.
//
// Two modes:
//   node test-agent.mjs                 -> route/access-control crawl for all 7 roles (read-only, safe)
//   node test-agent.mjs --full          -> also runs the real evaluation flow (HR creates a throwaway
//                                          employee -> employee self-assesses -> manager evaluates ->
//                                          checks the computed scores -> deletes the throwaway employee)
//
// No JS/browser is used: logins and form submissions are done as plain multipart POSTs the same way
// a no-JS browser would submit these forms (Next.js server actions support this natively), which is
// also what makes this a faithful test of the real server action code path, not a mock.
//
// Requires: dev server already running (see README, PORT=3002 npm run dev), and for --full mode,
// DATABASE_URL in the environment (same value as .env) so the script can read/clean up rows the UI
// itself doesn't expose (assessment_items, hard delete of the throwaway user — the app's own UI only
// supports deactivating real employees, never deleting).

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://localhost:3002";
const FULL = process.argv.includes("--full");

function loadDotEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    // ค่าใน .env อาจใส่เครื่องหมายคำพูดครอบไว้ — ถอดออกก่อน
    if (m) out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

const results = [];
function log(...a) {
  console.log(...a);
}

/* ---------------- Next.js server-action HTTP helpers ---------------- */

function extractActionIds(html) {
  const ids = [...new Set([...html.matchAll(/\$ACTION_ID_([a-f0-9]+)/g)].map((m) => m[1]))];
  const named = new Map();
  const re = /\\"id\\":\\"([a-f0-9]+)\\".*?\\"name\\":\\"([a-zA-Z]+)\\"/g;
  let m;
  while ((m = re.exec(html))) named.set(m[2], m[1]);
  return { ids, named };
}

// Resolving a server action id has to come from the running server, never from local build output:
// the id is a content hash that also depends on the project path, so a dev build, a production build
// and the build inside the container all hash the same action differently. Sending the wrong one
// gets "Failed to find Server Action" (500).
//
// Where the id lives depends on how the action is used:
//   <form action={x}> in a server component -> hidden $ACTION_ID_ input in the HTML
//   action passed as a prop to a client component -> id/name pair in the flight payload
//   <form action={x}> inside a client component -> createServerReference(...) in a JS chunk
const chunkActionIds = new Map();
const scannedChunks = new Set();

/** ดึง id/ชื่อ action ออกจาก JS chunk ของหน้า (กรณี client component เรียก server action) */
async function scanChunkActionIds(html) {
  const srcs = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]))];
  for (const src of srcs) {
    const url = src.startsWith("http") ? src : `${BASE}${src}`;
    if (scannedChunks.has(url)) continue;
    scannedChunks.add(url);
    let js;
    try {
      js = await (await fetch(url)).text();
    } catch {
      continue;
    }
    // prod (minified):  createServerReference)("<id>",l.callServer,void 0,l.findSourceMapURL,"<name>")
    // dev  (turbopack):  ...["createServerReference"])("<id>", <long module refs> , "<name>")
    // จับแบบกว้าง ๆ: หา id แล้วมองหาชื่อที่ลงท้ายด้วย Action ตัวถัดไป โดยเช็กว่ามาจาก
    // createServerReference จริง (ดูข้อความก่อนหน้า) — ครอบคลุมทั้งสองรูปแบบโดยไม่ผูกกับ bundler
    for (const m of js.matchAll(/"([a-f0-9]{40,42})"/g)) {
      const before = js.slice(Math.max(0, m.index - 300), m.index);
      if (!before.includes("createServerReference")) continue;
      const after = js.slice(m.index, m.index + 1500);
      const name = after.match(/"([A-Za-z_$][\w$]*Action)"/)?.[1];
      if (name) chunkActionIds.set(name, m[1]);
    }
  }
}

/**
 * หา action id จากฟอร์มที่มีช่องกรอกครบตามที่ระบุ — ใช้กับหน้าที่มีหลายฟอร์มของ server component
 * (prod build ไม่ฝังชื่อ action มาใน HTML เหมือน dev จึงต้องดูจากหน้าตาฟอร์มแทน)
 */
function actionIdByFormFields(html, requiredFields) {
  const matches = new Set();
  for (const part of html.split("<form").slice(1)) {
    const fragment = part.split("</form>")[0];
    const id = fragment.match(/\$ACTION_ID_([a-f0-9]+)/)?.[1];
    if (!id) continue;
    const fields = new Set([...fragment.matchAll(/name="([a-z_]+)"/g)].map((m) => m[1]));
    if (requiredFields.every((f) => fields.has(f))) matches.add(id);
  }
  if (matches.size > 1) {
    throw new Error(`form fields ${requiredFields.join("+")} matched more than one action`);
  }
  return [...matches][0];
}

/** id ของ server action ตามชื่อ export — ต้องส่ง html ของหน้าที่เพิ่งโหลดมาด้วย */
async function actionId(html, name, formFields) {
  const { named, ids } = extractActionIds(html);
  if (named.has(name)) return named.get(name);

  if (!chunkActionIds.has(name)) await scanChunkActionIds(html);
  if (chunkActionIds.has(name)) return chunkActionIds.get(name);

  if (formFields) {
    const byFields = actionIdByFormFields(html, formFields);
    if (byFields) return byFields;
  }

  // หน้าที่มีฟอร์มเดียว (เช่น /login) — id ที่โผล่มาตัวเดียวคือตัวที่ต้องการแน่นอน
  if (ids.length === 1) return ids[0];
  throw new Error(`could not resolve action id for ${name}. ids seen: ${ids.join(",") || "(none)"}`);
}

async function postAction(path, cookie, actionId, fields) {
  const fd = new FormData();
  fd.set(`$ACTION_ID_${actionId}`, "");
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    body: fd,
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });
  const cookies = res.headers.getSetCookie();
  const html = res.status < 300 ? await res.text() : "";
  return { status: res.status, location: res.headers.get("location"), cookies, html };
}

// ทุกบัญชีในข้อมูลตัวอย่างใช้รหัสผ่านเดียวกันตามที่ prisma/seed.mjs ตั้งไว้
const TEST_PASSWORD = process.env.SEED_PASSWORD || "kpi-demo-2569";

async function realLogin(actionId, email, password = TEST_PASSWORD) {
  const r = await postAction("/login", undefined, actionId, { email, password });
  const uidCookie = r.cookies.find((c) => c.startsWith("uid="));
  return { ...r, uidCookie: uidCookie ? uidCookie.split(";")[0] : null };
}

async function get(path, cookie) {
  const res = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  const status = res.status;
  const location = res.headers.get("location");
  let body = "";
  if (status < 300) body = await res.text();
  const hasError = /Application error|Internal Server Error/i.test(body) || status >= 500;
  return { status, location, hasError, body };
}

/* ---------------- part 1: route / access-control crawl ---------------- */

function check(role, path, expected, actual, extraNote) {
  let ok =
    (expected.status === undefined || actual.status === expected.status) &&
    (expected.location === undefined || actual.location === expected.location);
  let note = extraNote || "";
  if (actual.hasError) {
    ok = false;
    note += " [server error detected in response body]";
  }
  results.push({
    role,
    path,
    expected: expected.location ? `${expected.status} -> ${expected.location}` : `${expected.status}`,
    actual: `${actual.status}${actual.location ? " -> " + actual.location : ""}`,
    ok,
    note,
  });
}

const ROLE_ROUTES = {
  admin: [
    ["/", { status: 307, location: "/admin" }],
    ["/admin", { status: 200 }],
    ["/admin/company/c1", { status: 200 }],
    ["/admin/company/does-not-exist", { status: 404 }],
    ["/dashboard", { status: 307, location: "/admin" }],
    ["/evaluate", { status: 307, location: "/admin" }],
    ["/manage", { status: 307, location: "/admin" }],
    ["/manage/announce", { status: 307, location: "/" }],
    ["/manage/cycles", { status: 307, location: "/" }],
    ["/manage/departments", { status: 307, location: "/" }],
    ["/manage/divisions", { status: 307, location: "/" }],
    ["/manage/employees", { status: 307, location: "/" }],
    ["/manage/org-kpi", { status: 307, location: "/" }],
    ["/manage/unit-kpi", { status: 307, location: "/" }],
    ["/me", { status: 307, location: "/admin" }],
    ["/me/kpi", { status: 307, location: "/admin" }],
  ],
  hr: [
    ["/", { status: 307, location: "/dashboard" }],
    ["/admin", { status: 307, location: "/" }],
    ["/dashboard", { status: 200 }],
    ["/evaluate", { status: 200 }],
    ["/manage", { status: 200 }],
    ["/manage/announce", { status: 200 }],
    ["/manage/cycles", { status: 200 }],
    ["/manage/departments", { status: 200 }],
    ["/manage/divisions", { status: 200 }],
    ["/manage/employees", { status: 200 }],
    ["/manage/org-kpi", { status: 200 }],
    ["/manage/unit-kpi", { status: 307, location: "/manage" }],
    ["/me", { status: 200 }],
    ["/me/kpi", { status: 200 }],
  ],
  ceo: [
    ["/", { status: 307, location: "/dashboard" }],
    ["/admin", { status: 307, location: "/" }],
    ["/dashboard", { status: 200 }],
    ["/evaluate", { status: 200 }],
    ["/manage", { status: 307, location: "/dashboard" }],
    ["/manage/announce", { status: 307, location: "/" }],
    ["/manage/unit-kpi", { status: 307, location: "/manage" }],
    ["/me", { status: 200 }],
    ["/me/kpi", { status: 200 }],
  ],
  division_head: [
    ["/", { status: 307, location: "/dashboard" }],
    ["/admin", { status: 307, location: "/" }],
    ["/dashboard", { status: 200 }],
    ["/evaluate", { status: 200 }],
    ["/manage", { status: 200 }],
    ["/manage/announce", { status: 307, location: "/" }],
    ["/manage/unit-kpi", { status: 200 }],
    ["/me", { status: 200 }],
    ["/me/kpi", { status: 200 }],
  ],
  dept_manager: [
    ["/", { status: 307, location: "/dashboard" }],
    ["/admin", { status: 307, location: "/" }],
    ["/dashboard", { status: 200 }],
    ["/evaluate", { status: 200 }],
    ["/manage", { status: 200 }],
    ["/manage/announce", { status: 307, location: "/" }],
    ["/manage/unit-kpi", { status: 200 }],
    ["/me", { status: 200 }],
    ["/me/kpi", { status: 200 }],
  ],
  employee: [
    ["/", { status: 307, location: "/me" }],
    ["/admin", { status: 307, location: "/" }],
    ["/dashboard", { status: 307, location: "/me" }],
    ["/evaluate", { status: 200 }],
    ["/manage", { status: 307, location: "/me" }],
    ["/manage/unit-kpi", { status: 307, location: "/manage" }],
    ["/me", { status: 200 }],
    ["/me/kpi", { status: 200 }],
  ],
};

const TEST_USERS = [
  { role: "admin", email: "admin@kpi.system" },
  { role: "hr", email: "hr@siamfoods.co.th" },
  { role: "hr", email: "hr@entech.co.th" },
  { role: "ceo", email: "ceo@siamfoods.co.th" },
  { role: "ceo", email: "ceo@entech.co.th" },
  { role: "division_head", email: "staff001@siamfoods.co.th" },
  { role: "dept_manager", email: "staff002@siamfoods.co.th" },
  { role: "employee", email: "staff003@siamfoods.co.th" },
  { role: "employee", email: "staff004@siamfoods.co.th" },
];

async function runRouteCrawl(loginActionId) {
  log("-- unauthenticated access --");
  for (const path of ["/", "/dashboard", "/admin", "/me", "/manage"]) {
    check("(none)", path, { status: 307, location: "/login" }, await get(path, undefined));
  }

  const bad = await realLogin(loginActionId, "nobody@nowhere.invalid");
  results.push({
    role: "(none)",
    path: "/login (POST, unknown email)",
    expected: "303 -> /login?error=1",
    actual: `${bad.status}${bad.location ? " -> " + bad.location : ""}`,
    ok: bad.status === 303 && bad.location === "/login?error=1",
    note: "",
  });

  for (const u of TEST_USERS) {
    log(`-- logging in as ${u.role} (${u.email}) --`);
    const login = await realLogin(loginActionId, u.email);
    if (!login.uidCookie) {
      results.push({ role: u.role, path: "/login (POST)", expected: "Set-Cookie: uid=...", actual: "no uid cookie set", ok: false, note: "LOGIN ITSELF FAILED" });
      continue;
    }
    for (const [path, expected, note] of ROLE_ROUTES[u.role] || []) {
      check(u.role, path, expected, await get(path, login.uidCookie), note);
    }
  }
}

/* ---------------- part 2: real evaluation flow (--full only) ---------------- */

// numeric columns come back as Prisma Decimal objects, never plain numbers
function n(v) {
  return v === null || v === undefined ? v : Number(v);
}

// ต้องตรงกับ lib/password.ts (scrypt, KEY_LEN 64, เก็บเป็น "salt:hash" hex)
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function record(name, ok, detail) {
  results.push({ role: "(flow)", path: name, expected: "works correctly", actual: ok ? "OK" : "FAILED", ok, note: detail || "" });
}

async function runEvaluationFlow(db, loginActionId) {
  log("\n-- full evaluation flow (throwaway test employee) --");
  const testEmail = `test-agent-${Date.now()}@siamfoods.co.th`;
  let testUserId;

  try {
    // 1. HR creates the throwaway employee
    const hrLogin = await realLogin(loginActionId, "hr@siamfoods.co.th");
    const empPage = await get("/manage/employees", hrLogin.uidCookie);
    const addEmpId = await actionId(empPage.body, "addEmployeeAction", ["emp_id", "position", "manager_id"]);
    if (!addEmpId) throw new Error("could not find addEmployeeAction id on /manage/employees");

    const created = await postAction("/manage/employees", hrLogin.uidCookie, addEmpId, {
      name: "Test Agent QA",
      email: testEmail,
      phone: "0000000000",
      emp_id: "QA-TEST-01",
      role: "employee",
      division_id: "d-c1-1",
      department_id: "dep-c1-1-1",
      position: "QA Test",
      manager_id: "u-c1-d1p1-mgr",
    });
    const row = await db.user.findFirst({ where: { email: testEmail }, select: { id: true } });
    testUserId = row?.id;
    record("HR creates employee", created.status === 200 && !!testUserId, `user id=${testUserId}`);
    if (!testUserId) return;

    // addEmployeeAction สุ่มรหัสผ่านแล้วโชว์ครั้งเดียวในหน้าจอ อ่านกลับจาก HTML ไม่ได้
    // ตั้งทับเป็นรหัสที่รู้อยู่แล้ว เพื่อให้ล็อกอินเป็นพนักงานคนนี้ต่อได้
    await db.user.update({
      where: { id: testUserId },
      data: { passwordHash: hashPassword(TEST_PASSWORD) },
    });

    // 2. employee logs in, self-assessment form must be present and unlocked
    const empLogin = await realLogin(loginActionId, testEmail);
    record("new employee can log in", !!empLogin.uidCookie);
    const kpiPage = await get("/me/kpi", empLogin.uidCookie);
    record("self-assessment form renders (unlocked)", kpiPage.body.includes("บันทึกร่าง"));
    const selfActionId = await actionId(kpiPage.body, "saveSelfAssessmentAction");

    // 3. submit self-assessment, weight 60/40, self scores 80/90 -> expect self_total 84
    const items = [
      { id: "it-test-1", title: "QA test KPI item", weight: 60, target: "100%", linkedKpiId: "k-c1-6", selfScore: 80, selfComment: "note1" },
      { id: "it-test-2", title: "QA test KPI item 2", weight: 40, target: "50 units", linkedKpiId: "k-c1-7", selfScore: 90, selfComment: "note2" },
    ];
    await postAction("/me/kpi", empLogin.uidCookie, selfActionId, {
      cycle_id: "cy-c1-1",
      items: JSON.stringify(items),
      remark: "QA automated test run",
      intent: "submit",
    });
    const assessment = await db.assessment.findFirst({ where: { userId: testUserId } });
    record(
      "self-assessment submits with correct weighted self_total",
      assessment?.status === "submitted" && n(assessment?.selfTotal) === 84,
      `status=${assessment?.status} self_total=${n(assessment?.selfTotal)} (expected 84)`
    );
    if (!assessment) return;

    // 4. manager evaluates: mgr scores 70/85 on same weights -> expect final_score 76
    const mgrLogin = await realLogin(loginActionId, "staff002@siamfoods.co.th");
    const evalPage = await get(`/evaluate/${assessment.id}`, mgrLogin.uidCookie);
    record("manager sees the submitted assessment", evalPage.body.includes("QA test KPI item"));
    const evalActionId = await actionId(evalPage.body, "saveEvaluationAction");
    const scores = { "it-test-1": { score: 70, comment: "mgr comment 1" }, "it-test-2": { score: 85, comment: "mgr comment 2" } };
    await postAction(`/evaluate/${assessment.id}`, mgrLogin.uidCookie, evalActionId, {
      assessment_id: assessment.id,
      scores: JSON.stringify(scores),
    });
    const finalRow = await db.assessment.findUnique({ where: { id: assessment.id } });
    record(
      "manager evaluation computes correct weighted final_score",
      finalRow?.status === "evaluated" && n(finalRow?.finalScore) === 76,
      `status=${finalRow?.status} final_score=${n(finalRow?.finalScore)} (expected 76)`
    );

    // 5. dashboards must render the new data without error
    const dashMgr = await get("/dashboard", mgrLogin.uidCookie);
    record("manager dashboard reflects new score, no error", dashMgr.body.includes("Test Agent QA") && !dashMgr.hasError);
    const divLogin = await realLogin(loginActionId, "staff001@siamfoods.co.th");
    const dashDiv = await get("/dashboard", divLogin.uidCookie);
    record("division dashboard renders with no error after new data", !dashDiv.hasError && dashDiv.status === 200);
    const dashHr = await get("/dashboard", hrLogin.uidCookie);
    record("HR/org dashboard renders with no error after new data", !dashHr.hasError && dashHr.status === 200);
  } finally {
    // cleanup — hard delete since the app's own UI cannot delete users, only deactivate
    if (testUserId) {
      // assessment_items ถูกลบตามด้วย on delete cascade ของ FK
      await db.assessment.deleteMany({ where: { userId: testUserId } });
      await db.user.delete({ where: { id: testUserId } });
      log(`-- cleaned up throwaway test employee ${testUserId} --`);
    }
  }
}

/* ---------------- main ---------------- */

async function main() {
  log(`== KPI system test agent — target ${BASE}${FULL ? " (full mode)" : ""} ==\n`);

  const loginPage = await (await fetch(`${BASE}/login`)).text();
  const loginActionId = await actionId(loginPage, "loginAction");
  if (!loginActionId) throw new Error("could not find login $ACTION_ID — login form markup may have changed");

  await runRouteCrawl(loginActionId);

  if (FULL) {
    const here = dirname(fileURLToPath(import.meta.url));
    const envFromFile = loadDotEnv(join(here, ".env")) ?? {};
    const envFromParent = loadDotEnv(join(here, "..", ".env"));
    const connectionString =
      process.env.DATABASE_URL || envFromFile.DATABASE_URL || envFromParent.DATABASE_URL;

    if (!connectionString) {
      log("\n[skipped --full] DATABASE_URL not found in env or alongside this script.");
    } else {
      const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
      try {
        await runEvaluationFlow(db, loginActionId);
      } finally {
        await db.$disconnect();
      }
    }
  }

  log("\n== Results ==\n");
  for (const r of results) {
    log(`[${r.ok ? "PASS" : "FAIL"}] ${r.role.padEnd(14)} ${r.path.padEnd(45)} expected=${r.expected}  actual=${r.actual}${r.note ? "  // " + r.note : ""}`);
  }
  const fails = results.filter((r) => !r.ok);
  log(`\n${results.length - fails.length}/${results.length} checks passed, ${fails.length} failed.\n`);
  if (fails.length) {
    log("== Failures needing attention ==");
    for (const r of fails) log(`- [${r.role}] ${r.path}: expected ${r.expected}, got ${r.actual}${r.note ? " — " + r.note : ""}`);
  }
  process.exitCode = fails.length ? 1 : 0;
}

main().catch((e) => {
  console.error("test agent crashed:", e);
  process.exit(1);
});
