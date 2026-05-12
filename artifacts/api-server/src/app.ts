import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.set("trust proxy", 1);

const ALLOWED_ORIGINS = process.env.NODE_ENV === "production"
  ? (process.env.ALLOWED_ORIGINS ?? "https://putitupbusiness.it,https://www.putitupbusiness.it,https://tg.putitupbusiness.it")
      .split(",").filter(Boolean)
  : true;

const isProduction = process.env.NODE_ENV === "production";

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:"],
    },
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  permittedCrossDomainPolicies: { permittedPolicies: "none" },
}));

app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
  skip: (req) => req.method === "OPTIONS",
});

const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts." },
});

const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Write rate limit exceeded." },
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(globalLimiter);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.use("/api/auth", authLimiter);
app.use("/api/responses", writeLimiter);
app.use("/api/upload", writeLimiter);
app.use("/api/clients/:id/ads", writeLimiter);

app.use("/api", router);

export default app;
