const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const { Server } = require('socket.io');
const { accessUrls } = require('./lan');
const { DATA_DIR, BACKUP_DIR, usingAppData, isProtectedInstall } = require('./paths');

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
const { SqliteSessionStore } = require('./session-store');

db.init();
autoBackup();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000
});

const sessionTtlMs = 16 * 60 * 60 * 1000;
const sessionMiddleware = session({
  name: 'jr.sid',
  secret: db.getSetting('session_secret', 'jr-local-secret'),
  resave: false,
  saveUninitialized: false,
  store: new SqliteSessionStore({ ttlMs: sessionTtlMs }),
  cookie: {
    httpOnly: true,
    maxAge: sessionTtlMs,
    sameSite: 'lax'
  }
});

app.use(sessionMiddleware);
app.use(express.json({ limit: '3mb' }));
app.use((req, _res, next) => {
  req.io = io;
  next();
});
const PUBLICO = path.join(__dirname, '..', 'public');

// Los iconos y fuentes se piden con ?v=N, así que se pueden guardar mucho tiempo:
// al cambiar la versión el navegador pide una URL distinta. El HTML y el service
// worker se revalidan siempre, para que una actualización llegue de inmediato.
app.use(express.static(PUBLICO, {
  maxAge: '30d',
  setHeaders(res, ruta) {
    const nombre = path.basename(ruta);
    if (nombre === 'index.html' || nombre === 'sw.js' || nombre === 'manifest.webmanifest') {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

mountApi(app);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(PUBLICO, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  const status = Number(err.http || err.status || 500);
  if (String(req.path || '').startsWith('/api')) {
    return res.status(status).json({ error: err.message || 'No se pudo completar. Intente de nuevo.' });
  }
  res.status(status).send('Error');
});

const wrap = (middleware) => (socket, next) => {
  const res = {
    end: () => {},
    writeHead: () => {},
    getHeader: () => undefined,
    setHeader: () => {},
    write: () => {}
  };
  middleware(socket.request, res, next);
};
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
  console.log('[socket] conectado:', socket.user.username, '@', socket.handshake.address);
});
io.engine.on('connection_error', (err) => {
  console.warn('[socket] error de enlace:', err.message || err);
});

const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, '0.0.0.0', () => {
  const access = accessUrls(PORT);
  console.log('');
  console.log('  JR Burger — sistema local');
  console.log('  --------------------------------');
  console.log(`  En este PC:     http://localhost:${PORT}`);
  if (access.lan.length) {
    console.log('  WiFi / cable (misma red):');
    for (const url of access.lan) console.log(`    ${url}`);
  }
  if (access.tailscale.length) {
    console.log('  Tailscale (desde cualquier red, con Tailscale activo):');
    for (const url of access.tailscale) console.log(`    ${url}`);
    console.log('  Cuenta Tailscale: jrburgerpasto@gmail.com');
  } else {
    console.log('  Tailscale: no conectado. Ejecute conectar-tailscale.bat');
    console.log('  e inicie sesion con jrburgerpasto@gmail.com');
  }
  if (!access.lan.length && !access.tailscale.length) {
    console.log('  (No hay IP de red usable. Conecte WiFi/cable o inicie Tailscale.)');
  } else {
    console.log('  Escriba la dirección completa, con :' + PORT + ' al final.');
    if (access.lan.length) {
      console.log('  En WiFi local el celular debe estar en la misma red (no datos).');
    }
    if (access.tailscale.length) {
      console.log('  Con Tailscale: el celular también debe tener Tailscale e iniciar sesión.');
    }
  }
  console.log('');
  console.log('  Usuarios: admin / mesero / cocina / cajero');
  console.log('  Cambie las contraseñas iniciales desde Usuarios (obligatorio al entrar).');
  if (usingAppData || isProtectedInstall()) {
    console.log('');
    console.log('  Datos (BD):  ' + DATA_DIR);
    console.log('  Respaldos:   ' + BACKUP_DIR);
    console.log('  (En Archivos de programa Windows no deja escribir ahi.');
    console.log('   Por eso los datos van a AppData. Mejor instalar en C:\\JR-Sistema)');
  }
  console.log('');
});
