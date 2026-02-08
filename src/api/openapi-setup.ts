import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Sets up OpenAPI documentation with Swagger UI
 * Exposes three routes:
 * - GET /api-docs - Interactive Swagger UI
 * - GET /api-docs/openapi.json - Spec as JSON
 * - GET /api-docs/openapi.yaml - Spec as YAML
 */
export function setupOpenAPI(app: Express): void {
  try {
    // Load OpenAPI spec from YAML file
    const openapiPath = path.join(__dirname, 'openapi.yaml');
    const openapiYaml = fs.readFileSync(openapiPath, 'utf8');
    const openapiSpec = YAML.parse(openapiYaml);

    // Configure Swagger UI options
    const swaggerUiOptions = {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Stock Scanner API Documentation',
      customfavIcon: '/favicon.ico',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        syntaxHighlight: {
          activate: true,
          theme: 'monokai'
        }
      }
    };

    // Serve Swagger UI at /api-docs
    app.use(
      '/api-docs',
      swaggerUi.serve,
      swaggerUi.setup(openapiSpec, swaggerUiOptions)
    );

    // Serve OpenAPI spec as JSON
    app.get('/api-docs/openapi.json', (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(openapiSpec, null, 2));
    });

    // Serve OpenAPI spec as YAML
    app.get('/api-docs/openapi.yaml', (_req, res) => {
      res.setHeader('Content-Type', 'text/yaml');
      res.send(openapiYaml);
    });

    console.log('[OpenAPI] Documentation available at /api-docs');
    console.log('[OpenAPI] JSON spec available at /api-docs/openapi.json');
    console.log('[OpenAPI] YAML spec available at /api-docs/openapi.yaml');
  } catch (error) {
    console.error('[OpenAPI] Failed to load OpenAPI specification:', error);
    console.error('[OpenAPI] Swagger UI will not be available');
  }
}
