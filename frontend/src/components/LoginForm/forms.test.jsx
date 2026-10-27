/**
 * Pruebas unitarias de los componentes modificados en la remediación de SonarCloud (E12):
 * LoginForm, SignUpForm, CommentEditor y DropdownMenu.
 *
 * Dobles de prueba:
 *  - AuthContext.useAuth: mock. Simula sesión iniciada/anónima sin el AuthProvider real.
 *  - services (userLogin, userSignUp, postComment): mocks. Los formularios no deben
 *    hacer peticiones HTTP; se verifica que delegan en el servicio con los datos capturados.
 *  - react-router-dom.useNavigate: mock. Permite verificar la redirección tras el login.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import LoginForm from "../LoginForm";
import SignUpForm from "../SignUpForm";
import CommentEditor from "../CommentEditor";
import DropdownMenu from "../Navbar/DropdownMenu";
import { useAuth } from "../../context/AuthContext";
import userLogin from "../../services/userLogin";
import userSignUp from "../../services/userSignUp";
import postComment from "../../services/postComment";

const navigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../services/userLogin", () => ({ default: vi.fn() }));
vi.mock("../../services/userSignUp", () => ({ default: vi.fn() }));
vi.mock("../../services/postComment", () => ({ default: vi.fn() }));

const setAuthState = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({
    headers: { Authorization: "Token t" },
    isAuth: true,
    loggedUser: { username: "ana", image: null },
    setAuthState,
  });
});

describe("LoginForm", () => {
  test("el botón es de tipo submit y envía las credenciales al servicio", async () => {
    userLogin.mockResolvedValue({ isAuth: true });
    render(<LoginForm onError={vi.fn()} />, { wrapper: MemoryRouter });

    await userEvent.type(screen.getByPlaceholderText("Email"), "a@a.com");
    await userEvent.type(screen.getByPlaceholderText("Password"), "12345");
    const button = screen.getByRole("button", { name: "Login" });
    expect(button).toHaveAttribute("type", "submit");
    await userEvent.click(button);

    expect(userLogin).toHaveBeenCalledWith({ email: "a@a.com", password: "12345" });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
  });

  test("credenciales inválidas llaman a onError y no redirigen", async () => {
    userLogin.mockRejectedValue("Wrong email/password combination");
    const onError = vi.fn();
    render(<LoginForm onError={onError} />, { wrapper: MemoryRouter });

    await userEvent.type(screen.getByPlaceholderText("Email"), "a@a.com");
    await userEvent.type(screen.getByPlaceholderText("Password"), "malmal");
    await userEvent.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("Wrong email/password combination"));
    expect(navigate).not.toHaveBeenCalled();
  });

  test("el campo email ya no recibe foco automático (accesibilidad)", () => {
    render(<LoginForm onError={vi.fn()} />, { wrapper: MemoryRouter });
    expect(screen.getByPlaceholderText("Email")).not.toHaveFocus();
  });
});

describe("SignUpForm", () => {
  test("envía username, email y password al servicio de registro", async () => {
    userSignUp.mockResolvedValue({ isAuth: true });
    render(<SignUpForm onError={vi.fn()} />, { wrapper: MemoryRouter });

    await userEvent.type(screen.getByPlaceholderText("Your Name"), "ana");
    await userEvent.type(screen.getByPlaceholderText("Email"), "a@a.com");
    await userEvent.type(screen.getByPlaceholderText("Password"), "12345");
    const button = screen.getByRole("button", { name: "Sign up" });
    expect(button).toHaveAttribute("type", "submit");
    await userEvent.click(button);

    expect(userSignUp).toHaveBeenCalledWith({ username: "ana", email: "a@a.com", password: "12345" });
    await waitFor(() => expect(setAuthState).toHaveBeenCalled());
  });
});

describe("CommentEditor", () => {
  function renderEditor(updateComments = vi.fn()) {
    render(
      <MemoryRouter initialEntries={["/article/mi-articulo"]}>
        <Routes>
          <Route path="/article/:slug" element={<CommentEditor updateComments={updateComments} />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  test("usuario anónimo ve enlaces para iniciar sesión en lugar del formulario", () => {
    useAuth.mockReturnValue({ isAuth: false, loggedUser: null });
    renderEditor();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("comentario vacío o solo espacios no se envía", async () => {
    renderEditor();
    await userEvent.type(screen.getByPlaceholderText("Write a comment..."), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Post Comment" }));
    expect(postComment).not.toHaveBeenCalled();
  });

  test("comentario válido se publica en el artículo de la URL", async () => {
    postComment.mockResolvedValue([{ id: 1, body: "Hola" }]);
    renderEditor();

    await userEvent.type(screen.getByPlaceholderText("Write a comment..."), "Hola");
    const button = screen.getByRole("button", { name: "Post Comment" });
    expect(button).toHaveAttribute("type", "submit");
    await userEvent.click(button);

    expect(postComment).toHaveBeenCalledWith({ body: "Hola", headers: { Authorization: "Token t" }, slug: "mi-articulo" });
  });
});

describe("DropdownMenu - transición de estados (cerrado <-> abierto)", () => {
  function renderMenu() {
    render(<DropdownMenu />, { wrapper: MemoryRouter });
    return screen.getByRole("button", { name: /ana/ });
  }

  test("el disparador es un botón nativo accesible, inicialmente cerrado", () => {
    const toggle = renderMenu();
    expect(toggle).toHaveAttribute("type", "button");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Profile").closest(".dropdown-menu")).toHaveStyle({ display: "none" });
  });

  test("clic abre el menú y un segundo clic lo cierra", async () => {
    const toggle = renderMenu();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Profile").closest(".dropdown-menu")).toHaveStyle({ display: "block" });

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("Logout limpia la sesión mediante setAuthState", async () => {
    const toggle = renderMenu();
    await userEvent.click(toggle);
    await userEvent.click(screen.getByText("Logout"));
    expect(setAuthState).toHaveBeenCalled();
  });
});
