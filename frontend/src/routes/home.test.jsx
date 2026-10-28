/**
 * Pruebas unitarias del listado de inicio (HomeArticles), de la barra de etiquetas
 * (PopularTags), de la configuración de axios y de reportWebVitals.
 *
 * Dobles de prueba:
 *  - hooks/useArticles y context/FeedContext: mocks. HomeArticles solo decide qué
 *    mostrar según el estado que le entrega el hook; se simulan los estados
 *    (cargando / con artículos / vacío) sin llamar a la API.
 *  - ArticlesPreview y ArticlesPagination: stubs de presentación, para aislar
 *    HomeArticles de sus hijos (que dependen de AuthContext y del router).
 *  - services/getTags: mock. PopularTags no debe hacer peticiones reales.
 *  - web-vitals: mock, para verificar que se registran las 5 métricas sin un navegador real.
 */
import { render, screen } from "@testing-library/react";
import HomeArticles from "./HomeArticles";
import PopularTags from "../components/PopularTags";
import useArticleList from "../hooks/useArticles";
import getTags from "../services/getTags";

vi.mock("../hooks/useArticles", () => ({ default: vi.fn() }));
vi.mock("../context/FeedContext", () => ({
  useFeedContext: () => ({ tabName: "global", tagName: "", changeTab: vi.fn() }),
}));
vi.mock("../components/ArticlesPreview", () => ({
  default: ({ articles }) => <ul data-testid="preview">{articles.map((a) => <li key={a.slug}>{a.title}</li>)}</ul>,
}));
vi.mock("../components/ArticlesPagination", () => ({
  default: ({ articlesCount }) => <nav data-testid="pagination">{articlesCount}</nav>,
}));
vi.mock("../services/getTags", () => ({ default: vi.fn() }));
vi.mock("web-vitals", () => ({
  onCLS: vi.fn(), onINP: vi.fn(), onFCP: vi.fn(), onLCP: vi.fn(), onTTFB: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("HomeArticles - partición de equivalencia por estado de carga", () => {
  test("mientras carga muestra el mensaje de carga", () => {
    useArticleList.mockReturnValue({ loading: true, setArticlesData: vi.fn() });
    render(<HomeArticles />);
    expect(screen.getByText("Loading articles list...")).toBeInTheDocument();
  });

  test("con artículos muestra la vista previa y la paginación", () => {
    useArticleList.mockReturnValue({
      loading: false,
      articles: [{ slug: "a", title: "Primero" }, { slug: "b", title: "Segundo" }],
      articlesCount: 2,
      setArticlesData: vi.fn(),
    });
    render(<HomeArticles />);
    expect(screen.getByText("Primero")).toBeInTheDocument();
    expect(screen.getByTestId("pagination")).toHaveTextContent("2");
    expect(useArticleList).toHaveBeenCalledWith({ location: "global", tabName: "global", tagName: "" });
  });

  test("sin artículos (o si el hook no devuelve lista) muestra el mensaje vacío", () => {
    useArticleList.mockReturnValue({ loading: false, setArticlesData: vi.fn() });
    render(<HomeArticles />);
    expect(screen.getByText("Articles not available.")).toBeInTheDocument();
  });
});

describe("PopularTags", () => {
  test("muestra las etiquetas que devuelve el servicio", async () => {
    getTags.mockResolvedValue(["qa", "testing"]);
    render(<PopularTags />);
    expect(screen.getByText("Loading tags...")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "qa" })).toBeInTheDocument();
  });

  test("si el servicio no devuelve un arreglo muestra que no hay etiquetas", async () => {
    getTags.mockResolvedValue(undefined);
    render(<PopularTags />);
    expect(await screen.findByText("Tags list not available")).toBeInTheDocument();
  });

  test("si el servicio falla registra el error y muestra que no hay etiquetas", async () => {
    getTags.mockRejectedValue("Network Error");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<PopularTags />);
    expect(await screen.findByText("Tags list not available")).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalledWith("Error loading tags:", "Network Error");
    errorSpy.mockRestore();
  });
});

describe("configuración de axios y métricas web", () => {
  test("axios usa la URL del backend por defecto cuando no hay VITE_API_URL", async () => {
    const axios = (await import("axios")).default;
    await import("../axiosConfig");
    expect(axios.defaults.baseURL).toBe(import.meta.env.VITE_API_URL || "http://localhost:3001");
  });

  test("reportWebVitals registra las 5 métricas de web-vitals v5", async () => {
    const vitals = await import("web-vitals");
    const { default: reportWebVitals } = await import("../reportWebVitals");
    const callback = vi.fn();

    reportWebVitals(callback);

    await vi.waitFor(() => expect(vitals.onTTFB).toHaveBeenCalledWith(callback));
    expect(vitals.onCLS).toHaveBeenCalledWith(callback);
    expect(vitals.onINP).toHaveBeenCalledWith(callback);
  });

  test("reportWebVitals sin callback no carga web-vitals", async () => {
    const vitals = await import("web-vitals");
    const { default: reportWebVitals } = await import("../reportWebVitals");
    reportWebVitals();
    expect(vitals.onCLS).not.toHaveBeenCalled();
  });
});
