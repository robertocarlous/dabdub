import geoip from "geoip-lite";
import { AppConfig } from "../config/appConfig";

export interface LocationContext {
  country: string;
  city?: string;
  region?: string;
  isVpn: boolean;
  isDatacenter: boolean;
}

export class GeoService {
  static getCountry(ip: string): string {
    // Dev bypass: private/local IPs → NG
    if (ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168")) {
      return "NG";
    }
    const lookup = geoip.lookup(ip);
    return lookup?.country || "NG";
  }

  static isAllowed(ip: string): boolean {
    const country = this.getCountry(ip);
    const allowed = AppConfig.get("allowed_countries") || ["NG"];
    return allowed.includes(country);
  }

  static getLocationContext(ip: string): LocationContext {
    const lookup = geoip.lookup(ip);
    return {
      country: lookup?.country || "NG",
      city: lookup?.city,
      region: lookup?.region,
      isVpn: this.isVpn(ip),
      isDatacenter: this.isDatacenter(ip),
    };
  }

  private static isVpn(ip: string): boolean {
    // Implement VPN detection logic (external dataset or API)
    return false;
  }

  private static isDatacenter(ip: string): boolean {
    // Implement datacenter IP detection
    return false;
  }
}
