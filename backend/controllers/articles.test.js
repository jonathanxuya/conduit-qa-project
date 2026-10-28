// @vitest-environment node
/**
 * Pruebas unitarias de backend/controllers/articles.js.
 *
 * Doble de prueba: models (Article, Tag, User) como stubs. El controlador hace
 * muchas consultas Sequelize; con stubs controlamos exactamente qué devuelve
 * cada una (artículo inexistente, autor distinto, slug duplicado...) sin
 * preparar datos en una base real. helper/helpers se deja REAL salvo
 * appendFollowers/appendFavorites, que también consultan la BD.
 */
const { stubModule, loadFresh, mockResponse } = require("../test-utils/doubles");
const realHelpers = require("../helper/helpers");
const {
  AlreadyTakenError,
  FieldRequiredError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} = require("../helper/customErrors");

const Article = { findOne: vi.fn(), create: vi.fn(), findAndCountAll: vi.fn() };
const Tag = { findByPk: vi.fn(), create: vi.fn() };
const User = { findOne: vi.fn() };
const helpers = {
  ...realHelpers,
  appendFollowers: vi.fn(),
  appendFavorites: vi.fn(),
};

let ctrl;

const author = { id: 1, dataValues: {} };
const intruder = { id: 2, dataValues: {} };

function fakeArticle(overrides = {}) {
  return {
    id: 10,
    slug: "mi-articulo",
    title: "Mi articulo",
    author,
    tagList: [{ name: "qa" }],
    dataValues: {},
    save: vi.fn(),
    destroy: vi.fn(),
    addTagList: vi.fn(),
    setAuthor: vi.fn(),
    getTagList: vi.fn().mockResolvedValue([{ name: "qa" }]),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  stubModule("models/index.js", { Article, Tag, User });
  stubModule("helper/helpers.js", helpers);
  ctrl = loadFresh("controllers/articles.js");
});

describe("createArticle", () => {
  const body = (article) => ({ body: { article } });

  test("sin sesión -> UnauthorizedError", async () => {
    const next = vi.fn();
    await ctrl.createArticle(body({}), mockResponse(), next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  test.each([
    [{ description: "d", body: "b" }, "A title is required"],
    [{ title: "t", body: "b" }, "A description is required"],
    [{ title: "t", description: "d" }, "An article body is required"],
  ])("campos obligatorios: %o -> %s", async (article, message) => {
    const next = vi.fn();
    await ctrl.createArticle({ loggedUser: author, ...body(article) }, mockResponse(), next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(FieldRequiredError);
    expect(next.mock.calls[0][0].message).toBe(message);
  });

  test("título cuyo slug ya existe -> AlreadyTakenError", async () => {
    Article.findOne.mockResolvedValue(fakeArticle());
    const next = vi.fn();

    await ctrl.createArticle(
      { loggedUser: author, ...body({ title: "Mi articulo", description: "d", body: "b", tagList: [] }) },
      mockResponse(),
      next,
    );

    expect(Article.findOne).toHaveBeenCalledWith({ where: { slug: "mi-articulo" } });
    expect(next.mock.calls[0][0]).toBeInstanceOf(AlreadyTakenError);
    expect(Article.create).not.toHaveBeenCalled();
  });

  test("valores límite de etiqueta nueva: 2 caracteres se ignora, 3 se crea", async () => {
    Article.findOne.mockResolvedValue(null);
    const created = fakeArticle();
    Article.create.mockResolvedValue(created);
    Tag.findByPk.mockResolvedValue(null);
    Tag.create.mockImplementation(async ({ name }) => ({ name }));
    const res = mockResponse();

    await ctrl.createArticle(
      {
        loggedUser: { ...author, dataValues: { token: "t" } },
        ...body({ title: "Nuevo", description: "d", body: "b", tagList: ["ab", "abc"] }),
      },
      res,
      vi.fn(),
    );

    expect(Tag.create).toHaveBeenCalledTimes(1);
    expect(Tag.create).toHaveBeenCalledWith({ name: "abc" });
    expect(created.addTagList).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("etiquetas repetidas (también con espacios) se crean una sola vez", async () => {
    Article.findOne.mockResolvedValue(null);
    const created = fakeArticle();
    Article.create.mockResolvedValue(created);
    Tag.findByPk.mockResolvedValue(null);
    Tag.create.mockImplementation(async ({ name }) => ({ name }));

    await ctrl.createArticle(
      {
        loggedUser: { ...author, dataValues: {} },
        ...body({ title: "Repetidas", description: "d", body: "b", tagList: ["testing", " testing ", "testing"] }),
      },
      mockResponse(),
      vi.fn(),
    );

    expect(Tag.create).toHaveBeenCalledTimes(1);
    expect(Tag.create).toHaveBeenCalledWith({ name: "testing" });
    expect(created.addTagList).toHaveBeenCalledTimes(1);
  });

  test("etiqueta existente se reutiliza sin crearla de nuevo", async () => {
    Article.findOne.mockResolvedValue(null);
    const created = fakeArticle();
    Article.create.mockResolvedValue(created);
    Tag.findByPk.mockResolvedValue({ name: "qa" });

    await ctrl.createArticle(
      {
        loggedUser: { ...author, dataValues: {} },
        ...body({ title: "Otro", description: "d", body: "b", tagList: ["qa"] }),
      },
      mockResponse(),
      vi.fn(),
    );

    expect(Tag.create).not.toHaveBeenCalled();
    expect(created.addTagList).toHaveBeenCalledWith({ name: "qa" });
  });
});

describe("singleArticle", () => {
  test("slug inexistente -> NotFoundError", async () => {
    Article.findOne.mockResolvedValue(null);
    const next = vi.fn();
    await ctrl.singleArticle({ params: { slug: "nada" } }, mockResponse(), next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(NotFoundError);
  });

  test("slug existente responde el artículo con su tagList", async () => {
    const article = fakeArticle();
    Article.findOne.mockResolvedValue(article);
    const res = mockResponse();

    await ctrl.singleArticle({ params: { slug: "mi-articulo" } }, res, vi.fn());

    expect(article.dataValues.tagList).toEqual(["qa"]);
    expect(res.json).toHaveBeenCalledWith({ article });
  });
});

describe("updateArticle / deleteArticle - tabla de decisión de autorización", () => {
  test.each(["updateArticle", "deleteArticle"])("%s sin sesión -> 401", async (fn) => {
    const next = vi.fn();
    await ctrl[fn]({ params: { slug: "x" }, body: { article: {} } }, mockResponse(), next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  test.each(["updateArticle", "deleteArticle"])("%s de artículo inexistente -> 404", async (fn) => {
    Article.findOne.mockResolvedValue(null);
    const next = vi.fn();
    await ctrl[fn]({ loggedUser: author, params: { slug: "x" }, body: { article: {} } }, mockResponse(), next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(NotFoundError);
  });

  test.each(["updateArticle", "deleteArticle"])("%s por usuario que no es el autor -> 403", async (fn) => {
    const article = fakeArticle();
    Article.findOne.mockResolvedValue(article);
    const next = vi.fn();

    await ctrl[fn]({ loggedUser: intruder, params: { slug: "mi-articulo" }, body: { article: { title: "hack" } } }, mockResponse(), next);

    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
    expect(article.save).not.toHaveBeenCalled();
    expect(article.destroy).not.toHaveBeenCalled();
  });

  test("updateArticle por el autor cambia título y regenera el slug", async () => {
    const article = fakeArticle();
    Article.findOne.mockResolvedValue(article);

    await ctrl.updateArticle(
      { loggedUser: author, params: { slug: "mi-articulo" }, body: { article: { title: "Titulo Nuevo", body: "nuevo" } } },
      mockResponse(),
      vi.fn(),
    );

    expect(article.title).toBe("Titulo Nuevo");
    expect(article.slug).toBe("titulo-nuevo");
    expect(article.body).toBe("nuevo");
    expect(article.save).toHaveBeenCalled();
  });

  test("deleteArticle por el autor elimina el artículo", async () => {
    const article = fakeArticle();
    Article.findOne.mockResolvedValue(article);
    const res = mockResponse();

    await ctrl.deleteArticle({ loggedUser: author, params: { slug: "mi-articulo" } }, res, vi.fn());

    expect(article.destroy).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: { body: ["Article deleted successfully"] } });
  });
});

describe("allArticles / articlesFeed - paginación", () => {
  test("allArticles usa limit=3 y offset=0 por defecto", async () => {
    Article.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const res = mockResponse();

    await ctrl.allArticles({ query: {} }, res, vi.fn());

    const options = Article.findAndCountAll.mock.calls[0][0];
    expect(options.limit).toBe(3);
    expect(options.offset).toBe(0);
    expect(res.json).toHaveBeenCalledWith({ articles: [], articlesCount: 0 });
  });

  test("allArticles calcula offset como página x límite (página 2, límite 5 -> 10)", async () => {
    Article.findAndCountAll.mockResolvedValue({ rows: [fakeArticle()], count: 1 });

    await ctrl.allArticles({ query: { limit: "5", offset: "2" } }, mockResponse(), vi.fn());

    const options = Article.findAndCountAll.mock.calls[0][0];
    expect(options.limit).toBe(5);
    expect(options.offset).toBe(10);
  });

  test("articlesFeed sin sesión -> UnauthorizedError", async () => {
    const next = vi.fn();
    await ctrl.articlesFeed({ query: {} }, mockResponse(), next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  test("articlesFeed filtra por los autores que sigue el usuario", async () => {
    Article.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const loggedUser = { getFollowing: vi.fn().mockResolvedValue([{ id: 4 }, { id: 9 }]) };

    await ctrl.articlesFeed({ loggedUser, query: {} }, mockResponse(), vi.fn());

    expect(Article.findAndCountAll.mock.calls[0][0].where).toEqual({ userId: [4, 9] });
  });

  test("articlesFeed agrega tagList, seguidores y favoritos a cada artículo", async () => {
    const a1 = fakeArticle({ slug: "uno" });
    const a2 = fakeArticle({ slug: "dos" });
    Article.findAndCountAll.mockResolvedValue({ rows: [a1, a2], count: 2 });
    const loggedUser = { getFollowing: vi.fn().mockResolvedValue([{ id: 1 }]) };
    const res = mockResponse();

    await ctrl.articlesFeed({ loggedUser, query: {} }, res, vi.fn());

    expect(a1.dataValues.tagList).toEqual(["qa"]);
    expect(a2.dataValues.tagList).toEqual(["qa"]);
    expect(helpers.appendFollowers).toHaveBeenCalledTimes(2);
    expect(helpers.appendFavorites).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith({ articles: [a1, a2], articlesCount: 2 });
  });
});
