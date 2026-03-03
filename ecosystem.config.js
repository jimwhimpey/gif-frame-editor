module.exports = {
  apps: [
    {
      name: 'gif-frame-editor',
      script: 'node_modules/.bin/vite',
      args: 'preview',
      cwd: '/Users/jim/Sites/gif-frame-editor',
      env: {
        NODE_ENV: 'production',
      },
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
