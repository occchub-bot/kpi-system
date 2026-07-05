"use client";

import { useMemo, useState } from "react";
import { Th, Td, Tr, Score, Empty } from "@/components/ui";
import PaginatedTable from "@/components/PaginatedTable";

export interface MemberRow {
  id: string;
  name: string;
  empId: string;
  position: string;
  deptName: string;
  finalScore: number | null;
}

export default function MemberScoreTable({
  rows,
  showDept = false,
}: {
  rows: MemberRow[];
  showDept?: boolean;
}) {
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");

  const depts = useMemo(
    () => [...new Set(rows.map((r) => r.deptName).filter((d) => d && d !== "—"))],
    [rows]
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (showDept && dept && r.deptName !== dept) return false;
      if (!term) return true;
      return (
        r.name.toLowerCase().includes(term) ||
        r.empId.toLowerCase().includes(term) ||
        r.position.toLowerCase().includes(term)
      );
    });
  }, [rows, q, dept, showDept]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหา ชื่อ / EmpID / ตำแหน่ง"
          className="flex-1 min-w-56 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        />
        {showDept && depts.length > 0 && (
          <select
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          >
            <option value="">ทุกแผนก</option>
            {depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <Empty>ไม่พบพนักงานที่ตรงกับเงื่อนไข</Empty>
      ) : (
        <PaginatedTable
          key={`${q}|${dept}`}
          head={
            <>
              <Th>ชื่อ</Th>
              <Th>EmpID</Th>
              <Th>ตำแหน่ง</Th>
              {showDept && <Th>แผนก</Th>}
              <Th className="text-right">Final Score</Th>
            </>
          }
          rows={filtered.map((u) => (
            <Tr key={u.id}>
              <Td className="font-semibold">{u.name}</Td>
              <Td className="text-neutral-500">{u.empId}</Td>
              <Td>{u.position}</Td>
              {showDept && <Td className="text-neutral-500">{u.deptName}</Td>}
              <Td className="text-right"><Score value={u.finalScore} /></Td>
            </Tr>
          ))}
        />
      )}
    </div>
  );
}
