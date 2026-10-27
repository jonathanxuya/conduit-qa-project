// @vitest-environment node
/**
 * Pruebas unitarias de backend/controllers/comments.js y favorites.js.
 *
 * Doble de prueba: models (Article, Comment, Tag, User) como stubs y
 * helpers.appendFollowers/appendFavorites como mocks, para aislar la lógica de
 * autorización y de alternar favorito de la base de datos.
 */
const { stubModule, loadFresh, mockResponse } = require("../test-utils/doubles");
const realHelpers = require("../helper/helpers");
const {
  FieldRequiredError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} = require("../helper/customErrors");

const Article = { findOne: vi.fn() };
const Comment = { create: vi.fn(), findByPk: vi.fn() };
const Tag = {};
const User = {};
const helpers = { ...realHelpers, appendFollowers: vi.fn(), appendFavorites: vi.fn() };

let comments;
let favorites;

beforeEach(() => {
  vi.clearAllMocks();
  stubModule("models/index.js", { Article, Comment, Tag, User });
  stubModule("helper/helpers.js", helpers);
  comments = loadFresh("controllers/comments.js");
  favorites = loadFresh("controllers/favorites.js");
});

describe("comments", () => {
  test("createComment con body vacío -> FieldRequiredError", async () => {
    const next = vi.fn();
    await comments.createComment(
      { loggedUser: { id: 1 }, params: { slug: "a" }, body: { comment: { body: "" } } },
      mockResponse(),
      next,
    );
    expect(next.mock.calls[0][0]).toBeInstanceOf(FieldRequiredError);
  });

  test("createComment en artículo inexistente -> NotFoundError", async () => {
    Article.findOne.mockResolvedValue(null);
    const next = vi.fn();
    await comments.createComment(
      { loggedUser: { id: 1 }, params: { slug: "a" }, body: { comment: { body: "hola" } } },
      mockResponse(),
      next,
    );
    expect(next.mock.calls[0][0]).toBeInstanceOf(NotFoundError);
  });

  test("createComment válido crea el comentario ligado al artículo y al autor", async () => {
    Article.findOne.mockResolvedValue({ id: 5 });
    Comment.create.mockResolvedValue({ dataValues: {} });
    const res = mockResponse();

    await comments.createComment(
      { loggedUser: { id: 1, dataValues: {} }, params: { slug: "a" }, body: { comment: { body: "hola" } } },
      res,
      vi.fn(),
    );

    expect(Comment.create).toHaveBeenCalledWith({ body: "hola", articleId: 5, userId: 1 });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("deleteComment de otro usuario -> ForbiddenError y no borra", async () => {
    const comment = { userId: 99, destroy: vi.fn() };
    Comment.findByPk.mockResolvedValue(comment);
    const next = vi.fn();

    await comments.deleteComment(
      { loggedUser: { id: 1 }, params: { slug: "a", commentId: "3" } },
      mockResponse(),
      next,
    );

    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
    expect(comment.destroy).not.toHaveBeenCalled();
  });

  test("deleteComment sin sesión -> UnauthorizedError", async () => {
    const next = vi.fn();
    await comments.deleteComment({ params: {} }, mockResponse(), next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  test("allComments de artículo inexistente -> NotFoundError", async () => {
    Article.findOne.mockResolvedValue(null);
    const next = vi.fn();
    await comments.allComments({ params: { slug: "x" } }, mockResponse(), next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(NotFoundError);
  });
});

describe("favoriteToggler - transición de estados (no favorito <-> favorito)", () => {
  function fakeArticle() {
    return { tagList: [], dataValues: {}, addUser: vi.fn(), removeUser: vi.fn() };
  }

  test("POST marca como favorito", async () => {
    const article = fakeArticle();
    Article.findOne.mockResolvedValue(article);
    const user = { id: 1 };

    await favorites.favoriteToggler({ method: "POST", loggedUser: user, params: { slug: "a" } }, mockResponse(), vi.fn());

    expect(article.addUser).toHaveBeenCalledWith(user);
    expect(article.removeUser).not.toHaveBeenCalled();
  });

  test("DELETE quita el favorito", async () => {
    const article = fakeArticle();
    Article.findOne.mockResolvedValue(article);
    const user = { id: 1 };

    await favorites.favoriteToggler({ method: "DELETE", loggedUser: user, params: { slug: "a" } }, mockResponse(), vi.fn());

    expect(article.removeUser).toHaveBeenCalledWith(user);
    expect(article.addUser).not.toHaveBeenCalled();
  });

  test("sin sesión -> UnauthorizedError", async () => {
    const next = vi.fn();
    await favorites.favoriteToggler({ method: "POST", params: { slug: "a" } }, mockResponse(), next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });
});
