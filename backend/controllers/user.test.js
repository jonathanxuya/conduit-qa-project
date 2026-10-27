// @vitest-environment node
/**
 * Pruebas unitarias de backend/controllers/user.js (usuario actual y actualización de perfil).
 *
 * Doble de prueba: helper/bcrypt (stub) para verificar si el controlador
 * re-hashea o no la contraseña, sin ejecutar bcrypt real.
 * El "loggedUser" es un objeto falso con save() espía (mock) en lugar de una
 * instancia Sequelize, para no depender de la base de datos.
 */
const { stubModule, loadFresh, mockResponse } = require("../test-utils/doubles");
const { UnauthorizedError } = require("../helper/customErrors");

const bcrypt = { bcryptHash: vi.fn(), bcryptCompare: vi.fn() };
let currentUser;
let updateUser;

function fakeLoggedUser() {
  return { username: "ana", bio: "", password: "HASH_ORIGINAL", dataValues: {}, save: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  stubModule("helper/bcrypt.js", bcrypt);
  ({ currentUser, updateUser } = loadFresh("controllers/user.js"));
});

describe("currentUser", () => {
  test("sin sesión -> UnauthorizedError", async () => {
    const next = vi.fn();
    await currentUser({ headers: {} }, mockResponse(), next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  test("con sesión devuelve el usuario con su email y limpia el header", async () => {
    const loggedUser = fakeLoggedUser();
    const req = { loggedUser, headers: { email: "a@a.com" } };
    const res = mockResponse();

    await currentUser(req, res, vi.fn());

    expect(loggedUser.dataValues.email).toBe("a@a.com");
    expect(req.headers.email).toBeUndefined();
    expect(res.json).toHaveBeenCalledWith({ user: loggedUser });
  });
});

describe("updateUser - partición de equivalencia sobre el campo password", () => {
  test("sin sesión -> UnauthorizedError", async () => {
    const next = vi.fn();
    await updateUser({ body: { user: {} } }, mockResponse(), next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  test("con password nueva la hashea y guarda", async () => {
    bcrypt.bcryptHash.mockResolvedValue("HASH_NUEVO");
    const loggedUser = fakeLoggedUser();

    await updateUser(
      { loggedUser, body: { user: { bio: "hola", password: "nueva123" } } },
      mockResponse(),
      vi.fn(),
    );

    expect(bcrypt.bcryptHash).toHaveBeenCalledWith("nueva123");
    expect(loggedUser.password).toBe("HASH_NUEVO");
    expect(loggedUser.bio).toBe("hola");
    expect(loggedUser.save).toHaveBeenCalled();
  });

  test.each([
    ["omitida (undefined)", undefined],
    ["vacía ('')", ""],
  ])("con password %s NO cambia la contraseña", async (_label, password) => {
    // Defecto detectado: la condición original `password !== undefined || password !== ""`
    // siempre era verdadera, así que al editar solo la bio se intentaba hashear
    // undefined/"" (error 500 o contraseña vacía).
    const loggedUser = fakeLoggedUser();

    await updateUser(
      { loggedUser, body: { user: { bio: "solo bio", password } } },
      mockResponse(),
      vi.fn(),
    );

    expect(bcrypt.bcryptHash).not.toHaveBeenCalled();
    expect(loggedUser.password).toBe("HASH_ORIGINAL");
    expect(loggedUser.save).toHaveBeenCalled();
  });
});
