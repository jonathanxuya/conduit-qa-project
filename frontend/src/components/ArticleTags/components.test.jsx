/**
 * Pruebas unitarias de componentes React.
 *
 * Dobles de prueba:
 *  - AuthContext.useAuth: mock. Permite simular usuario logueado/anónimo sin
 *    montar el AuthProvider real (que lee localStorage y llama a la API).
 *  - services/toggleFav: mock. El componente FavButton no debe hacer peticiones
 *    reales; verificamos que delega en el servicio con los parámetros correctos.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ArticleTags from "./ArticleTags";
import FavButton from "../FavButton";
import { useAuth } from "../../context/AuthContext";
import toggleFav from "../../services/toggleFav";

vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../services/toggleFav", () => ({ default: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("ArticleTags", () => {
  test("lista vacía no renderiza la lista de etiquetas", () => {
    const { container } = render(<ArticleTags tagList={[]} />);
    expect(container.querySelector("ul")).toBeNull();
  });

  test("renderiza una etiqueta por elemento", () => {
    render(<ArticleTags tagList={["qa", "testing"]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("qa")).toBeInTheDocument();
  });
});

describe("FavButton", () => {
  test("usuario anónimo: muestra alerta y no llama al servicio", async () => {
    useAuth.mockReturnValue({ headers: null, isAuth: false });
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    render(<FavButton slug="a" favorited={false} favoritesCount={3} />);
    await userEvent.click(screen.getByRole("button"));

    expect(alertSpy).toHaveBeenCalledWith("You need to login first");
    expect(toggleFav).not.toHaveBeenCalled();
  });

  test("usuario logueado: llama a toggleFav y pasa el resultado al handler", async () => {
    const headers = { Authorization: "Token t" };
    useAuth.mockReturnValue({ headers, isAuth: true });
    const updated = { slug: "a", favorited: true, favoritesCount: 4 };
    toggleFav.mockResolvedValue(updated);
    const handler = vi.fn();

    render(<FavButton slug="a" favorited={false} favoritesCount={3} handler={handler} />);
    await userEvent.click(screen.getByRole("button"));

    expect(toggleFav).toHaveBeenCalledWith({ slug: "a", favorited: false, headers });
    await waitFor(() => expect(handler).toHaveBeenCalledWith(updated));
  });

  test("muestra el contador y la clase active cuando ya es favorito", () => {
    useAuth.mockReturnValue({ headers: null, isAuth: true });
    render(<FavButton slug="a" favorited favoritesCount={7} />);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("( 7 )");
    expect(button).toHaveClass("active");
  });
});
