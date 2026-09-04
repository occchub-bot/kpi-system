import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // กำหนด root ให้ชัด เพื่อตัด warning เรื่อง lockfile ซ้อนจากโฟลเดอร์ home
  turbopack: {
    root: __dirname,
  },

  // Prisma ต้องถูก require แบบ native ห้ามถูก bundle เข้า server bundle
  // (@prisma/client อยู่ใน list อัตโนมัติของ Next อยู่แล้ว แต่ driver adapter กับ pg ไม่อยู่)
  serverExternalPackages: ["@prisma/adapter-pg", "pg"],
};

export default nextConfig;
