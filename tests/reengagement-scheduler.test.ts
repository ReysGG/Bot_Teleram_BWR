import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("re-engagement scheduler wiring", () => {
  it("runs the authenticated cron every 30 minutes in local and production Compose", () => {
    for (const file of ["docker-compose.yml", "deploy/docker-compose.production.yml"]) {
      const compose = readFileSync(file, "utf8");
      const routeIndex = compose.indexOf("http://app:3000/api/cron/reengagement");
      expect(routeIndex).toBeGreaterThan(-1);
      expect(compose.slice(routeIndex, routeIndex + 160)).toContain("sleep 1800");
      expect(compose.slice(Math.max(0, routeIndex - 180), routeIndex)).toContain(
        "Authorization: Bearer $${APP_CRON_SECRET}",
      );
    }
  });

  it("keeps Vercel scheduler parity", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    expect(config.crons).toContainEqual({
      path: "/api/cron/reengagement",
      schedule: "*/30 * * * *",
    });
  });
});

describe("Shopee Partner scheduler wiring", () => {
  it("runs authenticated 15-second polling and 5-second matching loops", () => {
    for (const file of ["docker-compose.yml", "deploy/docker-compose.production.yml"]) {
      const compose = readFileSync(file, "utf8");
      for (const [route, interval] of [
        ["/api/cron/payments/shopee", "sleep 15"],
        ["/api/cron/payments/shopee/match", "sleep 5"],
      ] as const) {
        const routeIndex = compose.indexOf(`http://app:3000${route}`);
        expect(routeIndex).toBeGreaterThan(-1);
        expect(compose.slice(routeIndex, routeIndex + 160)).toContain(interval);
        expect(compose.slice(Math.max(0, routeIndex - 180), routeIndex)).toContain(
          "Authorization: Bearer $${APP_CRON_SECRET}",
        );
      }
    }
  });
});
