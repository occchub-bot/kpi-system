// pm2 config สำหรับเซิร์ฟเวอร์ production
//   PORT=3777 pm2 startOrReload ecosystem.config.js --update-env
//   pm2 save && pm2 startup     (ให้ขึ้นเองหลังรีบูต — ทำครั้งเดียว)
//
// DATABASE_URL และค่าอื่นอ่านจาก .env ที่ Next โหลดให้เอง ห้ามใส่ที่นี่
// แต่ PORT ต้องมาจากตรงนี้ เพราะ `next start` อ่าน PORT ตอน CLI เริ่ม ก่อนโหลด .env
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: process.env.PM2_NAME || "kpi-system",

      // ผูกกับโฟลเดอร์ที่ไฟล์นี้อยู่ ไม่ hardcode /srv/kpi-system
      cwd: __dirname,
      script: path.join(__dirname, "node_modules", "next", "dist", "bin", "next"),
      args: "start",

      // ใช้ node ตัวเดียวกับที่รัน pm2 — เขียนว่า "node" เฉย ๆ จะพึ่ง PATH ของ pm2 daemon
      // ซึ่งถ้าติดตั้ง node ด้วย nvm มักหาไม่เจอ แล้วตายเงียบ (log แอปว่างเปล่า)
      interpreter: process.execPath,

      exec_mode: "fork",
      instances: 1,
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 3777,
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      time: true,
    },
  ],
};
