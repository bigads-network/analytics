import winston from 'winston';

// Custom formatter that avoids deep object serialization
const lightweightFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    // Keep metadata minimal - max 200 chars per field
    const metaStr = Object.keys(meta).length > 0 
      ? ` ${JSON.stringify(meta).slice(0, 200)}`
      : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    // Console - lightweight format
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        lightweightFormat
      ),
    }),
    // File - structured but limited
    new winston.transports.File({
      filename: 'app.log',
      format: lightweightFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

export default logger;
