// ============================================================
// MDM 浏览器层过滤演习 —— 实验室静态 + 日志服务器(零依赖)
// 用途:仅在自有环境(192.168.40.90:9011)提供演习页并逐请求留痕
// 启动: node lab-server.mjs          (默认端口 9011)
// 环境: PORT / PAD_MB 可覆盖
// ============================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.ROOT || path.join(__dir, '..', 'pages');
const REC  = process.env.REC  || path.join(__dir, '..', 'records');
const PORT = Number(process.env.PORT || 9011);
const ALT_PORT = Number(process.env.ALT_PORT || 18081); // 端口无关性对照(N3)
const PAD_MB = Number(process.env.PAD_MB || 0); // 默认不注入填充

const ACCESS = path.join(REC, 'access.log');
const OBSERVE = path.join(REC, 'observe.csv');

fs.mkdirSync(REC, { recursive: true });

function ts() { return new Date().toISOString(); }
function clean(s) { return String(s ?? '').replace(/[\r\n,]+/g, ' '); }

function logLine(line) {
  fs.appendFile(ACCESS, line + '\n', () => {});
}
function logReq(req, status, extra = '') {
  const ua = req.headers['user-agent'] || '-';
  const ref = req.headers['referer'] || '-';
  const site = req.headers['sec-fetch-site'] || '-';
  const dest = req.headers['sec-fetch-dest'] || '-';
  const mode = req.headers['sec-fetch-mode'] || '-';
  logLine(`[${ts()}] ${req.socket.remoteAddress} "${req.method} ${req.url}" ${status} UA=${clean(ua)} REF=${clean(ref)} SF=${site}/${dest}/${mode} ${extra}`);
}
function observeRow(q) {
  const row = ['CASE=' + clean(q.get('case')), 'TS=' + ts(), 'RESULT=' + clean(q.get('result')), 'UA=' + clean(q.get('ua') || '-'), 'NOTE=' + clean(q.get('note'))].join(',');
  if (!fs.existsSync(OBSERVE)) fs.appendFileSync(OBSERVE, 'CASE,TS,RESULT,UA,NOTE\n');
  fs.appendFile(OBSERVE, row + '\n', () => {});
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

function serve(req, res) {
  req.on('error', () => {});
  res.on('error', () => {});
  const url = new URL(req.url, `http://${req.headers.host || 'x'}`);
  const p = url.pathname;

  // CORS 预检探测(DP11):预检本身放行并留痕,「预检是否被引擎拦」即可观测
  if (req.method === 'OPTIONS') {
    logReq(req, 204, 'PREFLIGHT');
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*',
      'Access-Control-Max-Age': '600',
    });
    return res.end();
  }

  // 重定向探针(DP12):302 → 裸 IP 绝对地址,验证二次导航是否被逐跳重判
  // 可选 to= 指定落地文件名(DP19 前置步骤用,白名单化防路径注入)
  if (p === '/redir') {
    const c = clean(url.searchParams.get('case') || 'DP12');
    const to = (clean(url.searchParams.get('to') || 'case-dp.html').match(/[a-zA-Z0-9._-]+/) || ['case-dp.html'])[0];
    const target = `http://192.168.40.90:9011/${to}?case=${c}&hit=1`;
    logReq(req, 302, `REDIR -> ${target}`);
    res.writeHead(302, { Location: target });
    return res.end();
  }

  // XHR 重定向中继(DP14):302 → 裸 IP 的 /api/ping,验证 XHR 跟随重定向是否同样豁免
  if (p === '/redir-xhr') {
    const c = clean(url.searchParams.get('case') || 'DP14');
    const target = `http://192.168.40.90:9011/api/ping?case=${c}`;
    logReq(req, 302, `REDIR-XHR -> ${target}`);
    res.writeHead(302, { Location: target });
    return res.end();
  }

  // 子资源可达性探针:返回最小 JSON(带 CORS 头,DP9-11 页内可读结果)
  if (p === '/api/ping') {
    logReq(req, 200);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ ok: 1, t: Date.now() }));
  }

  // 观察回传(设备页内 JS 一键上报)
  if (p === '/api/observe') {
    observeRow(url.searchParams);
    logReq(req, 204, `OBSERVE case=${clean(url.searchParams.get('case'))} result=${clean(url.searchParams.get('result'))}`);
    res.writeHead(204); return res.end();
  }

  if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }

  // 1x1 透明 PNG 探针(H 组子资源被动加载用):返回真实图片,确保 onload 可判「到达」
  if (/^\/px[0-9]*\.png$/.test(p)) {
    logReq(req, 200, `PX case=${clean(url.searchParams.get('case'))}`);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    return res.end(png);
  }

  // 静态页
  let file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    logReq(req, 404);
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('not found');
  }
  logReq(req, 200);
  let body = fs.readFileSync(file);
  const ext = path.extname(file);
  // D-C 大文档对照:ab.html?pad=8 注入约 8MB JS 注释块
  const padMB = Number(url.searchParams.get('pad') ?? PAD_MB);
  if (p.endsWith('ab.html') && padMB > 0) {
    const fill = '/*' + 'x'.repeat(Math.max(0, padMB * 1024 * 1024 - 4)) + '*/';
    const chunk = Buffer.from(`<script>${fill}</script>`, 'utf8');
    body = Buffer.concat([body, chunk]);
  }
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
}

// WebSocket 可达性探针:只做 101 握手并留痕(不承载帧)
function onUpgrade(req, socket) {
  socket.on('error', () => {});
  const ua = req.headers['user-agent'] || '-';
  logLine(`[${ts()}] ${socket.remoteAddress} "WS-UPGRADE ${req.url}" UA=${clean(ua)}`);
  const key = req.headers['sec-websocket-key'] || '';
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  setTimeout(() => { try { socket.destroy(); } catch {} }, 5000);
}

// 同一 handler 起两个独立 server(9011 主 + 18081 端口无关性对照)
const srvMain = http.createServer((req, res) => serve(req, res));
const srvAlt = http.createServer((req, res) => serve(req, res));
srvMain.on('upgrade', onUpgrade);
srvAlt.on('upgrade', onUpgrade);
srvMain.on('clientError', (err, socket) => { try { socket.destroy(); } catch {} });
srvAlt.on('clientError', (err, socket) => { try { socket.destroy(); } catch {} });

srvMain.listen(PORT, '0.0.0.0', () => {
  fs.appendFileSync(ACCESS, `[${ts()}] server start port=${PORT} root=${ROOT} rec=${REC}\n`);
  console.log(`[lab] listening on 0.0.0.0:${PORT}`);
  console.log(`[lab] access log: ${ACCESS}`);
  console.log(`[lab] observe csv: ${OBSERVE}`);
});
srvAlt.listen(ALT_PORT, '0.0.0.0', () => {
  console.log(`[lab] alt listening on 0.0.0.0:${ALT_PORT} (port-independence, N3)`);
});
