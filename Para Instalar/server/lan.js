const os = require('os');
const { execFileSync } = require('child_process');

function isTailscaleIface(name) {
  return /tailscale|wintun/i.test(String(name || ''));
}

function isTailscaleIp(address) {
  // Rango CGNAT de Tailscale: 100.64.0.0 – 100.127.255.255
  const m = String(address || '').match(/^100\.(\d+)\./);
  if (!m) return false;
  const second = Number(m[1]);
  return second >= 64 && second <= 127;
}

function skipIface(name) {
  if (isTailscaleIface(name)) return false;
  return /virtualbox|vmware|hyper-v|vethernet|docker|wsl|loopback|bluetooth|pseudo|zerotier|hamachi|default switch|virtual/i.test(String(name || ''));
}

function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const v4 = net.family === 'IPv4' || net.family === 4;
      if (!v4 || net.internal) continue;
      if (String(net.address).startsWith('169.254.')) continue;
      const tailscale = isTailscaleIface(name) || isTailscaleIp(net.address);
      out.push({
        name,
        address: net.address,
        tailscale,
        virtual: !tailscale && skipIface(name)
      });
    }
  }
  out.sort((a, b) => {
    if (a.tailscale !== b.tailscale) return a.tailscale ? -1 : 1;
    return Number(a.virtual) - Number(b.virtual);
  });
  return out;
}

function tailscaleCliInfo() {
  try {
    const raw = execFileSync('tailscale', ['status', '--json'], {
      encoding: 'utf8',
      timeout: 2500,
      windowsHide: true
    });
    const data = JSON.parse(raw);
    const self = data.Self || data.SelfStatus || null;
    const dns = self && (self.DNSName || self.DnsName);
    const ips = (self && self.TailscaleIPs) || [];
    const ip4 = ips.find((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip)) || null;
    let magic = dns ? String(dns).replace(/\.$/, '') : null;
    return { ip4, magic };
  } catch {
    try {
      const ip4 = String(execFileSync('tailscale', ['ip', '-4'], {
        encoding: 'utf8',
        timeout: 2000,
        windowsHide: true
      })).trim();
      if (/^100\.\d+\.\d+\.\d+$/.test(ip4)) return { ip4, magic: null };
    } catch {
      /* sin CLI */
    }
    return null;
  }
}

function accessUrls(port) {
  const p = Number(port || process.env.PORT || 3000);
  const all = lanAddresses();
  const fromIfaces = all.filter((a) => !a.virtual || a.tailscale);

  const lan = [];
  const tailscale = [];
  const seen = new Set();

  const push = (list, address, kind) => {
    if (!address || seen.has(address)) return;
    seen.add(address);
    list.push({
      address,
      url: `http://${address}:${p}`,
      kind
    });
  };

  for (const a of fromIfaces) {
    if (a.tailscale) push(tailscale, a.address, 'tailscale');
    else push(lan, a.address, 'lan');
  }

  const cli = tailscaleCliInfo();
  if (cli?.ip4) push(tailscale, cli.ip4, 'tailscale');
  if (cli?.magic) {
    const host = cli.magic.includes(':') ? `[${cli.magic}]` : cli.magic;
    if (!seen.has(cli.magic)) {
      seen.add(cli.magic);
      tailscale.unshift({
        address: cli.magic,
        url: `http://${host}:${p}`,
        kind: 'tailscale-dns'
      });
    }
  }

  return {
    lan: lan.map((x) => x.url),
    tailscale: tailscale.map((x) => x.url),
    all: [...lan, ...tailscale].map((x) => x.url)
  };
}

function lanUrls(port) {
  return accessUrls(port).all;
}

module.exports = { lanAddresses, lanUrls, accessUrls, isTailscaleIp };
