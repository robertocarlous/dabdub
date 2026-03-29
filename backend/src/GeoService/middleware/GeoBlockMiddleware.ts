import { Request, Response, NextFunction } from "express";
import { GeoService } from "../services/GeoService";
import { AppConfig } from "../config/appConfig";
import { WaitlistFraudLog } from "../entities/WaitlistFraudLog";
import { SecurityAlert } from "../entities/SecurityAlert";
import { getRepository } from "typeorm";

export async function GeoBlockMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.connection.remoteAddress || "";
  const country = GeoService.getCountry(ip);

  // Admin override
  if (AppConfig.get("geo_blocking_enabled") === false) {
    return next();
  }

  // Exempt routes
  if (req.path === "/health" || req.path.startsWith("/api/v1/waitlist/join")) {
    if (country !== "NG") {
      // Soft-block: log fraud attempt
      await getRepository(WaitlistFraudLog).save({
        ipAddress: ip,
        country,
        createdAt: new Date(),
      });
    }
    return next();
  }

  // VPN detection logging
  const ctx = GeoService.getLocationContext(ip);
  if (ctx.isVpn || ctx.isDatacenter) {
    if (req.user) {
      await getRepository(SecurityAlert).save({
        userId: req.user.id,
        type: "suspicious_ip",
        ipAddress: ip,
        country,
        createdAt: new Date(),
      });
    }
  }

  // Hard block
  if (!GeoService.isAllowed(ip)) {
    return res.status(451).json({
      code: "GEO_BLOCKED",
      message: "Cheese Pay is currently only available in Nigeria.",
    });
  }

  next();
}
