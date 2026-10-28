/**
 * Utilidad de dobles de prueba para módulos CommonJS del backend.
 *
 * vi.mock() de Vitest solo intercepta módulos cargados con `import`; el backend
 * usa `require()`, así que reemplazamos la entrada en require.cache con un stub
 * antes de cargar el módulo bajo prueba. Así el controlador recibe el doble
 * (p. ej. un modelo Sequelize falso) en lugar de la dependencia real.
 */
const path = require("path");

const BACKEND_ROOT = path.resolve(__dirname, "..");

function resolveFromBackend(relativePath) {
  return require.resolve(path.join(BACKEND_ROOT, relativePath));
}

/** Registra `fakeExports` como si fuera el módulo real ubicado en `relativePath`. */
function stubModule(relativePath, fakeExports) {
  const filename = resolveFromBackend(relativePath);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports: fakeExports,
  };
}

/** Carga un módulo del backend desde cero (sin caché) para que use los stubs vigentes. */
function loadFresh(relativePath) {
  const filename = resolveFromBackend(relativePath);
  delete require.cache[filename];
  return require(filename);
}

/** Objeto `res` de Express falso con status/json encadenables. */
function mockResponse() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

module.exports = { stubModule, loadFresh, mockResponse };
