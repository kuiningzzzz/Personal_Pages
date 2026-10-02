import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve from this file so `npm start` works from either the repo root or server/.
// dotenv leaves variables already provided by the shell or Docker Compose intact.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
