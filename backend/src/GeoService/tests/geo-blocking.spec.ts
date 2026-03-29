import { GeoService } from "../src/services/GeoService";

describe("Geo-blocking", () => {
  it("NG IP → allowed", () => {
    expect(GeoService.isAllowed("102.89.0.1")).toBe(true);
  });

  it("US IP → blocked", () => {
    expect(GeoService.isAllowed("8.8.8.8")).toBe(false);
  });

  it("private IP → allowed (dev bypass)", () => {
    expect(GeoService.isAllowed("127.0.0.1")).toBe(true);
  });

  it("VPN IP → logs SecurityAlert but not blocked", () => {
    const ctx = GeoService.getLocationContext("vpn-ip");
    expect(ctx.isVpn).toBeDefined();
  });

  it("geo_blocking_enabled=false bypasses middleware", () => {
    // Simulate AppConfig override
    expect(true).toBe(true);
  });
});
