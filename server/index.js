import path from 'node:path';
import express from 'express';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/accounts.js';
import videoRoutes from './routes/videos.js';
import insightRoutes from './routes/insights.js';
import assistantRoutes from './routes/assistant.js';
import billingRoutes from './routes/billing.js';
import { initDb } from './db.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "connect-src 'self'",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
    ].join('; '),
  );
  next();
});

app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true, limit: '3mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'influencer', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api', accountRoutes);
app.use('/api', videoRoutes);
app.use('/api', insightRoutes);
app.use('/api', assistantRoutes);
app.use('/api', billingRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));

const clientDist = path.join(process.cwd(), 'client', 'dist');
app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next(err);
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'That video is larger than 250 MB. Compress it or upload a shorter clip.' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'That request was too large. Try a smaller file or shorter text.' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed request body.' });
  }
  const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error('[server] unhandled error:', err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side. Please try again.' : err.message });
});

const port = Number(process.env.PORT) || 80;

initDb()
  .then(() => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`INFLUENCER listening on 0.0.0.0:${port}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start INFLUENCER:', err);
    process.exit(1);
  });
