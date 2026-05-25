import type { CookieOptions, Request } from "express";

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "httpOnly" | "path" | "sameSite" | "secure"> {
  // Same-origin app: `lax` blocks CSRF on top-level cross-site requests while
  // keeping normal navigation working. `secure` is set automatically over HTTPS.
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(req),
  };
}
