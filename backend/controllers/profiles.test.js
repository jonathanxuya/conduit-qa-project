// @vitest-environment node
/**
 * Pruebas unitarias de backend/controllers/profiles.js (ver perfil, seguir/dejar de seguir).
 * Doble de prueba: models.User como stub y helpers.appendFollowers como mock,
 * para aislar la lógica de la base de datos.
 */
const { stubModule, loadFresh, mockResponse } = require("../test-utils/doubles");
const realHelpers = require("../helper/helpers");
const { NotFoundError, UnauthorizedError } = require("../helper/customErrors");

const User = { findOne: vi.fn() };
const helpers = { ...realHelpers, appendFollowers: vi.fn() };
let ctrl;

beforeEach(() => {
  vi.clearAllMocks();
  stubModule("models/index.js", { User });
  stubModule("helper/helpers.js", helpers);
  ctrl = loadFresh("controllers/profiles.js");
});

test("getProfile de usuario inexistente -> NotFoundError", async () => {
  User.findOne.mockResolvedValue(null);
  const next = vi.fn();
  await ctrl.getProfile({ params: { username: "nadie" } }, mockResponse(), next);
  expect(next.mock.calls[0][0]).toBeInstanceOf(NotFoundError);
});

test("getProfile existente responde el perfil sin email", async () => {
  const profile = { username: "ana" };
  User.findOne.mockResolvedValue(profile);
  const res = mockResponse();

  await ctrl.getProfile({ params: { username: "ana" } }, res, vi.fn());

  expect(User.findOne).toHaveBeenCalledWith({ where: { username: "ana" }, attributes: { exclude: "email" } });
  expect(res.json).toHaveBeenCalledWith({ profile });
});

test("followToggler sin sesión -> UnauthorizedError", async () => {
  const next = vi.fn();
  await ctrl.followToggler({ method: "POST", params: { username: "ana" } }, mockResponse(), next);
  expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
});

test.each([
  ["POST", "addFollower", "removeFollower"],
  ["DELETE", "removeFollower", "addFollower"],
])("followToggler %s llama a %s", async (method, expected, notExpected) => {
  const profile = { addFollower: vi.fn(), removeFollower: vi.fn() };
  User.findOne.mockResolvedValue(profile);
  const me = { id: 1 };

  await ctrl.followToggler({ method, loggedUser: me, params: { username: "ana" } }, mockResponse(), vi.fn());

  expect(profile[expected]).toHaveBeenCalledWith(me);
  expect(profile[notExpected]).not.toHaveBeenCalled();
});
