// แปลง row จาก Supabase (snake_case) เป็น entity ของแอป (camelCase) ตาม lib/types.ts
import type {
  Announcement,
  Assessment,
  AssessmentItem,
  Company,
  Cycle,
  Department,
  Division,
  Kpi,
  User,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export function toCompany(r: Row): Company {
  return { id: r.id, name: r.name, createdAt: r.created_at };
}

export function toDivision(r: Row): Division {
  return { id: r.id, companyId: r.company_id, name: r.name, headUserId: r.head_user_id };
}

export function toDepartment(r: Row): Department {
  return {
    id: r.id,
    companyId: r.company_id,
    divisionId: r.division_id,
    name: r.name,
    headUserId: r.head_user_id,
  };
}

export function toUser(r: Row): User {
  return {
    id: r.id,
    companyId: r.company_id,
    empId: r.emp_id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    role: r.role,
    divisionId: r.division_id,
    departmentId: r.department_id,
    position: r.position,
    managerId: r.manager_id,
    isActive: r.is_active,
    createdAt: r.created_at,
  };
}

export function toCycle(r: Row): Cycle {
  return {
    id: r.id,
    companyId: r.company_id,
    name: r.name,
    year: r.year,
    active: r.active,
    createdAt: r.created_at,
  };
}

export function toKpi(r: Row): Kpi {
  return {
    id: r.id,
    companyId: r.company_id,
    level: r.level,
    title: r.title,
    divisionId: r.division_id,
    departmentId: r.department_id,
    parentKpiId: r.parent_kpi_id,
    createdById: r.created_by_id,
    createdAt: r.created_at,
  };
}

export function toAssessmentItem(r: Row): AssessmentItem {
  return {
    id: r.item_id,
    title: r.title,
    weight: Number(r.weight),
    target: r.target,
    linkedKpiId: r.linked_kpi_id,
    selfScore: Number(r.self_score),
    selfComment: r.self_comment,
    evalScore: r.eval_score === null ? null : Number(r.eval_score),
    evalComment: r.eval_comment,
  };
}

export function toAssessment(r: Row, items: AssessmentItem[]): Assessment {
  return {
    id: r.id,
    companyId: r.company_id,
    cycleId: r.cycle_id,
    userId: r.user_id,
    evaluatorId: r.evaluator_id,
    items,
    remark: r.remark ?? undefined,
    status: r.status,
    selfTotal: r.self_total === null ? null : Number(r.self_total),
    finalScore: r.final_score === null ? null : Number(r.final_score),
    submittedAt: r.submitted_at,
    evaluatedAt: r.evaluated_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function toAnnouncement(r: Row): Announcement {
  return {
    id: r.id,
    companyId: r.company_id,
    message: r.message,
    createdById: r.created_by_id,
    createdAt: r.created_at,
  };
}

/** แปลง AssessmentItem[] ของ Assessment หนึ่งรายการ ให้เป็น row ของตาราง assessment_items (สำหรับ insert/update) */
export function itemsToRows(assessmentId: string, items: AssessmentItem[]): Row[] {
  return items.map((it, idx) => ({
    assessment_id: assessmentId,
    item_id: it.id,
    position: idx,
    title: it.title,
    weight: it.weight,
    target: it.target,
    linked_kpi_id: it.linkedKpiId,
    self_score: it.selfScore,
    self_comment: it.selfComment,
    eval_score: it.evalScore,
    eval_comment: it.evalComment,
  }));
}
