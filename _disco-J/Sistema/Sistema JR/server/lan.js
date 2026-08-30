const os = require('os');

function skipIface(name) {
  return /virtualbox|vmware|hyper-v|vethernet|docker|wsl|loopback|bluetooth|pseudo|vpn|zerotier|hamachi|default switch|virtual/i.test(String(name || ''));
}

function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const v4 = net.family === 'IPv4' || net.family === 4;
      if (!v4 || net.internal) continue;
      if (String(net.address).startsWith('169.254.')) continue;
      out.push({
        name,
        address: net.address,
        virtual: skipIface(name)
      });
    }
  }
  out.sort((a, b) => Number(a.virtual) - Number(b.virtual));
  return out;
}

function lanUrls(port) {
  const all = lanAddresses();
  const real = all.filter((a) => !a.virtual);
  const list = real.length ? real : all;
  const p = Number(port || process.env.PORT || 3000);
  return list.map((a) => `http://${a.address}:${p}`);
}

module.exports = { lanAddresses, lanUrls };
