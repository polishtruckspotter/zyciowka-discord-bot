module.exports = {
  apps: [
    {
      name: "poznan-rp-bot",
      script: "src/index.js",
      watch: false,
      autorestart: true,
      max_memory_restart: "512M",
      exp_backoff_restart_delay: 1000,
      min_uptime: "10s",
      kill_timeout: 10000,
      time: true,
    },
  ],
};
