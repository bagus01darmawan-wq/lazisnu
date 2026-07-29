const Redis = require('ioredis');
const r = new Redis('redis://redis-staging:6379');
setTimeout(function() {
  console.log('Status:', r.status);
  r.ping().then(function(p) {
    console.log('PING OK:', p);
    r.disconnect();
    process.exit(0);
  }).catch(function(e) {
    console.log('PING ERR:', e.code, e.message);
    r.disconnect();
    process.exit(1);
  });
}, 2000);
