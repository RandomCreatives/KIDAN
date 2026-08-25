import { buildRuntimeApp, loadLocalEnvironmentFile } from "./runtimeApp.js";

loadLocalEnvironmentFile();
const { app, environment } = await buildRuntimeApp();

try {
  await app.listen({ host: environment.API_HOST, port: environment.API_PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}