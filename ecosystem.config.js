// PM2 config for VPS production deployment
module.exports = {
  apps: [
    {
      name: 'football-backend',
      script: 'packages/backend/dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
}
