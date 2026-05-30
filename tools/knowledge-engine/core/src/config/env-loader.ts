import * as fs from 'fs';
import * as path from 'path';

/**
 * Robust environment variable loader designed to read a `.env` file
 * from the root of /tools/knowledge-engine/ without external dependencies.
 */
export function loadEnv(customPath?: string): Record<string, string> {
  const envVars: Record<string, string> = {};
  
  // Resolve path to .env
  // Default resolves to tools/knowledge-engine/.env
  const resolvedPath = customPath || path.resolve(__dirname, '../../../.env');

  if (fs.existsSync(resolvedPath)) {
    try {
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const lines = content.split(/\r?\n/);
      
      for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Find key/value
        const equalsIndex = trimmed.indexOf('=');
        if (equalsIndex === -1) continue;

        const key = trimmed.substring(0, equalsIndex).trim();
        let value = trimmed.substring(equalsIndex + 1).trim();

        // Strip surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.substring(1, value.length - 1);
        }

        if (key) {
          envVars[key] = value;
          process.env[key] = value; // Inject into system environment
        }
      }
    } catch (error: any) {
      console.error(`⚠️ Failed to parse environment file at ${resolvedPath}:`, error.message);
    }
  }

  return envVars;
}
