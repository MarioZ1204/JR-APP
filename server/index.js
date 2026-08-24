const path = require('path');
const os = require('os');
const http = require('http');
const express = require('express');
const session = require('express-session');
const { Server } = require('socket.io');

const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  console.error('Se requiere Node.js 22 o superior. Ahora tiene', process.version);
  console.error('Descargue LTS en https://nodejs.org');
  process.exit(1);
}

const db = require('./db');
const { mountApi } = require('./api');
const { autoBackup } = require('./backup');
const { publicUser } = require('./db');

db.init();
autoBackup();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const sessionMiddleware = session({
  name: 'jr.sid',
  secret: db.getSetting('session_secret', 'jr-local-secret'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 16 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
});

app.use(sessionMiddleware);
app.use(express.json({ limit: '1mb' }));
app.use((req, _res, next) => {
  req.io = io;
  next();
});
app.use(express.static(path.join(__dirname, '..', 'public')));

mountApi(app);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const wrap = (middleware) => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));
io.use((socket, next) => {
  const user = socket.request.session && socket.request.session.user;
  if (!user) return next(new Error('No autenticado'));
  socket.user = publicUser(user);
  next();
});
io.on('connection', (socket) => {
  socket.join('staff');
  socket.emit('hello', { user: socket.user });
});

function lanIPs() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const family = net.family === 'IPv4' || net.family === 4;
      if (family && !net.internal) out.push(net.address);
    }
  }
  return out;
}

const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, '0.0.0.0', () => {
  const ips = lanIPs();
  console.log('');
  console.log('  JR Burger — sistema local');
  console.log('  --------------------------------');
  console.log(`  En este PC:   http://localhost:${PORT}`);
  if (ips.length) {
    for (const ip of ips) console.log(`  En la red:    http://${ip}:${PORT}`);
  } else {
    console.log('  (No se detectó IP de red local)');
  }
  console.log('');
  console.log('  Usuarios iniciales: admin / mesero / cocina / cajero');
  console.log('  Contraseña inicial: el mismo nombre + 123  (ej. admin123)');
  console.log('  Cambie las claves desde Usuarios.');
  console.log('');
});
