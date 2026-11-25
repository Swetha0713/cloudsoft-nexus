import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { connectDB } from './config/db.js';
import { errorHandler } from './middleware/errorhandler.js';
import authRoutes from './routes/authRoutes.js';
import deploymentRoutes from './routes/deploymentRoutes.js';
import ticketRoutes from './routes/ticketRoutes.js';
import opsRoutes from './routes/opsRoutes.js';
import { startSlaWorker } from './workers/slaWorker.js';

dotenv.config();

const app = express();

// 1. Security & CORS
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);

// 2. Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api', apiLimiter);

// 3. Body Parser
app.use(express.json({ limit: '10kb' }));

// 4. API Routes
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    service: 'CloudSoft Nexus API',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/deployments', deploymentRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/ops', opsRoutes);

// 5. Centralized Error Handler (Always LAST)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  startSlaWorker(); // Starts AFTER database connects
  app.listen(PORT, () => {
    console.log(`[SERVER] CloudSoft Nexus running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  });
};

startServer();