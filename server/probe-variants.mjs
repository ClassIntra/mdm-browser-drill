import { lookup } from 'node:dns/promises';

// 验证各变体 URL 在 WHATWG URL(Chromium 同规)下的规范化结果
const forms = [
  ['DP1 decimal', 'http://3232245850:9011/x'],
  ['DP2 hex', 'http://0xc0a8285a:9011/x'],
  ['DP3 octal', 'http://0300.0250.050.0132:9011/x'],
  ['DP4 trailing-dot', 'http://192.168.40.90.:9011/x'],
  ['DP5 ipv6-mapped', 'http://[::ffff:192.168.40.90]:9011/x'],
  ['DP6 empty-userinfo', 'http://@192.168.40.90:9011/x'],
  ['DP7 quad-userinfo', 'http://1.2.3.4@192-168-40-90.nip.io:9011/x'],
];
for (const [name, u] of forms) {
  try {
    const x = new URL(u);
    console.log(name.padEnd(18), 'host=', x.host.padEnd(24), 'hostname=', x.hostname);
  } catch (e) {
    console.log(name.padEnd(18), 'URL ERROR:', e.message);
  }
}

// 验证「随机前缀 + 横线 IP」通配域名(网络层第二层探针 DP8 用)
const hosts = [
  'p7391.192-168-40-90.nip.io',
  'p7391-192-168-40-90.nip.io',
  'p7391.192-168-40-90.sslip.io',
];
for (const h of hosts) {
  try {
    const r = await lookup(h);
    console.log('DNS', h, '->', r.address);
  } catch (e) {
    console.log('DNS', h, 'FAIL', e.code || e.message);
  }
}
