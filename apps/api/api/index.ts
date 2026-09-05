// Vercel serverless function entry point.
// Vercel requires handler files to live inside an `api/` directory at the
// project root. This file re-exports the handler built in src/app.ts so the
// application code stays in its reviewed location.
export { default } from "../src/app.js";
