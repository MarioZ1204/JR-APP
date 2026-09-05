const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const { Server } = require('socket.io');
const { lanUrls } = require('./lan');

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
const { syncLicenseFromDisk } = require('./license');
syncLicenseFromDisk();
autoBackup();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000
});

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
  const urls = lanUrls(PORT);
  console.log('');
  console.log('  JR Burger — sistema local');
  console.log('  --------------------------------');
  console.log(`  En este PC:     http://localhost:${PORT}`);
  if (urls.length) {
    for (const url of urls) console.log(`  En el celular:  ${url}`);
    console.log('  Escriba la dirección completa, con :' + PORT + ' al final.');
    console.log('  El celular debe estar en la misma red (no datos móviles).');
  } else {
    console.log('  (No hay IP de red usable. Conecte el PC por cable o WiFi del local.)');
  }
  console.log('');
  console.log('  Usuarios iniciales: admin / mesero / cocina / cajero');
  console.log('  Contraseña inicial: el mismo nombre + 123  (ej. admin123)');
  console.log('  Cambie las claves desde Usuarios.');
  console.log('');
});
