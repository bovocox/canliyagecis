import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import videoRoutes from './routes/videoRoutes';
import transcriptRoutes from './routes/transcriptRoutes';
import channelRoutes from './routes/channelRoutes';
import cronRoutes from './routes/cronRoutes';
import testRoutes from './routes/testRoutes';
import path from 'path';
import logger from './utils/logger';

const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // CSP kısıtlamalarını devre dışı bırak
}));
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(morgan('combined'));

// Static files - Bu kısmı rotaların ÖNÜNE alıyoruz
// ve absolute path ile tanımlıyoruz
const publicPath = path.join(__dirname, '../public');
console.log(`🌐 Serving static files from: ${publicPath}`);
app.use(express.static(publicPath));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Routes
app.use('/api/videos', videoRoutes);
app.use('/api/transcripts', transcriptRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/test', testRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app; 