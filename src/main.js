import { createWeb } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
// Acceptance runs pass the api platform's address as HARNESS_TARGET_API_URL.
const apiUrl = process.env.HARNESS_TARGET_API_URL ?? process.env.API_URL ?? "http://localhost:3001";
createWeb({ apiUrl }).listen(port, () => console.log(`web listening on ${port}, api ${apiUrl}`));
