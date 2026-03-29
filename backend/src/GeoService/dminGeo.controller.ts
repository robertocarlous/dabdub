import { Request, Response } from "express";
import { RedisClient } from "../utils/redis";

export async function getGeoStats(req: Request, res: Response) {
  // Admin-only route
  const stats = await RedisClient.hgetall("geo_blocked:24h");
  return res.json(stats);
}
