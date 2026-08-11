/** @type {import('pm2').StartOptions[]} */
module.exports = {
  apps: [
    {
      name: 'commercenest-api',
      script: 'dist/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '512M',
      listen_timeout: 10000,
      kill_timeout: 5000,
    },
  ],
};
