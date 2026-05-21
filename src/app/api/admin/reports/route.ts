import { NextResponse } from "next/server";
import { requireContributorOrAdmin, requireUidFromRequest } from "@/lib/api-request-auth";
import { fetchAnalyticsReportsServer } from "@/lib/reports/fetch-analytics-reports-server";
import { nextJsonFriendlyApiError } from "@/lib/server-json-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const uid = await requireUidFromRequest(req);
    await requireContributorOrAdmin(uid);

    const data = await fetchAnalyticsReportsServer();
    return NextResponse.json({ success: true, ...data });
  } catch (error: unknown) {
    return nextJsonFriendlyApiError(error, {
      logLabel: "Analytics reports API error:",
      fallbackDetail: "Failed to load analytics reports",
    });
  }
}
