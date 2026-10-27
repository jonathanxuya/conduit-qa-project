/**
 * Pruebas unitarias de los servicios HTTP del frontend.
 *
 * Doble de prueba: axios se reemplaza con vi.mock (mock). Justificación: los
 * servicios son la frontera con la API; en una prueba unitaria no queremos red
 * ni un backend levantado, solo verificar QUÉ petición construye cada servicio
 * (método, URL, cuerpo, headers) y cómo transforma la respuesta.
 */
import axios from "axios";
import getArticles from "./getArticles";
import setArticle from "./setArticle";
import toggleFav from "./toggleFav";
import toggleFollow from "./toggleFollow";
import userLogin from "./userLogin";
import userSignUp from "./userSignUp";

vi.mock("axios");

const headers = { Authorization: "Token abc" };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("getArticles - partición de equivalencia por ubicación (location)", () => {
  test.each([
    ["global", {}, "api/articles?limit=3&&offset=0"],
    ["feed", {}, "api/articles/feed?limit=3&&offset=0"],
    ["tag", { tagName: "qa" }, "api/articles?tag=qa&&limit=3&&offset=0"],
    ["profile", { username: "ana" }, "api/articles?author=ana&&limit=3&&offset=0"],
    ["favorites", { username: "ana" }, "api/articles?favorited=ana&&limit=3&&offset=0"],
  ])("location=%s construye la URL correcta", async (location, extra, url) => {
    axios.mockResolvedValue({ data: { articles: [], articlesCount: 0 } });

    const data = await getArticles({ headers, location, ...extra });

    expect(axios).toHaveBeenCalledWith({ url, headers });
    expect(data).toEqual({ articles: [], articlesCount: 0 });
  });

  test("la página se envía como offset", async () => {
    axios.mockResolvedValue({ data: {} });
    await getArticles({ location: "global", page: 4 });
    expect(axios.mock.calls[0][0].url).toBe("api/articles?limit=3&&offset=4");
  });
});

describe("userLogin", () => {
  test("guarda la sesión en localStorage con header Token", async () => {
    axios.mockResolvedValue({ data: { user: { username: "ana", token: "XYZ" } } });

    const result = await userLogin({ email: "a@a.com", password: "123" });

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST", url: "api/users/login", data: { user: { email: "a@a.com", password: "123" } } }),
    );
    expect(result.headers).toEqual({ Authorization: "Token XYZ" });
    expect(result.isAuth).toBe(true);
    expect(JSON.parse(localStorage.getItem("loggedUser")).loggedUser.username).toBe("ana");
  });

  test("credenciales inválidas (422) lanza el mensaje del backend y no guarda sesión", async () => {
    axios.mockRejectedValue({
      response: { status: 422, data: { errors: { body: ["Wrong email/password combination"] } } },
    });
    vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(userLogin({ email: "a@a.com", password: "mal" })).rejects.toBe(
      "Wrong email/password combination",
    );
    expect(localStorage.getItem("loggedUser")).toBeNull();
  });
});

describe("userSignUp", () => {
  test("envía el usuario y guarda la sesión", async () => {
    axios.mockResolvedValue({ data: { user: { username: "ana", token: "T" } } });

    const result = await userSignUp({ username: "ana", email: "a@a.com", password: "123" });

    expect(axios.mock.calls[0][0]).toMatchObject({ method: "POST", url: "api/users" });
    expect(result.isAuth).toBe(true);
  });
});

describe("setArticle - decide entre crear y editar", () => {
  test("sin slug hace POST a api/articles", async () => {
    axios.mockResolvedValue({ data: { article: { slug: "nuevo" } } });
    const slug = await setArticle({ title: "Nuevo", description: "d", body: "b", tagList: [], headers });
    expect(axios.mock.calls[0][0]).toMatchObject({ method: "POST", url: "api/articles" });
    expect(slug).toBe("nuevo");
  });

  test("con slug hace PUT a api/articles/:slug", async () => {
    axios.mockResolvedValue({ data: { article: { slug: "editado" } } });
    await setArticle({ slug: "viejo", title: "Editado", headers });
    expect(axios.mock.calls[0][0]).toMatchObject({ method: "PUT", url: "api/articles/viejo" });
  });
});

describe("toggleFav / toggleFollow - transición de estados", () => {
  test.each([
    [false, "POST"],
    [true, "DELETE"],
  ])("toggleFav con favorited=%s usa %s", async (favorited, method) => {
    axios.mockResolvedValue({ data: { article: { favorited: !favorited } } });
    const article = await toggleFav({ slug: "a", favorited, headers });
    expect(axios.mock.calls[0][0]).toMatchObject({ method, url: "api/articles/a/favorite" });
    expect(article.favorited).toBe(!favorited);
  });

  test.each([
    [false, "POST"],
    [true, "DELETE"],
  ])("toggleFollow con following=%s usa %s", async (following, method) => {
    axios.mockResolvedValue({ data: { profile: { following: !following } } });
    await toggleFollow({ username: "ana", following, headers });
    expect(axios.mock.calls[0][0]).toMatchObject({ method, url: "api/profiles/ana/follow" });
  });
});
