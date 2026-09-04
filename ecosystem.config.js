/**
 * PM2 config — ใช้บนเซิร์ฟเวอร์เท่านั้น
 * คู่กับ Next.js `output: "standalone"` → entry คือ server.js ที่ Next สร้างให้
 *
 *   PORT=3777 pm2 startOrReload ecosystem.config.js --update-env && pm2 save
 *
 * DATABASE_URL อ่านจาก .env ในโฟลเดอร์เดียวกัน (Next โหลดให้ตอน start) ห้ามใส่ที่นี่
 * ส่วน PORT ต้องมาจากตรงนี้ เพราะ server.js อ่าน PORT ก่อน Next จะโหลด .env
 */
module.exports = {
  apps: [
    {
      name: process.env.PM2_NAME || "kpi-system",
      script: "server.js",
      cwd: __dirname,

      // cluster เพื่อให้ pm2 reload เป็น zero-downtime
      exec_mode: "cluster",
      instances: 1,
      max_memory_restart: "512M",
      kill_timeout: 10000,

      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 3777,
        HOSTNAME: "127.0.0.1", // ให้ nginx เป็นตัวเดียวที่รับจากภายนอก
      },

      out_file: "logs/pm2-out.log",
      error_file: "logs/pm2-error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
