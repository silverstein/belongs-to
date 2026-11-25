import { httpBasic, localDev, placeholderAuth } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

const password = process.env.BELONGS_TO_PASSWORD;

export default eveChannel({
  auth: [...(password ? [httpBasic({ username: "family", password })] : [placeholderAuth()]), localDev()],
  uploadPolicy: { maxBytes: 256 * 1024, allowedMediaTypes: ["text/markdown", "text/plain"] },
});
