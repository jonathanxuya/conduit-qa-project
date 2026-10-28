// @vitest-environment node
/**
 * Pruebas unitarias de backend/controllers/users.js (registro e inicio de sesión).
 *
 * Dobles de prueba usados y por qué:
 *  - models (User): stub. Aísla el controlador de MySQL/Sequelize; la prueba
 *    unitaria no debe depender de una base de datos levantada ni de su estado.
 *  - helper/bcrypt: stub. bcrypt real es lento (10 rondas) y no determinista;
 *    solo nos interesa verificar que el controlador lo invoca y reacciona al resultado.
 *  - helper/jwt: stub. Evita depender de JWT_KEY y permite verificar con qué
 *    payload se firma el token.
 */
const { stubModule, loadFresh, mockResponse } = require("../test-utils/doubles");
const {
  AlreadyTakenError,
  FieldRequiredError,
  NotFoundError,
  ValidationError,
} = require("../helper/customErrors");

const User = { findOne: vi.fn(), create: vi.fn() };
const bcrypt = { bcryptHash: vi.fn(), bcryptCompare: vi.fn() };
const jwt = { jwtSign: vi.fn() };

let signUp;
let signIn;

beforeEach(() => {
  vi.clearAllMocks();
  stubModule("models/index.js", { User });
  stubModule("helper/bcrypt.js", bcrypt);
  stubModule("helper/jwt.js", jwt);
  ({ signUp, signIn } = loadFresh("controllers/users.js"));
});

describe("signUp - partición de equivalencia sobre campos obligatorios", () => {
  test.each([
    [{ email: "a@a.com", password: "123456" }, "A username is required"],
    [{ username: "ana", password: "123456" }, "An email is required"],
    [{ username: "ana", email: "a@a.com" }, "A password is required"],
  ])("rechaza %o con FieldRequiredError", async (user, message) => {
    const next = vi.fn();
    await signUp({ body: { user } }, mockResponse(), next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(FieldRequiredError);
    expect(error.message).toBe(message);
    expect(User.create).not.toHaveBeenCalled();
  });

  test("rechaza un email ya registrado con AlreadyTakenError", async () => {
    User.findOne.mockResolvedValue({ id: 1 });
    const next = vi.fn();

    await signUp(
      { body: { user: { username: "ana", email: "a@a.com", password: "x" } } },
      mockResponse(),
      next,
    );

    expect(next.mock.calls[0][0]).toBeInstanceOf(AlreadyTakenError);
    expect(User.create).not.toHaveBeenCalled();
  });

  test("crea el usuario con la contraseña hasheada y responde 201 con token", async () => {
    User.findOne.mockResolvedValue(null);
    bcrypt.bcryptHash.mockResolvedValue("HASH");
    const created = { username: "ana", email: "a@a.com", dataValues: {} };
    User.create.mockResolvedValue(created);
    jwt.jwtSign.mockResolvedValue("TOKEN");
    const res = mockResponse();

    await signUp(
      { body: { user: { username: "ana", email: "a@a.com", password: "secreta" } } },
      res,
      vi.fn(),
    );

    expect(bcrypt.bcryptHash).toHaveBeenCalledWith("secreta");
    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({ password: "HASH", email: "a@a.com" }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ user: created });
    expect(created.dataValues.token).toBe("TOKEN");
  });
});

describe("signIn - tabla de decisión (¿existe email? x ¿contraseña correcta?)", () => {
  test("email inexistente -> NotFoundError", async () => {
    User.findOne.mockResolvedValue(null);
    const next = vi.fn();

    await signIn({ body: { user: { email: "x@x.com", password: "1" } } }, mockResponse(), next);

    expect(next.mock.calls[0][0]).toBeInstanceOf(NotFoundError);
    expect(bcrypt.bcryptCompare).not.toHaveBeenCalled();
  });

  test("email existe y contraseña incorrecta -> ValidationError", async () => {
    User.findOne.mockResolvedValue({ password: "HASH", dataValues: {} });
    bcrypt.bcryptCompare.mockResolvedValue(false);
    const next = vi.fn();

    await signIn({ body: { user: { email: "a@a.com", password: "mal" } } }, mockResponse(), next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.message).toBe("Wrong email/password combination");
  });

  test("email existe y contraseña correcta -> responde usuario con token", async () => {
    const existent = { username: "ana", password: "HASH", dataValues: {} };
    User.findOne.mockResolvedValue(existent);
    bcrypt.bcryptCompare.mockResolvedValue(true);
    jwt.jwtSign.mockResolvedValue("TOKEN");
    const res = mockResponse();
    const next = vi.fn();

    await signIn({ body: { user: { email: "a@a.com", password: "ok" } } }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(bcrypt.bcryptCompare).toHaveBeenCalledWith("ok", "HASH");
    expect(res.json).toHaveBeenCalledWith({ user: existent });
    expect(existent.dataValues.token).toBe("TOKEN");
  });
});
