// Imported first by scripts so .env / .env.local are loaded before any module
// reads process.env, the same way the Next server loads them.
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());
