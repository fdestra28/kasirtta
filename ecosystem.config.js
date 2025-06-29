module.exports = {
  apps: [
    {
      name: 'kasirtta',
      script: 'server.js', // Ganti dengan file utama aplikasi kamu (misal index.js)
      cwd: '/root/kasirtta',
      watch: true,
      ignore_watch: ['node_modules', '.git', 'logs'],
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      }
    }
  ]
};
