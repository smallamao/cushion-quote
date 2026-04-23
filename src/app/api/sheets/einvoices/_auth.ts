import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import type { Session } from "@/lib/types";

export function getSession(request: Request): Session | null {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((item) => item.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
  return verifySession(token);
}
