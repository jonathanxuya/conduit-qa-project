// @vitest-environment node
/**
 * Pruebas unitarias de backend/middleware/authentication.js (verifyToken).
 *
 * Dobles de prueba:
 *  - helper/jwt (jwtVerify): stub. Permite simular token válido/inválido sin
 *    firmar tokens reales ni depender de la variable de entorno JWT_KEY.
 *  - models (User.findOne): stub. Aísla el middleware de la base de datos.
 *
 * Técnica: transición de estados de la petición
 *  (sin header -> anónimo | header malformado -> error | token válido -> autenticado
 *   | token válido de usuario borrado -> NotFound).
 */
const { stubModule, loadFresh } = require("../test-utils/doubles");
const { NotFoundError } = require("../helper/customErrors");

const User = { findOne: vi.fn() };
const jwt = { jwtVerify: vi.fn() };
let verifyToken;

beforeEach(() => {
  vi.clearAllMocks();
  stubModule("models/index.js", { User });
  stubModule("helper/jwt.js", jwt);
  verifyToken = loadFresh("middleware/authentication.js");
});

test("sin header Authorization continúa como usuario anónimo", async () => {
  const req = { headers: {} };
  const next = vi.fn();

  await verifyToken(req, {}, next);

  expect(next).toHaveBeenCalledWith();
  expect(req.loggedUser).toBeUndefined();
  expect(jwt.jwtVerify).not.toHaveBeenCalled();
});

test("header sin token ('Token') produce SyntaxError", async () => {
  const next = vi.fn();

  await verifyToken({ headers: { authorization: "Token" } }, {}, next);

  expect(next.mock.calls[0][0]).toBeInstanceOf(SyntaxError);
});

test("token inválido propaga el error de jwtVerify", async () => {
  jwt.jwtVerify.mockRejectedValue(new Error("invalid signature"));
  const next = vi.fn();

  await verifyToken({ headers: { authorization: "Token abc" } }, {}, next);

  expect(next.mock.calls[0][0].message).toBe("invalid signature");
});

test("token válido adjunta loggedUser con su token y el email en headers", async () => {
  jwt.jwtVerify.mockResolvedValue({ email: "a@a.com" });
  const user = { id: 7, dataValues: {} };
  User.findOne.mockResolvedValue(user);
  const req = { headers: { authorization: "Token abc" } };
  const next = vi.fn();

  await verifyToken(req, {}, next);

  expect(User.findOne).toHaveBeenCalledWith(
    expect.objectContaining({ where: { email: "a@a.com" } }),
  );
  expect(req.loggedUser).toBe(user);
  expect(user.dataValues.token).toBe("abc");
  expect(req.headers.email).toBe("a@a.com");
  expect(next).toHaveBeenCalledTimes(1);
  expect(next).toHaveBeenCalledWith();
});

test("token válido de un usuario que ya no existe -> NotFoundError una sola vez", async () => {
  // Defecto detectado: antes del fix, el middleware llamaba next(NotFoundError)
  // y seguía ejecutando, fallando con TypeError y llamando next() dos veces.
  jwt.jwtVerify.mockResolvedValue({ email: "borrado@a.com" });
  User.findOne.mockResolvedValue(null);
  const next = vi.fn();

  await verifyToken({ headers: { authorization: "Token abc" } }, {}, next);

  expect(next).toHaveBeenCalledTimes(1);
  expect(next.mock.calls[0][0]).toBeInstanceOf(NotFoundError);
});
