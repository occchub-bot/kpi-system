// pm2 config สำหรับเซิร์ฟเวอร์ production
//   pm2 startOrReload ecosystem.config.js --update-env
//   pm2 save && pm2 startup     (ให้ขึ้นเองหลังรีบูต — ทำครั้งเดียว)
//
// DATABASE_URL และค่าอื่นอ่านจาก .env ที่ Next โหลดให้เอง ห้ามใส่ที่นี่
// PORT ต้องตั้งตรงนี้ เพราะ `next start` อ่าน PORT ตอน CLI เริ่ม ก่อนโหลด .env
module.exports = {
  apps: [
    {
      name: "kpi-system",
      cwd: "/srv/kpi-system",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      env: {
        NODE_ENV: "production",
        PORT: 3777,
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      time: true,
    },
  ],
};
