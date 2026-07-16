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
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment (same values as .env.local) so the
// script can read/clean up rows the UI itself doesn't expose (assessment_items, hard delete of the
// throwaway user — the app's own UI only supports deactivating real employees, never deleting).

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://localhost:3002";
const FULL = process.argv.includes("--full");

function loadDotEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
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

/** For pages where we know only 2 action ids exist (logout + the one we want) */
function pickNonLogoutActionId(html) {
  const { ids } = extractActionIds(html);
  const other = ids.find((id) => id !== "00bcffa75fbaf5ffb175e9871e1da4d70403b171b9");
  if (!other) throw new Error("could not find target action id — page markup may have changed. ids seen: " + ids.join(","));
  return other;
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

async function realLogin(actionId, email) {
  const r = await postAction("/login", undefined, actionId, { email });
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

async function sb(env, path, init) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: init?.method === "POST" ? "return=representation" : undefined,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok && res.status !== 204) throw new Error(`Supabase ${path} -> ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

function record(name, ok, detail) {
  results.push({ role: "(flow)", path: name, expected: "works correctly", actual: ok ? "OK" : "FAILED", ok, note: detail || "" });
}

async function runEvaluationFlow(env, loginActionId) {
  log("\n-- full evaluation flow (throwaway test employee) --");
  const testEmail = `test-agent-${Date.now()}@siamfoods.co.th`;
  let testUserId;

  try {
    // 1. HR creates the throwaway employee
    const hrLogin = await realLogin(loginActionId, "hr@siamfoods.co.th");
    const empPage = await get("/manage/employees", hrLogin.uidCookie);
    const { named } = extractActionIds(empPage.body);
    const addEmpId = named.get("addEmployeeAction");
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
    const [row] = await sb(env, `/users?select=id&email=eq.${testEmail}`);
    testUserId = row?.id;
    record("HR creates employee", created.status === 200 && !!testUserId, `user id=${testUserId}`);
    if (!testUserId) return;

    // 2. employee logs in, self-assessment form must be present and unlocked
    const empLogin = await realLogin(loginActionId, testEmail);
    record("new employee can log in", !!empLogin.uidCookie);
    const kpiPage = await get("/me/kpi", empLogin.uidCookie);
    record("self-assessment form renders (unlocked)", kpiPage.body.includes("บันทึกร่าง"));
    const selfActionId = pickNonLogoutActionId(kpiPage.body);

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
    const [assessment] = await sb(env, `/assessments?select=*&user_id=eq.${testUserId}`);
    record(
      "self-assessment submits with correct weighted self_total",
      assessment?.status === "submitted" && assessment?.self_total === 84,
      `status=${assessment?.status} self_total=${assessment?.self_total} (expected 84)`
    );
    if (!assessment) return;

    // 4. manager evaluates: mgr scores 70/85 on same weights -> expect final_score 76
    const mgrLogin = await realLogin(loginActionId, "staff002@siamfoods.co.th");
    const evalPage = await get(`/evaluate/${assessment.id}`, mgrLogin.uidCookie);
    record("manager sees the submitted assessment", evalPage.body.includes("QA test KPI item"));
    const evalActionId = pickNonLogoutActionId(evalPage.body);
    const scores = { "it-test-1": { score: 70, comment: "mgr comment 1" }, "it-test-2": { score: 85, comment: "mgr comment 2" } };
    await postAction(`/evaluate/${assessment.id}`, mgrLogin.uidCookie, evalActionId, {
      assessment_id: assessment.id,
      scores: JSON.stringify(scores),
    });
    const [finalRow] = await sb(env, `/assessments?select=*&id=eq.${assessment.id}`);
    record(
      "manager evaluation computes correct weighted final_score",
      finalRow?.status === "evaluated" && finalRow?.final_score === 76,
      `status=${finalRow?.status} final_score=${finalRow?.final_score} (expected 76)`
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
      const [a] = await sb(env, `/assessments?select=id&user_id=eq.${testUserId}`);
      if (a) {
        await sb(env, `/assessment_items?assessment_id=eq.${a.id}`, { method: "DELETE" });
        await sb(env, `/assessments?id=eq.${a.id}`, { method: "DELETE" });
      }
      await sb(env, `/users?id=eq.${testUserId}`, { method: "DELETE" });
      log(`-- cleaned up throwaway test employee ${testUserId} --`);
    }
  }
}

/* ---------------- main ---------------- */

async function main() {
  log(`== KPI system test agent — target ${BASE}${FULL ? " (full mode)" : ""} ==\n`);

  const loginPage = await (await fetch(`${BASE}/login`)).text();
  const loginActionId = extractActionIds(loginPage).named.get("loginAction") || pickNonLogoutActionIdSafe(loginPage);
  if (!loginActionId) throw new Error("could not find login $ACTION_ID — login form markup may have changed");

  await runRouteCrawl(loginActionId);

  if (FULL) {
    const here = dirname(fileURLToPath(import.meta.url));
    const envFromFile = loadDotEnv(join(here, ".env.local")) ?? {};
    const envFromParent = loadDotEnv(join(here, "..", ".env.local"));
    const env = {
      SUPABASE_URL: process.env.SUPABASE_URL || envFromFile.SUPABASE_URL || envFromParent.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY:
        process.env.SUPABASE_SERVICE_ROLE_KEY || envFromFile.SUPABASE_SERVICE_ROLE_KEY || envFromParent.SUPABASE_SERVICE_ROLE_KEY,
    };
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      log("\n[skipped --full] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in env or alongside this script.");
    } else {
      await runEvaluationFlow(env, loginActionId);
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

function pickNonLogoutActionIdSafe(html) {
  try {
    return pickNonLogoutActionId(html);
  } catch {
    return undefined;
  }
}

main().catch((e) => {
  console.error("test agent crashed:", e);
  process.exit(1);
});
