import { localDev, placeholderAuth, verifyHttpBasic, type AuthFn } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

const password = process.env.BELONGS_TO_PASSWORD;
const familyPassword: AuthFn<Request> = (request) => {
  if (!password) return null;
  const result = verifyHttpBasic(request.headers.get("Authorization"), { username: "family", password });
  return result.ok ? result.sessionAuth : null;
};

export default eveChannel({
  // A custom verifier avoids a browser Basic authentication prompt after a 401.
  auth: [password ? familyPassword : placeholderAuth(), localDev()],
  uploadPolicy: { maxBytes: 256 * 1024, allowedMediaTypes: ["text/markdown", "text/plain"] },
});
