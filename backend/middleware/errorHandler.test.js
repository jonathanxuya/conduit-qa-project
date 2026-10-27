// @vitest-environment node
/**
 * Pruebas unitarias de módulos de soporte del backend:
 * middleware/errorHandler.js, helper/helpers.js (append*), helper/jwt.js.
 * Son unidades puras o con dependencias simples, por lo que no requieren stubs
 * salvo objetos falsos de Sequelize para los helpers append*.
 */
const errorHandler = require("./errorHandler");
const { appendTagList, appendFavorites, appendFollowers } = require("../helper/helpers");
const {
  AlreadyTakenError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} = require("../helper/customErrors");
const { mockResponse } = require("../test-utils/doubles");

describe("errorHandler - partición de equivalencia por tipo de error", () => {
  beforeEach(() => vi.spyOn(console, "log").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  test.each([
    [new UnauthorizedError(), 401],
    [new ForbiddenError("article"), 403],
    [new NotFoundError("Article"), 404],
    [new AlreadyTakenError("Email"), 422],
    [new Error("boom"), 500],
  ])("%s -> HTTP %i con formato RealWorld", (error, status) => {
    const res = mockResponse();
    errorHandler(error, {}, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ errors: { body: [error.message] } });
  });
});

describe("helpers append*", () => {
  test("appendTagList sin artículo devuelve solo los nombres", () => {
    expect(appendTagList([{ name: "a" }, { name: "b" }])).toEqual(["a", "b"]);
  });

  test("appendFavorites con usuario anónimo marca favorited=false", async () => {
    const article = { dataValues: {}, hasUser: vi.fn().mockResolvedValue(true), countUsers: vi.fn().mockResolvedValue(4) };
    await appendFavorites(undefined, article);
    expect(article.dataValues).toEqual({ favorited: false, favoritesCount: 4 });
  });

  test("appendFavorites con usuario logueado refleja hasUser", async () => {
    const article = { dataValues: {}, hasUser: vi.fn().mockResolvedValue(true), countUsers: vi.fn().mockResolvedValue(1) };
    await appendFavorites({ id: 1 }, article);
    expect(article.dataValues.favorited).toBe(true);
  });

  test("appendFollowers sobre un perfil (sin author) llena following y followersCount", async () => {
    const profile = { dataValues: {}, hasFollower: vi.fn().mockResolvedValue(true), countFollowers: vi.fn().mockResolvedValue(2) };
    await appendFollowers({ id: 1 }, profile);
    expect(profile.dataValues).toEqual({ following: true, followersCount: 2 });
  });

  test("appendFollowers sobre un artículo usa a su autor", async () => {
    const authorModel = { hasFollower: vi.fn().mockResolvedValue(true), countFollowers: vi.fn().mockResolvedValue(3) };
    const article = { author: { dataValues: {} }, getAuthor: vi.fn().mockResolvedValue(authorModel) };
    await appendFollowers(undefined, article);
    expect(article.author.dataValues).toEqual({ following: false, followersCount: 3 });
  });
});

describe("jwt", () => {
  test("jwtSign/jwtVerify: firma solo username y email y se puede verificar", async () => {
    process.env.JWT_KEY = "clave-de-prueba";
    const { loadFresh } = require("../test-utils/doubles");
    const { jwtSign, jwtVerify } = loadFresh("helper/jwt.js");

    const token = await jwtSign({ username: "ana", email: "a@a.com", password: "no-debe-ir" });
    const payload = await jwtVerify(token);

    expect(payload.username).toBe("ana");
    expect(payload.email).toBe("a@a.com");
    expect(payload.password).toBeUndefined();
  });
});
