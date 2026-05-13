import { NextResponse } from "next/server";
import { ApiAuthError } from "@/lib/api-request-auth";
import { toFriendlyErrorMessage } from "@/lib/user-error";

/** JSON error for routes that use `{ success: false, error, userMessage? }`. */
export function nextJsonFriendlyApiError(
  error: unknown,
  opts: { logLabel: string; fallbackDetail: string }
): NextResponse {
  if (error instanceof ApiAuthError) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        userMessage: toFriendlyErrorMessage(error.message),
      },
      { status: error.status }
    );
  }
  const err = error as { message?: string; stack?: string };
  console.error(opts.logLabel, error);
  const details = err.message || opts.fallbackDetail;
  return NextResponse.json(
    {
      success: false,
      error: details,
      userMessage: toFriendlyErrorMessage(details),
      ...(process.env.NODE_ENV === "development" ? { stack: err.stack } : {}),
    },
    { status: 500 }
  );
}

/** Chat route: auth failures (no `success` field). */
export function nextJsonChatAuthError(error: ApiAuthError): NextResponse {
  return NextResponse.json(
    { error: error.message, userMessage: toFriendlyErrorMessage(error.message) },
    { status: error.status }
  );
}

/** Chat route: non-streaming 500 body. */
export function chatServerErrorResponse(
  details: string,
  stack?: string
): Response {
  return new Response(
    JSON.stringify({
      error: "Server Error",
      details,
      userMessage: toFriendlyErrorMessage(details),
      stack: process.env.NODE_ENV === "development" ? stack : undefined,
    }),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );
}
