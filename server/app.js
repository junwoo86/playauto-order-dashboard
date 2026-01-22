import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Routes
import shopsRouter from './routes/shops.js';
import ordersRouter from './routes/orders.js';
import syncRouter from './routes/sync.js';
import statsRouter from './routes/stats.js';
import reportsRouter from './routes/reports.js';
import mappingsRouter from './routes/mappings.js';
import campaignsRouter from './routes/campaigns.js';

// Services
import { initDatabase } from './services/database.js';
import { initScheduler } from './services/scheduler.js';

dotenv.config({ path: '../.env' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/shops', shopsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/sync', syncRouter);
app.use('/api/stats', statsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/mappings', mappingsRouter);
app.use('/api/campaigns', campaignsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

// Initialize database and start server
async function start() {
  try {
    // DB 초기화 (30초 타임아웃, 실패해도 서버 시작)
    const initTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DB init timeout')), 30000)
    );

    try {
      await Promise.race([initDatabase(), initTimeout]);
      console.log('Database initialized');
    } catch (initError) {
      console.warn('[Warning] DB initialization skipped:', initError.message);
      console.log('Continuing without full initialization (tables already exist)');
    }

    // 스케줄러 초기화
    initScheduler();

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
