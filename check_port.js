const net = require('net');

const host = '192.168.178.44';
const port = 3001;

const client = new net.Socket();
const timeout = 5000; // 5 seconds

console.log(`Checking if port ${port} is open on ${host}...`);

client.setTimeout(timeout);

client.on('connect', function() {
  console.log(`SUCCESS: Port ${port} is open on ${host}`);
  client.destroy();
});

client.on('timeout', function() {
  console.log(`TIMEOUT: Connection to ${host}:${port} timed out after ${timeout}ms`);
  client.destroy();
});

client.on('error', function(err) {
  console.log(`ERROR: ${err.message}`);
  client.destroy();
});

client.connect(port, host); 