"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { newId } from "./store";
import { itemsToRows, toAssessmentItem } from "./mappers";
import { getCurrentUser, setSession, clearSession, verifyLogin } from "./auth";
import { setFlash, setPasswordReveal } from "./flash";
import { generatePassword, hashPassword, verifyPassword } from "./password";
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

/**
 * update/delete ที่กันข้ามบริษัทด้วยเงื่อนไขหลายคอลัมน์ ต้องใช้ updateMany/deleteMany
 * (Prisma update/delete รับได้เฉพาะ unique key) แต่สองตัวนั้นไม่ throw เมื่อไม่เจอแถว —
 * ถ้าไม่เช็ก count กลับมา เกราะกัน company_id จะกลายเป็น no-op เงียบ ๆ แล้วแอปจะแจ้ง "สำเร็จ"
 * ทั้งที่ไม่ได้เขียนอะไรเลย ทุกจุดที่เรียก updateMany/deleteMany แบบมีเงื่อนไขสิทธิ์ต้องผ่านตัวนี้
 */
async function guardAffected(
  result: { count: number },
  message = "ไม่พบข้อมูล หรือไม่มีสิทธิ์เข้าถึงข้อมูลนี้"
): Promise<boolean> {
  if (result.count === 0) {
    await setFlash(message, "error");
    return false;
  }
  return true;
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

/** ผู้ใช้ที่ล็อกอินอยู่เปลี่ยนรหัสผ่านของตัวเอง (ต้องยืนยันรหัสผ่านเดิมก่อน) */
export async function changeOwnPasswordAction(formData: FormData) {
  const me = await requireUser();
  const current = s(formData, "current_password");
  const next = s(formData, "new_password");
  const confirm = s(formData, "confirm_password");
  if (!current || !next || !confirm) {
    await setFlash("กรอกข้อมูลให้ครบ", "error");
    return;
  }
  if (next !== confirm) {
    await setFlash("รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน", "error");
    return;
  }
  if (next.length < 8) {
    await setFlash("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร", "error");
    return;
  }

  const row = await prisma.user.findUnique({
    where: { id: me.id },
    select: { passwordHash: true },
  });
  if (!verifyPassword(current, row?.passwordHash ?? null)) {
    await setFlash("รหัสผ่านปัจจุบันไม่ถูกต้อง", "error");
    return;
  }

  await prisma.user.update({ where: { id: me.id }, data: { passwordHash: hashPassword(next) } });
  await setFlash("เปลี่ยนรหัสผ่านสำเร็จ");
  revalidatePath("/account");
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
  // บริษัทที่ไม่มี HR เข้าไม่ถึงเลย — สร้างสองแถวนี้ให้สำเร็จพร้อมกันหรือไม่สำเร็จทั้งคู่
  await prisma.$transaction([
    prisma.company.create({ data: { id: companyId, name } }),
    prisma.user.create({
      data: {
        id: newId("u"),
        companyId,
        empId: "HR-000",
        name: "HR",
        email: hrEmail,
        passwordHash: hashPassword(password),
        phone: "-",
        role: "hr",
        divisionId: null,
        departmentId: null,
        position: "เจ้าหน้าที่ฝ่ายบุคคล (HR)",
        managerId: null,
        isActive: true,
      },
    }),
  ]);
  await setFlash(`เพิ่มบริษัท "${name}" แล้ว`);
  await setPasswordReveal(`บริษัท "${name}" — HR (${hrEmail})`, password);
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
  const count = await prisma.user.count({ where: { companyId } });
  const password = generatePassword();
  await prisma.user.create({
    data: {
      id: newId("u"),
      companyId,
      empId: "HR-" + String(count),
      name: "HR",
      email,
      passwordHash: hashPassword(password),
      phone: "-",
      role: "hr",
      divisionId: null,
      departmentId: null,
      position: "เจ้าหน้าที่ฝ่ายบุคคล (HR)",
      managerId: null,
      isActive: true,
    },
  });
  await setFlash(`เพิ่มอีเมล HR (${email}) แล้ว`);
  await setPasswordReveal(`HR (${email})`, password);
  revalidatePath(`/admin/company/${companyId}`);
}

/** admin ลบอีเมล HR ที่ไม่ต้องการออกจากบริษัท (ต้องเหลือ HR อย่างน้อย 1 คนเสมอ) */
export async function deleteHRAction(formData: FormData) {
  const me = await requireUser();
  if (me.role !== "admin") redirect("/");
  const id = s(formData, "id");
  const companyId = s(formData, "company_id");
  if (!id || !companyId) return;

  const count = await prisma.user.count({ where: { companyId, role: "hr" } });
  if (count <= 1) {
    await setFlash("ลบไม่ได้ ต้องมี HR อย่างน้อย 1 คนต่อบริษัท", "error");
    return;
  }

  const deleted = await prisma.user.deleteMany({ where: { id, companyId, role: "hr" } });
  if (!(await guardAffected(deleted, "ไม่พบอีเมล HR นี้ในบริษัท"))) return;
  await setFlash("ลบอีเมล HR แล้ว");
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
  await prisma.division.create({
    data: { id: newId("d"), companyId: me.companyId, name, headUserId: null },
  });
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
  await prisma.department.create({
    data: { id: newId("dep"), companyId: me.companyId, divisionId, name, headUserId: null },
  });
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
  const updated = await prisma.division.updateMany({
    where: { id, companyId: me.companyId },
    data: { name },
  });
  if (!(await guardAffected(updated, "ไม่พบฝ่ายนี้"))) return;
  await setFlash("แก้ไขชื่อฝ่ายแล้ว");
  revalidatePath("/manage/divisions");
}

export async function deleteDivisionAction(formData: FormData) {
  const me = await requireUser();
  if (me.role !== "hr" || !me.companyId) return;
  const id = s(formData, "id");
  if (!id) return;

  const div = await prisma.division.findFirst({
    where: { id, companyId: me.companyId },
    select: { id: true },
  });

  let ok = false;
  let reason = "ไม่พบฝ่าย";
  if (div) {
    const depCount = await prisma.department.count({ where: { divisionId: id } });
    const userCount = await prisma.user.count({ where: { divisionId: id } });
    if (depCount) {
      reason = "ลบไม่ได้ ยังมีแผนกอยู่ในฝ่ายนี้";
    } else if (userCount) {
      reason = "ลบไม่ได้ ยังมีพนักงานอยู่ในฝ่ายนี้";
    } else {
      await prisma.division.delete({ where: { id } });
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
  const updated = await prisma.department.updateMany({
    where: { id, companyId: me.companyId },
    data: { name, divisionId },
  });
  if (!(await guardAffected(updated, "ไม่พบแผนกนี้"))) return;
  await setFlash("แก้ไขแผนกแล้ว");
  revalidatePath("/manage/departments");
}

export async function deleteDepartmentAction(formData: FormData) {
  const me = await requireUser();
  if (me.role !== "hr" || !me.companyId) return;
  const id = s(formData, "id");
  if (!id) return;

  const dep = await prisma.department.findFirst({
    where: { id, companyId: me.companyId },
    select: { id: true },
  });

  let ok = false;
  let reason = "ไม่พบแผนก";
  if (dep) {
    const userCount = await prisma.user.count({ where: { departmentId: id } });
    if (userCount) {
      reason = "ลบไม่ได้ ยังมีพนักงานอยู่ในแผนกนี้";
    } else {
      await prisma.department.delete({ where: { id } });
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
  if (!managerId && role !== "ceo") {
    await setFlash(
      "กรุณาเลือกผู้บังคับบัญชาผู้ประเมิน (ไม่งั้นจะไม่มีใครเห็นการประเมินตนเองของพนักงานคนนี้เลย)",
      "error"
    );
    return;
  }

  const id = newId("u");
  const password = generatePassword();
  await prisma.user.create({
    data: {
      id,
      companyId: me.companyId,
      empId: empId || id.toUpperCase(),
      name,
      email,
      passwordHash: hashPassword(password),
      phone: phone || "-",
      role,
      divisionId,
      departmentId,
      position: position || "พนักงาน",
      managerId,
      isActive: true,
    },
  });

  // ตั้งเป็นหัวหน้าหน่วยงานอัตโนมัติตาม role (เฉพาะกรณีหน่วยงานยังไม่มีหัวหน้า)
  // เงื่อนไข headUserId: null อยู่ใน where เลย จึงไม่ต้องอ่านมาเช็กก่อนแล้วค่อยเขียน
  if (role === "dept_manager" && departmentId) {
    await prisma.department.updateMany({
      where: { id: departmentId, headUserId: null },
      data: { headUserId: id },
    });
  }
  if (role === "division_head" && divisionId) {
    await prisma.division.updateMany({
      where: { id: divisionId, headUserId: null },
      data: { headUserId: id },
    });
  }

  await setFlash(`เพิ่มพนักงาน "${name}" แล้ว`);
  await setPasswordReveal(`${name} (${email})`, password);
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
  if (!managerId && role !== "ceo") {
    await setFlash(
      "กรุณาเลือกผู้บังคับบัญชาผู้ประเมิน (ไม่งั้นจะไม่มีใครเห็นการประเมินตนเองของพนักงานคนนี้เลย)",
      "error"
    );
    return;
  }

  const updated = await prisma.user.updateMany({
    where: { id, companyId: me.companyId },
    data: {
      name,
      email,
      phone: phone || "-",
      ...(empId ? { empId } : {}),
      role,
      divisionId,
      departmentId,
      position: position || "พนักงาน",
      managerId,
    },
  });
  if (!(await guardAffected(updated, "ไม่พบพนักงานคนนี้"))) return;
  await setFlash(`แก้ไขข้อมูล "${name}" แล้ว`);
  revalidatePath("/manage/employees");
}

/**
 * HR ลบพนักงานออกจากระบบถาวร — เฉพาะกรณีคีย์ข้อมูลผิด (ยังไม่มีประวัติการประเมิน และไม่มีลูกน้องรายงานตรง)
 * พนักงานที่มีประวัติแล้วให้ปิดใช้งานแทน (setUserActiveAction) เพื่อรักษาประวัติคะแนนไว้
 */
export async function deleteEmployeeAction(formData: FormData) {
  const me = await requireUser();
  if (me.role !== "hr" || !me.companyId) return;
  const id = s(formData, "id");
  if (!id) return;

  const emp = await prisma.user.findFirst({
    where: { id, companyId: me.companyId },
    select: { id: true, name: true },
  });
  if (!emp) {
    await setFlash("ไม่พบพนักงาน", "error");
    return;
  }

  const assessmentCount = await prisma.assessment.count({ where: { userId: id } });
  if (assessmentCount) {
    await setFlash("ลบไม่ได้ พนักงานคนนี้มีประวัติการประเมินแล้ว — ใช้ปิดใช้งานแทน", "error");
    return;
  }

  const reportsCount = await prisma.user.count({ where: { managerId: id } });
  if (reportsCount) {
    await setFlash("ลบไม่ได้ ยังมีพนักงานที่รายงานตรงต่อคนนี้อยู่ — เปลี่ยนผู้บังคับบัญชาของพวกเขาก่อน", "error");
    return;
  }

  const deleted = await prisma.user.deleteMany({ where: { id, companyId: me.companyId } });
  if (!(await guardAffected(deleted, "ไม่พบพนักงาน"))) return;
  await setFlash(`ลบพนักงาน "${emp.name}" แล้ว`);
  revalidatePath("/manage/employees");
}

/** HR เปิด/ปิดใช้งานพนักงาน — พนักงานที่ปิดใช้งานจะไม่ถูกนำคะแนนมาคิดเฉลี่ย */
export async function setUserActiveAction(formData: FormData) {
  const me = await requireUser();
  if (me.role !== "hr" || !me.companyId) return;
  const id = s(formData, "id");
  const active = s(formData, "active") === "true";
  if (!id) return;

  const updated = await prisma.user.updateMany({
    where: { id, companyId: me.companyId },
    data: { isActive: active },
  });
  if (!(await guardAffected(updated, "ไม่พบพนักงานคนนี้"))) return;
  await setFlash(active ? "เปิดใช้งานพนักงานแล้ว" : "ปิดใช้งานพนักงานแล้ว");
  revalidatePath("/manage/employees");
}

/**
 * ตั้งรหัสผ่านใหม่แบบสุ่มให้ผู้ใช้ (HR ทำได้เฉพาะพนักงานบริษัทตนเอง, admin ทำได้ทุกคน)
 * คืนค่ารหัสผ่านที่สุ่มได้กลับไปให้ client component คัดลอกเข้าคลิปบอร์ดทันที
 */
export async function resetPasswordAction(
  formData: FormData
): Promise<{ email: string; password: string } | { error: string }> {
  const me = await requireUser();
  const id = s(formData, "id");
  if (!id) return { error: "ไม่พบผู้ใช้" };
  if (me.role !== "hr" && me.role !== "admin") redirect("/");

  if (me.role === "hr" && !me.companyId) return { error: "ไม่พบผู้ใช้" };
  const target = await prisma.user.findFirst({
    where: { id, ...(me.role === "hr" ? { companyId: me.companyId } : {}) },
    select: { id: true, email: true, companyId: true },
  });
  if (!target) {
    return { error: "ไม่พบผู้ใช้" };
  }

  const password = generatePassword();
  await prisma.user.update({ where: { id }, data: { passwordHash: hashPassword(password) } });
  revalidatePath("/manage/employees");
  revalidatePath("/admin");
  if (target.companyId) revalidatePath(`/admin/company/${target.companyId}`);
  return { email: target.email, password };
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
  const companyId = me.companyId;
  await prisma.$transaction(async (tx) => {
    // ปิดรอบเดิมก่อน — บริษัทหนึ่งมีรอบ active ได้ทีละรอบเท่านั้น
    // (0 แถวเป็นเรื่องปกติ ตอนสร้างรอบแรกของบริษัท จึงไม่ต้องเช็ก count)
    if (active) {
      await tx.cycle.updateMany({ where: { companyId }, data: { active: false } });
    }
    await tx.cycle.create({
      data: { id: newId("cy"), companyId, name, year, active },
    });
  });
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
  await prisma.kpi.create({
    data: {
      id: newId("k"),
      companyId: me.companyId,
      level: "org",
      title,
      divisionId: null,
      departmentId: null,
      parentKpiId: null,
      createdById: me.id,
    },
  });
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
    await prisma.kpi.create({
      data: {
        id: newId("k"),
        companyId: me.companyId,
        level: "division",
        title,
        divisionId: me.divisionId,
        departmentId: null,
        parentKpiId,
        createdById: me.id,
      },
    });
  } else if (me.role === "dept_manager" && me.departmentId) {
    await prisma.kpi.create({
      data: {
        id: newId("k"),
        companyId: me.companyId,
        level: "department",
        title,
        divisionId: me.divisionId,
        departmentId: me.departmentId,
        parentKpiId,
        createdById: me.id,
      },
    });
  }
  await setFlash("เพิ่ม KPI แล้ว");
  revalidatePath("/manage/unit-kpi");
}

/** ลบ KPI (องค์กร/ฝ่าย/แผนก) — ต้องเป็นเจ้าของขอบเขตนั้นๆ เท่านั้น (HR ลบ KPI องค์กร, division_head ลบ KPI ฝ่ายตัวเอง, dept_manager ลบ KPI แผนกตัวเอง) */
export async function deleteKpiAction(formData: FormData) {
  const me = await requireUser();
  if (!me.companyId) return;
  const id = s(formData, "id");
  if (!id) return;

  const kpi = await prisma.kpi.findFirst({
    where: { id, companyId: me.companyId },
    select: { id: true, level: true, divisionId: true, departmentId: true },
  });
  if (!kpi) {
    await setFlash("ไม่พบ KPI", "error");
    return;
  }

  const allowed =
    (kpi.level === "org" && me.role === "hr") ||
    (kpi.level === "division" && me.role === "division_head" && kpi.divisionId === me.divisionId) ||
    (kpi.level === "department" && me.role === "dept_manager" && kpi.departmentId === me.departmentId);
  if (!allowed) {
    await setFlash("ไม่มีสิทธิ์ลบ KPI นี้", "error");
    return;
  }

  await prisma.kpi.delete({ where: { id } });
  await setFlash("ลบ KPI แล้ว");
  revalidatePath("/manage/org-kpi");
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

/** transaction client ของ Prisma (ตัวเดียวกับ prisma แต่ไม่มีเมธอด $transaction/$connect ฯลฯ) */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** เขียน assessment_items ทั้งหมดใหม่ (ลบของเดิมแล้ว insert ชุดใหม่ — ง่ายและถูกต้องกว่า diff เป็นรายแถว) */
async function replaceAssessmentItems(tx: Tx, assessmentId: string, items: AssessmentItem[]) {
  await tx.assessmentItem.deleteMany({ where: { assessmentId } });
  if (items.length > 0) {
    await tx.assessmentItem.createMany({ data: itemsToRows(assessmentId, items) });
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
  for (const it of items) {
    if (!it.title.trim() || !it.target.trim()) {
      await setFlash("ทุกรายการต้องกรอกหัวข้อ KPI และตัวชี้วัด", "error");
      return;
    }
    if (!(it.weight > 0 && it.weight <= 100)) {
      await setFlash("น้ำหนักงาน(weight)แต่ละรายการต้องมากกว่า 0 และไม่เกิน 100", "error");
      return;
    }
    if (!(it.selfScore >= 0 && it.selfScore <= 100)) {
      await setFlash("คะแนนประเมินตนเองแต่ละรายการต้องอยู่ระหว่าง 0–100", "error");
      return;
    }
  }
  if (submit && items.length === 0) {
    await setFlash("เพิ่ม KPI อย่างน้อย 1 ข้อก่อนส่ง", "error");
    return;
  }
  if (submit) {
    const totalWeight = items.reduce((sum, i) => sum + (Number(i.weight) || 0), 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      await setFlash(`น้ำหนักงาน(weight)รวมทุกรายการต้องเท่ากับ 100% พอดี (ตอนนี้ ${totalWeight}%)`, "error");
      return;
    }
  }

  const selfTotal = weighted(items.map((i) => ({ weight: i.weight, score: i.selfScore })));
  const companyId = me.companyId;

  // header กับ items ต้องลงด้วยกัน ไม่งั้นอาจเหลือ assessment ที่ไม่มีรายการ KPI เลย
  const locked = await prisma.$transaction(async (tx) => {
    const existing = await tx.assessment.findUnique({
      where: { userId_cycleId: { userId: me.id, cycleId } },
    });

    if (existing && existing.status !== "draft") return true;

    if (!existing) {
      const id = newId("as");
      await tx.assessment.create({
        data: {
          id,
          companyId,
          cycleId,
          userId: me.id,
          evaluatorId: me.managerId,
          remark,
          status: submit ? "submitted" : "draft",
          selfTotal,
          finalScore: null,
          submittedAt: submit ? new Date() : null,
          evaluatedAt: null,
        },
      });
      await replaceAssessmentItems(tx, id, items);
    } else {
      // เก็บคะแนนหัวหน้าเดิมไว้ถ้ามีการประเมินแล้ว
      const prevItemRows = await tx.assessmentItem.findMany({
        where: { assessmentId: existing.id },
      });
      const prevEval = new Map(prevItemRows.map(toAssessmentItem).map((it) => [it.id, it]));
      const mergedItems = items.map((it) => {
        const p = prevEval.get(it.id);
        return p ? { ...it, evalScore: p.evalScore, evalComment: p.evalComment } : it;
      });

      await tx.assessment.update({
        where: { id: existing.id },
        data: {
          evaluatorId: me.managerId,
          selfTotal,
          remark,
          ...(submit ? { status: "submitted" as const, submittedAt: new Date() } : {}),
        },
      });
      await replaceAssessmentItems(tx, existing.id, mergedItems);
    }
    return false;
  });

  if (locked) {
    await setFlash("ส่งข้อมูลนี้ไปแล้ว ไม่สามารถแก้ไขได้อีก", "error");
    return;
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

  const result = await prisma.$transaction(async (tx) => {
    const aRow = await tx.assessment.findUnique({ where: { id: assessmentId } });
    if (!aRow) return null;

    const owner = await tx.user.findUnique({
      where: { id: aRow.userId },
      select: { id: true, name: true, managerId: true },
    });

    // ตรวจสิทธิ์: ต้องเป็นหัวหน้าของเจ้าของรายการ
    if (!owner || owner.managerId !== me.id) return null;

    const itemRows = await tx.assessmentItem.findMany({ where: { assessmentId } });
    const items = itemRows.map(toAssessmentItem).map((it) => {
      const v = scores[it.id];
      return v ? { ...it, evalScore: Number(v.score) || 0, evalComment: v.comment ?? "" } : it;
    });
    const finalScore = weighted(items.map((i) => ({ weight: i.weight, score: i.evalScore })));

    await tx.assessment.update({
      where: { id: assessmentId },
      data: {
        status: "evaluated",
        evaluatedAt: new Date(),
        evaluatorId: me.id,
        finalScore,
      },
    });
    await replaceAssessmentItems(tx, assessmentId, items);

    return { ownerName: owner.name, finalScore };
  });

  if (result) {
    await setFlash(`บันทึกผลประเมิน ${result.ownerName} แล้ว (คะแนน ${result.finalScore ?? "-"})`);
  } else {
    await setFlash("ไม่สามารถบันทึกผลประเมินได้", "error");
  }
  revalidatePath("/evaluate");
  revalidatePath(`/evaluate/${assessmentId}`);
  revalidatePath("/dashboard");
}

/** HR รีเซ็ตการประเมินที่ค้าง/ผิดพลาดกลับเป็นร่าง เพื่อให้เจ้าของเริ่มกรอกใหม่ได้ */
export async function resetAssessmentToDraftAction(formData: FormData) {
  const me = await requireUser();
  if (me.role !== "hr" || !me.companyId) return;
  const assessmentId = s(formData, "assessment_id");
  if (!assessmentId) return;

  const a = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, companyId: true, user: { select: { name: true } } },
  });

  if (!a || a.companyId !== me.companyId) {
    await setFlash("ไม่พบรายการประเมินนี้", "error");
    return;
  }

  // updatedAt แตะเองอัตโนมัติจาก @updatedAt ใน schema.prisma
  await prisma.assessment.update({
    where: { id: assessmentId },
    data: {
      status: "draft",
      selfTotal: null,
      finalScore: null,
      submittedAt: null,
      evaluatedAt: null,
    },
  });

  await setFlash(`รีเซ็ตการประเมินของ ${a.user.name} กลับเป็นร่างแล้ว`);
  revalidatePath("/manage/employees");
  revalidatePath("/evaluate");
  revalidatePath("/dashboard");
  revalidatePath("/me/kpi");
  revalidatePath("/me");
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

  await prisma.announcement.create({
    data: {
      id: newId("ann"),
      companyId: me.companyId,
      message,
      createdById: me.id,
    },
  });
  await setFlash("ส่งข้อความถึงพนักงานทุกคนแล้ว");
  revalidatePath("/manage/announce");
  revalidatePath("/", "layout");
}
