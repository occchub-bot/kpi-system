"use client";

import { useMemo, useState } from "react";
import { Th, Td, Tr, Badge, Empty, Modal, Field, Input, Select, Button, SubmitButton, type Tone } from "@/components/ui";
import PaginatedTable from "@/components/PaginatedTable";
import { updateEmployeeAction, setUserActiveAction, resetPasswordAction } from "@/lib/actions";
import type { Role } from "@/lib/types";

export interface EmpRow {
  id: string;
  name: string;
  position: string;
  empId: string;
  email: string;
  phone: string;
  role: Role;
  roleLabel: string;
  roleTone: Tone;
  divisionId: string | null;
  departmentId: string | null;
  managerId: string | null;
  deptName: string;
  managerName: string;
  isActive: boolean;
}

export interface Option {
  id: string;
  name: string;
}

const selectCls =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100";

export default function EmployeeAdminTable({
  rows,
  showManager = true,
  canManage = false,
  divisions = [],
  departments = [],
  managers = [],
  roleOptions = [],
}: {
  rows: EmpRow[];
  showManager?: boolean;
  canManage?: boolean;
  divisions?: Option[];
  departments?: Option[];
  managers?: Option[];
  roleOptions?: { value: Role; label: string }[];
}) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [dept, setDept] = useState("");
  const [editing, setEditing] = useState<EmpRow | null>(null);

  const roles = useMemo(() => [...new Set(rows.map((r) => r.roleLabel))], [rows]);
  const depts = useMemo(
    () => [...new Set(rows.map((r) => r.deptName).filter((d) => d && d !== "—"))],
    [rows]
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (role && r.roleLabel !== role) return false;
      if (dept && r.deptName !== dept) return false;
      if (!term) return true;
      return (
        r.name.toLowerCase().includes(term) ||
        r.empId.toLowerCase().includes(term) ||
        r.email.toLowerCase().includes(term) ||
        r.position.toLowerCase().includes(term)
      );
    });
  }, [rows, q, role, dept]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหา ชื่อ / EmpID / อีเมล / ตำแหน่ง"
          className="flex-1 min-w-56 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} className={selectCls}>
          <option value="">ทุกบทบาท</option>
          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {depts.length > 0 && (
          <select value={dept} onChange={(e) => setDept(e.target.value)} className={selectCls}>
            <option value="">ทุกแผนก</option>
            {depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <Empty>ไม่พบพนักงานที่ตรงกับเงื่อนไข</Empty>
      ) : (
        <PaginatedTable
          key={`${q}|${role}|${dept}`}
          head={
            <>
              <Th>ชื่อ</Th>
              <Th>EmpID</Th>
              <Th>บทบาท</Th>
              <Th>แผนก</Th>
              {showManager && <Th>ผู้บังคับบัญชา</Th>}
              {canManage && <Th>สถานะ</Th>}
              {canManage && <Th className="text-right">จัดการ</Th>}
            </>
          }
          rows={filtered.map((u) => (
            <Tr key={u.id}>
              <Td className="font-semibold">
                {u.name}
                <span className="block text-xs font-normal text-neutral-400">{u.position}</span>
              </Td>
              <Td className="text-neutral-500">{u.empId}</Td>
              <Td><Badge tone={u.roleTone}>{u.roleLabel}</Badge></Td>
              <Td className="text-neutral-500">{u.deptName}</Td>
              {showManager && <Td className="text-neutral-500">{u.managerName}</Td>}
              {canManage && (
                <Td>
                  <Badge tone={u.isActive ? "green" : "red"}>
                    {u.isActive ? "Active" : "ไม่ Active"}
                  </Badge>
                </Td>
              )}
              {canManage && (
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(u)}
                      className="text-xs text-neutral-500 underline hover:text-brand-800"
                    >
                      แก้ไข
                    </button>
                    <form action={setUserActiveAction}>
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="active" value={(!u.isActive).toString()} />
                      <SubmitButton className="text-xs text-neutral-500 underline hover:text-brand-800">
                        {u.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                      </SubmitButton>
                    </form>
                    <form action={resetPasswordAction}>
                      <input type="hidden" name="id" value={u.id} />
                      <SubmitButton className="text-xs text-neutral-500 underline hover:text-brand-800">
                        รีเซ็ตรหัสผ่าน
                      </SubmitButton>
                    </form>
                  </div>
                </Td>
              )}
            </Tr>
          ))}
        />
      )}

      <p className="text-xs text-neutral-400">แสดง {filtered.length} จาก {rows.length} คน</p>

      {canManage && (
        <Modal open={editing !== null} onClose={() => setEditing(null)} title="แก้ไขข้อมูลพนักงาน">
          {editing && (
            <form
              action={updateEmployeeAction}
              onSubmit={() => setEditing(null)}
              className="grid gap-3 sm:grid-cols-2"
            >
              <input type="hidden" name="id" value={editing.id} />
              <Field label="ชื่อ">
                <Input name="name" defaultValue={editing.name} required />
              </Field>
              <Field label="รหัสพนักงาน (EmpID)">
                <Input name="emp_id" defaultValue={editing.empId} />
              </Field>
              <Field label="อีเมล">
                <Input name="email" type="email" defaultValue={editing.email} required />
              </Field>
              <Field label="เบอร์โทร">
                <Input name="phone" defaultValue={editing.phone} />
              </Field>
              <Field label="ตำแหน่ง">
                <Input name="position" defaultValue={editing.position} />
              </Field>
              <Field label="บทบาท (Role)">
                <Select name="role" defaultValue={editing.role}>
                  {roleOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </Select>
              </Field>
              <Field label="ฝ่าย">
                <Select name="division_id" defaultValue={editing.divisionId ?? ""}>
                  <option value="">— ไม่ระบุ —</option>
                  {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
              <Field label="แผนก">
                <Select name="department_id" defaultValue={editing.departmentId ?? ""}>
                  <option value="">— ไม่ระบุ —</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
              <Field label="ผู้บังคับบัญชาผู้ประเมิน">
                <Select name="manager_id" defaultValue={editing.managerId ?? ""}>
                  <option value="">— ไม่ระบุ —</option>
                  {managers.filter((m) => m.id !== editing.id).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end sm:col-span-2">
                <Button>บันทึกการแก้ไข</Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
