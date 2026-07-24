"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabase } from "./supabase";
import { newId, nowISO } from "./store";
import { itemsToRows, toAssessmentItem } from "./mappers";
import { getCurrentUser, setSession, clearSession, verifyLogin } from "./auth";
import { setFlash } from "./flash";
import { generatePassword, hashPassword } from "./password";
import type { AssessmentItem, Role } from "./types";

async function requireUser() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

function s(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}
function num(fd: FormData, k: string): number {
  const n = Number(fd.get(k));
  return Number.isFinite(n) ? n : 0;
}

/** throw ถ้า Supabase คืน error — โยนให้ error.tsx ของ Next.js จัดการ (กรณีนี้ไม่ควรเกิดถ้า schema ถูกต้อง) */
function check<T extends { error: { message: string } | null }>(res: T): T {
  if (res.error) throw new Error(`Supabase error: ${res.error.message}`);
  return res;
}

/* ---------------- auth ---------------- */
export async function loginAction(formData: FormData) {
  const email = s(formData, "email");
  const password = s(formData, "password");
  const user = await verifyLogin(email, password);
  if (!user) {
    await setFlash("อีเมลหรือรหัสผ่านไม่ถูกต้อง", "error");
    redirect("/login?error=1");
  }
  await setSession(user.id);
  await setFlash(`ยินดีต้อนรับ ${user.name}`);
  redirect("/");
}

export async function logoutAction() {
  await clearSession();
  await setFlash("ออกจากระบบแล้ว");
  redirect("/login");
}

/* ---------------- admin: companies + HR ---------------- */
export async function addCompanyAction(formData: FormData) {
  const me = await requireUser();
  if (me.role !== "admin") redirect("/");
  const name = s(formData, "name");
  const hrEmail = s(formData, "hr_email");
  if (!name || !hrEmail) {
    await setFlash("กรอกชื่อบริษัทและอีเมล HR ให้ครบ", "error");
    return;
  }

  const companyId = newId("c");
  const password = generatePassword();
  check(await supabase.from("companies").insert({ id: companyId, name, created_at: nowISO() }));
  check(
    await supabase.from("users").insert({
      id: newId("u"),
      company_id: companyId,
      emp_id: "HR-000",
      name: "HR",
      email: hrEmail,
      password_hash: hashPassword(password),
      phone: "-",
      role: "hr",
      division_id: null,
      department_id: null,
      position: "เจ้าหน้าที่ฝ่ายบุคคล (HR)",
      manager_id: null,
      is_active: true,
      created_at: nowISO(),
    })
  );
  await setFlash(`เพิ่มบริษัท "${name}" แล้ว — รหัสผ่าน HR (${hrEmail}): ${password}`);
  revalidatePath("/admin");
}

export async function addHRAction(formData: FormData) {
  const me = await requireUser();
  if (me.role !== "admin") redirect("/");
  const companyId = s(formData, "company_id");
  const email = s(formData, "email");
  if (!companyId || !email) {
    await setFlash("กรอกอีเมล HR ให้ครบ", "error");
    return;
  }
  const { count } = check(
    await supabase.from("users").select("id", { count: "exact", head: true }).eq("company_id", companyId)
  );
  const password = generatePassword();
  check(
    await supabase.from("users").insert({
      id: newId("u"),
      company_id: companyId,
      emp_id: "HR-" + String(count ?? 0),
      name: "HR",
      email,
      password_hash: hashPassword(password),
      phone: "-",
      role: "hr",
      division_id: null,
      department_id: null,
      position: "เจ้าหน้าที่ฝ่ายบุคคล (HR)",
      manager_id: null,
      is_active: true,
      created_at: nowISO(),
    })
  );
  await setFlash(`เพิ่มอีเมล HR (${email}) แล้ว — รหัสผ่าน: ${password}`);
  revalidatePath(`/admin/company/${companyId}`);
}

/* ---------------- HR: structure ---------------- */
export async function addDivisionAction(formData: FormData) {
  const me = await requireUser();
  if (!me.companyId) return;
  const name = s(formData, "name");
  if (!name) {
    await setFlash("กรอกชื่อฝ่าย", "error");
    return;
  }
  check(
    await supabase.from("divisions").insert({
      id: newId("d"),
      company_id: me.companyId,
      name,
      head_user_id: null,
    })
  );
  await setFlash(`เพิ่มฝ่าย "${name}" แล้ว`);
  revalidatePath("/manage/divisions");
}

export async function addDepartmentAction(formData: FormData) {
  const me = await requireUser();
  if (!me.companyId) return;
  const divisionId = s(formData, "division_id");
  const name = s(formData, "name");
  if (!divisionId || !name) {
    await setFlash("เลือกฝ่ายและกรอกชื่อแผนก", "error");
    return;
  }
  check(
    await supabase.from("departments").insert({
      id: newId("dep"),
      company_id: me.companyId,
      division_id: divisionId,
      name,
      head_user_id: null,
    })
  );
  await setFlash(`เพิ่มแผนก "${name}" แล้ว`);
  revalidatePath("/manage/departments");
}

export async function updateDivisionAction(formData: FormData) {
  const me = await requireUser();
  if (me.role !== "hr" || !me.companyId) return;
  const id = s(formData, "id");
  const name = s(formData, "name");
  if (!id || !name) {
    await setFlash("กรอกชื่อฝ่าย", "error");
    return;
  }
  check(
    await supabase.from("divisions").update({ name }).eq("id", id).eq("company_id", me.companyId)
  );
  await setFlash("แก้ไขชื่อฝ่ายแล้ว");
  revalidatePath("/manage/divisions");
}

export async function deleteDivisionAction(formData: FormData) {
  const me = await requireUser();
  if (me.role !== "hr" || !me.companyId) return;
  const id = s(formData, "id");
  if (!id) return;

  const { data: div } = await supabase
    .from("divisions")
    .select("id")
    .eq("id", id)
    .eq("company_id", me.companyId)
    .maybeSingle();

  let ok = false;
  let reason = "ไม่พบฝ่าย";
  if (div) {
    const { count: depCount } = check(
      await supabase.from("departments").select("id", { count: "exact", head: true }).eq("division_id", id)
    );
    const { count: userCount } = check(
      await supabase.from("users").select("id", { count: "exact", head: true }).eq("division_id", id)
    );
    if (depCount) {
      reason = "ลบไม่ได้ ยังมีแผนกอยู่ในฝ่ายนี้";
    } else if (userCount) {
      reason = "ลบไม่ได้ ยังมีพนักงานอยู่ในฝ่ายนี้";
    } else {
      check(await supabase.from("divisions").delete().eq("id", id));
      ok = true;
    }
  }

  await setFlash(ok ? "ลบฝ่ายแล้ว" : reason, ok ? "success" : "error");
  revalidatePath("/manage/divisions");
}

export async function updateDepartmentAction(formData: FormData) {
  const me = await requireUser();
  if (me.role !== "hr" || !me.companyId) return;
  const id = s(formData, "id");
  const name = s(formData, "name");
  const divisionId = s(formData, "division_id");
  if (!id || !name || !divisionId) {
    await setFlash("กรอกชื่อแผนกและเลือกฝ่าย", "error");
    return;
  }
  check(
    await supabase
      .from("departments")
      .update({ name, division_id: divisionId })
      .eq("id", id)
      .eq("company_id", me.companyId)
  );
  await setFlash("แก้ไขแผนกแล้ว");
  revalidatePath("/manage/departments");
}

export async function deleteDepartmentAction(formData: FormData) {
  const me = await requireUser();
  if (me.role !== "hr" || !me.companyId) return;
  const id = s(formData, "id");
  if (!id) return;

  const { data: dep } = await supabase
    .from("departments")
    .select("id")
    .eq("id", id)
    .eq("company_id", me.companyId)
    .maybeSingle();

  let ok = false;
  let reason = "ไม่พบแผนก";
  if (dep) {
    const { count: userCount } = check(
      await supabase.from("users").select("id", { count: "exact", head: true }).eq("department_id", id)
    );
    if (userCount) {
      reason = "ลบไม่ได้ ยังมีพนักงานอยู่ในแผนกนี้";
    } else {
      check(await supabase.from("departments").delete().eq("id", id));
      ok = true;
    }
  }

  await setFlash(ok ? "ลบแผนกแล้ว" : reason, ok ? "success" : "error");
  revalidatePath("/manage/departments");
}

export async function addEmployeeAction(formData: FormData) {
  const me = await requireUser();
  if (!me.companyId) return;
  const name = s(formData, "name");
  const email = s(formData, "email");
  const phone = s(formData, "phone");
  const empId = s(formData, "emp_id");
  const role = (s(formData, "role") || "employee") as Role;
  const divisionId = s(formData, "division_id") || null;
  const departmentId = s(formData, "department_id") || null;
  const position = s(formData, "position");
  const managerId = s(formData, "manager_id") || null;
  if (!name || !email) {
    await setFlash("กรอกชื่อและอีเมลพนักงานให้ครบ", "error");
    return;
  }

  const id = newId("u");
  const password = generatePassword();
  check(
    await supabase.from("users").insert({
      id,
      company_id: me.companyId,
      emp_id: empId || id.toUpperCase(),
      name,
      email,
      password_hash: hashPassword(password),
      phone: phone || "-",
      role,
      division_id: divisionId,
      department_id: departmentId,
      position: position || "พนักงาน",
      manager_id: managerId,
      is_active: true,
      created_at: nowISO(),
    })
  );

  // ตั้งเป็นหัวหน้าหน่วยงานอัตโนมัติตาม role (เฉพาะกรณีหน่วยงานยังไม่มีหัวหน้า)
  if (role === "dept_manager" && departmentId) {
    const { data: dep } = await supabase
      .from("departments")
      .select("head_user_id")
      .eq("id", departmentId)
      .maybeSingle();
    if (dep && !dep.head_user_id) {
      await supabase.from("departments").update({ head_user_id: id }).eq("id", departmentId);
    }
  }
  if (role === "division_head" && divisionId) {
    const { data: div } = await supabase
      .from("divisions")
      .select("head_user_id")
      .eq("id", divisionId)
      .maybeSingle();
    if (div && !div.head_user_id) {
      await supabase.from("divisions").update({ head_user_id: id }).eq("id", divisionId);
    }
  }

  await setFlash(`เพิ่มพนักงาน "${name}" แล้ว — รหัสผ่าน: ${password}`);
  revalidatePath("/manage/employees");
}

/** HR แก้ไขข้อมูลพนักงาน (ไม่รวมสถานะ active — แยกไปที่ setUserActiveAction) */
export async function updateEmployeeAction(formData: FormData) {
  const me = await requireUser();
  if (me.role !== "hr" || !me.companyId) return;
  const id = s(formData, "id");
  const name = s(formData, "name");
  const email = s(formData, "email");
  const phone = s(formData, "phone");
  const empId = s(formData, "emp_id");
  const role = (s(formData, "role") || "employee") as Role;
  const divisionId = s(formData, "division_id") || null;
  const departmentId = s(formData, "department_id") || null;
  const position = s(formData, "position");
  const managerId = s(formData, "manager_id") || null;
  if (!id || !name || !email) {
    await setFlash("กรอกชื่อและอีเมลพนักงานให้ครบ", "error");
    return;
  }

  check(
    await supabase
      .from("users")
      .update({
        name,
        email,
        phone: phone || "-",
        ...(empId ? { emp_id: empId } : {}),
        role,
        division_id: divisionId,
        department_id: departmentId,
        position: position || "พนักงาน",
        manager_id: managerId,
      })
      .eq("id", id)
      .eq("company_id", me.companyId)
  );
  await setFlash(`แก้ไขข้อมูล "${name}" แล้ว`);
  revalidatePath("/manage/employees");
}

/** HR เปิด/ปิดใช้งานพนักงาน — พนักงานที่ปิดใช้งานจะไม่ถูกนำคะแนนมาคิดเฉลี่ย (ลบไม่ได้ ทำได้แค่ปิดใช้งาน) */
export async function setUserActiveAction(formData: FormData) {
  const me = await requireUser();
  if (me.role !== "hr" || !me.companyId) return;
  const id = s(formData, "id");
  const active = s(formData, "active") === "true";
  if (!id) return;

  check(
    await supabase
      .from("users")
      .update({ is_active: active })
      .eq("id", id)
      .eq("company_id", me.companyId)
  );
  await setFlash(active ? "เปิดใช้งานพนักงานแล้ว" : "ปิดใช้งานพนักงานแล้ว");
  revalidatePath("/manage/employees");
}

/** ตั้งรหัสผ่านใหม่แบบสุ่มให้ผู้ใช้ (HR ทำได้เฉพาะพนักงานบริษัทตนเอง, admin ทำได้ทุกคน) */
export async function resetPasswordAction(formData: FormData) {
  const me = await requireUser();
  const id = s(formData, "id");
  if (!id) return;
  if (me.role !== "hr" && me.role !== "admin") redirect("/");

  let q = supabase.from("users").select("id,email,company_id").eq("id", id);
  if (me.role === "hr") {
    if (!me.companyId) return;
    q = q.eq("company_id", me.companyId);
  }
  const { data: target } = await q.maybeSingle();
  if (!target) {
    await setFlash("ไม่พบผู้ใช้", "error");
    return;
  }

  const password = generatePassword();
  check(await supabase.from("users").update({ password_hash: hashPassword(password) }).eq("id", id));
  await setFlash(`ตั้งรหัสผ่านใหม่ให้ ${target.email} แล้ว: ${password}`);
  revalidatePath("/manage/employees");
  revalidatePath("/admin");
  if (target.company_id) revalidatePath(`/admin/company/${target.company_id}`);
}

export async function addCycleAction(formData: FormData) {
  const me = await requireUser();
  if (!me.companyId) return;
  const name = s(formData, "name");
  const year = num(formData, "year") || new Date().getFullYear() + 543;
  const active = formData.get("active") === "on";
  if (!name) {
    await setFlash("กรอกชื่อรอบประเมิน", "error");
    return;
  }
  if (active) {
    check(
      await supabase.from("cycles").update({ active: false }).eq("company_id", me.companyId)
    );
  }
  check(
    await supabase.from("cycles").insert({
      id: newId("cy"),
      company_id: me.companyId,
      name,
      year,
      active,
      created_at: nowISO(),
    })
  );
  await setFlash(`สร้างรอบประเมิน "${name}" แล้ว`);
  revalidatePath("/manage/cycles");
}

/* ---------------- KPI definitions ---------------- */
export async function addOrgKpiAction(formData: FormData) {
  const me = await requireUser();
  if (me.role !== "hr" || !me.companyId) return;
  const title = s(formData, "title");
  if (!title) {
    await setFlash("กรอกหัวข้อ KPI", "error");
    return;
  }
  check(
    await supabase.from("kpis").insert({
      id: newId("k"),
      company_id: me.companyId,
      level: "org",
      title,
      division_id: null,
      department_id: null,
      parent_kpi_id: null,
      created_by_id: me.id,
      created_at: nowISO(),
    })
  );
  await setFlash("เพิ่ม KPI องค์กรแล้ว");
  revalidatePath("/manage/org-kpi");
}

/** เพิ่ม KPI ฝ่าย/แผนก ตามขอบเขตของผู้ใช้ปัจจุบัน */
export async function addUnitKpiAction(formData: FormData) {
  const me = await requireUser();
  if (!me.companyId) return;
  const title = s(formData, "title");
  const parentKpiId = s(formData, "parent_kpi_id") || null;
  if (!title) {
    await setFlash("กรอกหัวข้อ KPI", "error");
    return;
  }

  if (me.role === "division_head" && me.divisionId) {
    check(
      await supabase.from("kpis").insert({
        id: newId("k"),
        company_id: me.companyId,
        level: "division",
        title,
        division_id: me.divisionId,
        department_id: null,
        parent_kpi_id: parentKpiId,
        created_by_id: me.id,
        created_at: nowISO(),
      })
    );
  } else if (me.role === "dept_manager" && me.departmentId) {
    check(
      await supabase.from("kpis").insert({
        id: newId("k"),
        company_id: me.companyId,
        level: "department",
        title,
        division_id: me.divisionId,
        department_id: me.departmentId,
        parent_kpi_id: parentKpiId,
        created_by_id: me.id,
        created_at: nowISO(),
      })
    );
  }
  await setFlash("เพิ่ม KPI แล้ว");
  revalidatePath("/manage/unit-kpi");
}

/* ---------------- self assessment ---------------- */
function weighted(items: { weight: number; score: number | null }[]): number | null {
  const valid = items.filter((i) => i.score !== null);
  if (!valid.length) return null;
  const w = valid.reduce((s2, i) => s2 + (i.weight || 0), 0);
  if (w <= 0) return null;
  const sum = valid.reduce((s2, i) => s2 + (i.weight || 0) * (i.score as number), 0);
  return Math.round((sum / w) * 10) / 10;
}

function parseItems(raw: string): AssessmentItem[] {
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((x: Record<string, unknown>, i): AssessmentItem => ({
    id: typeof x.id === "string" ? x.id : `it-${i}`,
    title: String(x.title ?? "").trim(),
    weight: Number(x.weight) || 0,
    target: String(x.target ?? "").trim(),
    linkedKpiId: x.linkedKpiId ? String(x.linkedKpiId) : null,
    selfScore: Number(x.selfScore) || 0,
    selfComment: String(x.selfComment ?? "").trim(),
    evalScore: null,
    evalComment: "",
  }));
}

/** เขียน assessment_items ทั้งหมดใหม่ (ลบของเดิมแล้ว insert ชุดใหม่ — ง่ายและถูกต้องกว่า diff เป็นรายแถว) */
async function replaceAssessmentItems(assessmentId: string, items: AssessmentItem[]) {
  check(await supabase.from("assessment_items").delete().eq("assessment_id", assessmentId));
  if (items.length > 0) {
    check(await supabase.from("assessment_items").insert(itemsToRows(assessmentId, items)));
  }
}

/** บันทึก/ส่ง การประเมินตนเองของผู้ใช้ปัจจุบันในรอบที่กำหนด */
export async function saveSelfAssessmentAction(formData: FormData) {
  const me = await requireUser();
  if (!me.companyId) return;
  const cycleId = s(formData, "cycle_id");
  const submit = s(formData, "intent") === "submit";
  const items = parseItems(s(formData, "items"));
  const remark = s(formData, "remark").trim();
  if (!cycleId) return;
  if (submit && items.length === 0) {
    await setFlash("เพิ่ม KPI อย่างน้อย 1 ข้อก่อนส่ง", "error");
    return;
  }
  if (submit) {
    const totalWeight = items.reduce((sum, i) => sum + (Number(i.weight) || 0), 0);
    if (totalWeight > 100) {
      await setFlash(`น้ำหนักรวมทุกรายการไม่ควรเกิน 100% (ตอนนี้ ${totalWeight}%)`, "error");
      return;
    }
  }

  const selfTotal = weighted(items.map((i) => ({ weight: i.weight, score: i.selfScore })));

  const { data: existingRow } = await supabase
    .from("assessments")
    .select("*")
    .eq("user_id", me.id)
    .eq("cycle_id", cycleId)
    .maybeSingle();

  if (!existingRow) {
    const id = newId("as");
    check(
      await supabase.from("assessments").insert({
        id,
        company_id: me.companyId,
        cycle_id: cycleId,
        user_id: me.id,
        evaluator_id: me.managerId,
        remark,
        status: submit ? "submitted" : "draft",
        self_total: selfTotal,
        final_score: null,
        submitted_at: submit ? nowISO() : null,
        evaluated_at: null,
        created_at: nowISO(),
        updated_at: nowISO(),
      })
    );
    await replaceAssessmentItems(id, items);
  } else {
    // เก็บคะแนนหัวหน้าเดิมไว้ถ้ามีการประเมินแล้ว
    const { data: prevItemRows } = await supabase
      .from("assessment_items")
      .select("*")
      .eq("assessment_id", existingRow.id);
    const prevEval = new Map((prevItemRows ?? []).map(toAssessmentItem).map((it) => [it.id, it]));
    const mergedItems = items.map((it) => {
      const p = prevEval.get(it.id);
      return p ? { ...it, evalScore: p.evalScore, evalComment: p.evalComment } : it;
    });

    const patch: Record<string, unknown> = {
      evaluator_id: me.managerId,
      self_total: selfTotal,
      remark,
    };
    if (submit) {
      patch.status = "submitted";
      patch.submitted_at = nowISO();
    }
    check(await supabase.from("assessments").update(patch).eq("id", existingRow.id));
    await replaceAssessmentItems(existingRow.id, mergedItems);
  }

  await setFlash(submit ? "ส่งให้ผู้บังคับบัญชาประเมินแล้ว" : "บันทึกร่างแล้ว");
  revalidatePath("/me/kpi");
  revalidatePath("/me");
}

/** หัวหน้าบันทึกการประเมินลูกน้อง */
export async function saveEvaluationAction(formData: FormData) {
  const me = await requireUser();
  const assessmentId = s(formData, "assessment_id");
  if (!assessmentId) return;

  let scores: Record<string, { score: number; comment: string }> = {};
  try {
    scores = JSON.parse(s(formData, "scores"));
  } catch {
    scores = {};
  }

  const { data: aRow } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", assessmentId)
    .maybeSingle();

  let ok = false;
  let ownerName: string | undefined;
  let finalScore: number | null = null;

  if (aRow) {
    const { data: owner } = await supabase
      .from("users")
      .select("id, name, manager_id")
      .eq("id", aRow.user_id)
      .maybeSingle();

    // ตรวจสิทธิ์: ต้องเป็นหัวหน้าของเจ้าของรายการ
    if (owner && owner.manager_id === me.id) {
      const { data: itemRows } = await supabase
        .from("assessment_items")
        .select("*")
        .eq("assessment_id", assessmentId);
      const items = (itemRows ?? []).map(toAssessmentItem).map((it) => {
        const v = scores[it.id];
        return v ? { ...it, evalScore: Number(v.score) || 0, evalComment: v.comment ?? "" } : it;
      });
      finalScore = weighted(items.map((i) => ({ weight: i.weight, score: i.evalScore })));

      check(
        await supabase
          .from("assessments")
          .update({
            status: "evaluated",
            evaluated_at: nowISO(),
            evaluator_id: me.id,
            final_score: finalScore,
          })
          .eq("id", assessmentId)
      );
      await replaceAssessmentItems(assessmentId, items);

      ok = true;
      ownerName = owner.name;
    }
  }

  if (ok) {
    await setFlash(`บันทึกผลประเมิน ${ownerName ?? ""} แล้ว (คะแนน ${finalScore ?? "-"})`);
  } else {
    await setFlash("ไม่สามารถบันทึกผลประเมินได้", "error");
  }
  revalidatePath("/evaluate");
  revalidatePath(`/evaluate/${assessmentId}`);
  revalidatePath("/dashboard");
}

/* ---------------- ประกาศจาก HR ---------------- */
/** HR ส่งข้อความเดียวกันถึงพนักงานทุกคนในบริษัท */
export async function sendAnnouncementAction(formData: FormData) {
  const me = await requireUser();
  if (me.role !== "hr" || !me.companyId) return;
  const message = s(formData, "message");
  if (!message) {
    await setFlash("กรอกข้อความก่อนส่ง", "error");
    return;
  }

  check(
    await supabase.from("announcements").insert({
      id: newId("ann"),
      company_id: me.companyId,
      message,
      created_by_id: me.id,
      created_at: nowISO(),
    })
  );
  await setFlash("ส่งข้อความถึงพนักงานทุกคนแล้ว");
  revalidatePath("/manage/announce");
  revalidatePath("/", "layout");
}
